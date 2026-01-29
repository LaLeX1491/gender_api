// /api/upload/route.ts
"use server";

import { BookType } from "xlsx";
import { excelToObject } from "@/lib/excelConverter";
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
 
export type InputRecord = {id: number, firstName: string, lastName: string, location: string};
export type ResultRecord = {id: number, gender: string, probability: number};

export type StreamStatus = "PROGRESS" | "STATUS" | "ERROR" | "DONE";

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

        const firstNameColumn = formData.get("firstNameColumn") as string;
        const lastNameColumn = formData.get("lastNameColumn") as string;
        const locationColumn = formData.get("locationColumn") as string;

        if (!firstNameColumn || !lastNameColumn || !locationColumn) {
          send("ERROR", { status: 400, message: "Column mapping missing!"});
          controller.close();
          return;
        }

        const inputBuffer = Buffer.from(await file.arrayBuffer());
        const rawRecords: any[] = excelToObject(inputBuffer);

        // Validate that columns exist
        if (rawRecords.length > 0) {
          const firstRecord = rawRecords[0];
          if (!firstRecord[firstNameColumn]) {
            send("ERROR", { status: 400, message: `Column "${firstNameColumn}" not found in file!`});
            controller.close();
            return;
          }
          if (!firstRecord[lastNameColumn]) {
            send("ERROR", { status: 400, message: `Column "${lastNameColumn}" not found in file!`});
            controller.close();
            return;
          }
          if (!firstRecord[locationColumn]) {
            send("ERROR", { status: 400, message: `Column "${locationColumn}" not found in file!`});
            controller.close();
            return;
          }
        }

        const records: any[] = rawRecords.map((o, idx) => ({
          id: idx,
          ...o
        }));

        const batches: any[] = batch(
          records.map((r) => ({
            id: r.id,
            firstName: r[firstNameColumn],
            lastName: r[lastNameColumn],
            location: r[locationColumn]
          })),
          100
        );

        send("PROGRESS", { step: 1, total: batches.length+1 });

        const genderData: ResultRecord[] = await processBatches(batches, (completed, total) => {
          send("PROGRESS", { step: completed+1, total: total+1 });
        });

        send("DONE", { json: genderData, records: records});
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