// api/formatt/route.ts

import { NextResponse } from "next/server";
import { ResultRecord } from "../upload/route";
import { BookType } from "xlsx";
import { objectToExcel } from "@/lib/excelConverter";


export async function POST(req: Request): Promise<Response> {
    const { searchParams } = new URL(req.url);
    const outputFormat = (searchParams.get("outputFormat") ?? "csv").toLowerCase();
    const threshold: number = Number((searchParams.get("threshold") ?? 75));
    const action: "delete" | "ignore" = (searchParams.get("action") ?? "ignore") as "delete" | "ignore";
    const adressLang: "de" | "en" = (searchParams.get("addressLang") ?? "en") as "de" | "en";
    const body = await req.json() as {
        records: any[],
        genderData: ResultRecord[],
    }

    const finalData = body.records.map(r => {
      const genderRow = body.genderData.find(g => g.id === r.id);
      const probability = genderRow?.probability ? Number(genderRow.probability) : 0;
      const gender = genderRow?.gender;
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
