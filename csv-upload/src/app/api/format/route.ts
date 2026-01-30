// api/format/route.ts
"use server";

import { NextResponse } from "next/server";
import { ResultRecord } from "../upload/route";
import { BookType } from "xlsx";
import { objectToExcel } from "@/lib/excelConverter";

/**
 * 
 * @param req 
 * @returns 
 */
export async function POST(req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const outputFormat = (searchParams.get("outputFormat") ?? "csv").toLowerCase();
    const threshold: number = Number((searchParams.get("threshold") ?? 75));
    const action: "delete" | "ignore" | "useDefault" = (searchParams.get("action") ?? "ignore") as "delete" | "ignore" | "useDefault";
    const body = await req.json() as {
        records: any[],
        genderData: ResultRecord[],
        maleAddressLine: string,
        femaleAddressLine: string,
        defaultAddressLine: string,
    }

    // combines the ResultRecord data with original records (by generated ID) and applies address line logic
    const finalData = body.records.map(r => {
      const genderRow = body.genderData.find(g => Number(g.id) === Number(r.id));
      const probability = genderRow?.probability ? Number(genderRow.probability) : 0;
      const gender = genderRow?.gender;
      const ignoreInformation =
        action === "ignore" && probability <= threshold;
      const useDefault =
        action === "useDefault" &&
        probability < threshold &&
        !ignoreInformation;
      const address =
        !ignoreInformation && gender === "male" && !useDefault
          ? applyPlaceholders(r.firstName, r.lastName, body.maleAddressLine)
          : !ignoreInformation && gender === "female" && !useDefault
            ? applyPlaceholders(r.firstName, r.lastName, body.femaleAddressLine)
            : useDefault
              ? applyPlaceholders(r.firstName, r.lastName, body.defaultAddressLine)
              : "";
      const { id, ...rest } = r; // removes internal id again
      
      return {
        ...rest,
        gender,
        probability: probability + "%",
        addressLine: address
      };
    })
    .filter(r => {
      if (action === "delete") {
        return Number(r.probability.replaceAll("%", "")) >= threshold;
      }
      return true;
    });

    // turns the object into the requested file format
    const outputBuffer = await objectToExcel(finalData, outputFormat as BookType);
    const base64 = Buffer.from(outputBuffer).toString("base64");

    return NextResponse.json({
      file: { 
        base64
      }
    });
}

function applyPlaceholders(firstName: string, lastName: string, input: string): string {
  return input
    .replaceAll("%firstName%", firstName)
    .replaceAll("%lastName%", lastName);
}