import * as XLSX from "xlsx";

/**
 * Converts Excel buffer to array of objects.
 * Removes completely empty columns.
 */
export function excelToObject(buffer: Buffer): Record<string, any>[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  const data: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, {
    defval: "",
    blankrows: false,
    raw: false,
  });

  if (data.length === 0) return [];

  const columns = Object.keys(data[0]);
  const nonEmptyColumns = columns.filter(col =>
    data.some(row => row[col] !== null && row[col] !== undefined && row[col] !== "")
  );

  return data.map(row => {
    const filteredRow: Record<string, any> = {};
    for (const col of nonEmptyColumns) {
      filteredRow[col] = row[col];
    }
    return filteredRow;
  });
}

/**
 * Converts array of objects to Excel buffer.
 */
export function objectToExcel(data: Record<string, any>[], format: XLSX.BookType = "xlsx"): Buffer {
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");

  return XLSX.write(workbook, {
    type: "buffer",
    bookType: format,
  });
}
