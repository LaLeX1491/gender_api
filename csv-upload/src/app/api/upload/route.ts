"use server";

import { BookType } from "xlsx";
import { excelToObject, objectToExcel } from "@/lib/excelConverter";
import getFormat from "@/lib/extractFileFormat";
import pLimit from "p-limit"

const ALLOWED_FORMATS: Record<string, { contentType: string; bookType?: BookType }> = {
  csv: { contentType: "text/csv" },
  xlsx: { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", bookType: "xlsx" },
  xls: { contentType: "application/vnd.ms-excel", bookType: "xls" },
  xla: { contentType: "application/vnd.ms-excel", bookType: "xla" },
  xlsb: { contentType: "application/vnd.ms-excel", bookType: "xlsb" },
  xlsm: { contentType: "application/vnd.ms-excel", bookType: "xlsm" },
};
 
type InputRecord = {id: number, firstName: string, lastName: string, location: string};
type ResultRecord = {id: number, gender: string, probability: number};

export type StreamStatus = "PROGRESS" | "STATUS" | "ERROR" | "DONE";

/**
 *  - output same format as input || done
 *  - add optional threshold / file end || done
 *  - convert object / csv to json object before sending to n8n
 *  - convert response json back to requested format
 *  - move n8n batching to here / requests sequential or parallel
 *  - add process feedback
 *  - only 6 steps (just the ai processing ones)
 * 
 * extra changes
 * - index wird vom frontend geführt
 * - anrede deutsch / englisch
 */

/**
 * POST /api/upload
 * Accepts CSV/XLSX/XLS, sends firstName/lastName/location to n8n,
 * appends gender & probability, converts to requested output format.
 */
export async function POST(req: Request): Promise<Response> {
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: StreamStatus, data: unknown) => {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
        );
      };

      try {
        const formData = await req.formData();
        const { searchParams } = new URL(req.url);
        const outputFormat = (searchParams.get("outputFormat") ?? "csv").toLowerCase();
        const threshold: number = Number((searchParams.get("threshold") ?? 75));
        const action: "delete" | "ignore" = (searchParams.get("action") ?? "ignore") as "delete" | "ignore";
        const adressLang: "de" | "en" = (searchParams.get("addressLang") ?? "en") as "de" | "en";

        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
          send("ERROR", { status: 400, message: "No file provided."});
          controller.close();
          return;
        }

        if (!getFormat(file) || !(getFormat(file)! in ALLOWED_FORMATS)) {
          send("ERROR", { status: 400, message: "Wrong format!"});
          controller.close();
          return;
        }

        const inputBuffer = Buffer.from(await file.arrayBuffer());
        const records: any[] = excelToObject(inputBuffer).map((o, idx) => ({
          id: idx,
          ...o
        }));

        const batches: any[] = batch(
          records.map(({ id, firstName, lastName, location}) => ({
            id,
            firstName,
            lastName,
            location
          })),
          100
        );

        const genderData: ResultRecord[] = await processBatches(batches, (completed, total) => {
          send("PROGRESS", { step: completed, total: total });
        });

        const finalData = records.map(r => {
          const genderRow = genderData[r.id];
          const probability = genderRow?.probability ? Number(genderRow.probability) : 0;
          const gender = genderRow.gender;

          const address = {
            en: { male: "Dear Mr. ", female: "Dear Mrs. " },
            de: { male: "Sehr geehrter Herr ", female: "Sehr geehrte Frau " }
          } as const;

          type Language = keyof typeof address;
          type Gender = keyof typeof address.en;

          const { id, ...rest } = r;

          return {
            ...rest,
            gender,
            probability: probability + "%",
            addressLine: address[adressLang as Language]?.[gender as Gender] 
              ? address[adressLang as Language]?.[gender as Gender] + r.lastName 
              : ""
          }
        }).filter(r => {
          if (action === "delete") {
            return r.probability.replaceAll("%", "") >= threshold;
          }
          return true;
        });

        const outputBuffer = await objectToExcel(finalData, outputFormat as BookType);
        const base64 = Buffer.from(outputBuffer).toString("base64");

        send("DONE", { file: base64 });
        controller.close();
      } catch (err) {
        send("ERROR", {message: (err as Error).message});
        controller.close();
      }
    }
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}

function batch(obj: any[], size: number): any[] {
  let bundles: any[] = [];
  let currentBundle: any[] = [];

  if(obj.length <= size) return [{ bundle: obj }];

  obj.forEach(item => {
    currentBundle.push(item);
    
    if(currentBundle.length === size) {
      bundles.push(currentBundle)
      currentBundle = [];
    }
  });

  if(currentBundle.length > 0) bundles.push(currentBundle)

  return bundles;
}

async function processBatches(batches: InputRecord[], onProgress: (completed: number, total: number) => void): Promise<ResultRecord[]> {
  const limit = pLimit(5);
  let completed = 0;
  const total = batches.length;
  const results: ResultRecord[] = [];

  const promises = batches.map(batch => 
    limit(async () => {
      const res = await fetch(
        "https://csv-get-gender.app.n8n.cloud/webhook/gender-prediction-webhook",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(batch)
        }
      );
      const data: ResultRecord[] = await res.json();
      results.push(...data);
      completed++;
      onProgress(completed, total);
    })
  );

  await Promise.all(promises);
  return results;
}