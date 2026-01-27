// api/format/route.ts

import { NextResponse } from "next/server";
import { ResultRecord } from "../upload/route";
import { BookType } from "xlsx";
import { objectToExcel } from "@/lib/excelConverter";


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

    const finalData = body.records.map(r => {
      const genderRow = body.genderData.find(g => Number(g.id) === Number(r.id));
      const probability = genderRow?.probability ? Number(genderRow.probability) : 0;
      const gender = genderRow?.gender;
      const ignoreInformation = probability < threshold && action === "ignore";

      const address = gender === "male" 
        ? applyPlaceholders(r.firstName, r.lastName, body.maleAddressLine) 
        : gender === "female"
          ? applyPlaceholders(r.firstName, r.lastName, body.femaleAddressLine)
          : action === "useDefault" && !ignoreInformation 
            ? applyPlaceholders(r.firstName, r.lastName, body.defaultAddressLine)
            : "";

      const { id, ...rest } = r;
      return {
        ...rest,
        gender,
        probability: probability + "%",
        addressLine: address
      }
    }).filter(r => {
      if (action === "delete") {
        return Number(r.probability.replaceAll("%", "")) >= threshold;
      }
      return true;
    });
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