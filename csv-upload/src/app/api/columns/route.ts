"use server";

import { excelToObject } from "@/lib/excelConverter";

export async function POST(req: Request): Promise<Response> {
  try {
    const formData = await req.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return Response.json({ error: "No file provided" }, { status: 400 });
    }

    const inputBuffer = Buffer.from(await file.arrayBuffer());
    const records = excelToObject(inputBuffer);

    if (records.length === 0) {
      return Response.json({ error: "File is empty" }, { status: 400 });
    }

    const columns = Object.keys(records[0]);

    return Response.json({ columns });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 });
  }
}