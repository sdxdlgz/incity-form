import type { SheetRow } from "./types";
import { sumRows } from "./sheet";

export async function exportPerformanceWorkbook(rows: SheetRow[], year: number, month: number) {
  const XLSX = await import("xlsx");
  const aoa: (string | number)[][] = buildSheetAoa(rows);
  const worksheet = XLSX.utils.aoa_to_sheet(aoa);
  worksheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    { s: { r: 3, c: 1 }, e: { r: 3, c: 3 } },
    { s: { r: 3, c: 4 }, e: { r: 3, c: 6 } },
    { s: { r: 3, c: 7 }, e: { r: 3, c: 9 } },
    { s: { r: 3, c: 0 }, e: { r: 4, c: 0 } },
  ];
  worksheet["!cols"] = [
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
    { wch: 12 },
    { wch: 12 },
    { wch: 8 },
  ];

  applyStyles(worksheet, aoa.length);

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "商场业绩表");
  XLSX.writeFile(workbook, `印象城${year}年${month}月业绩表.xlsx`, { compression: true });
}

function buildSheetAoa(rows: SheetRow[]): (string | number)[][] {
  const totals = sumRows(rows);
  return [
    ["商场业绩表"],
    [],
    [],
    ["日期", "月总销售情况", "", "", "堂食销售情况", "", "", "外卖销售情况", "", ""],
    ["", "总流水", "销售额", "笔数", "流水", "销售额", "笔数", "流水", "销售额", "笔数"],
    ...rows.map((row) => [
      row.day,
      valueOrBlank(row.total.flow),
      valueOrBlank(row.total.amount),
      valueOrBlank(row.total.count),
      valueOrBlank(row.dineIn.flow),
      valueOrBlank(row.dineIn.amount),
      valueOrBlank(row.dineIn.count),
      valueOrBlank(row.takeaway.flow),
      valueOrBlank(row.takeaway.amount),
      valueOrBlank(row.takeaway.count),
    ]),
    [],
    [
      "合计",
      totals.total.flow,
      totals.total.amount,
      totals.total.count,
      totals.dineIn.flow,
      totals.dineIn.amount,
      totals.dineIn.count,
      totals.takeaway.flow,
      totals.takeaway.amount,
      totals.takeaway.count,
    ],
  ];
}

function valueOrBlank(value: number) {
  return value === 0 ? "" : value;
}

function applyStyles(worksheet: Record<string, unknown>, rowCount: number) {
  const range = worksheet["!ref"] as string | undefined;
  if (!range) return;
  for (let r = 0; r < rowCount; r += 1) {
    for (let c = 0; c < 10; c += 1) {
      const address = encodeCell(r, c);
      const cell = worksheet[address] as Record<string, unknown> | undefined;
      if (!cell) continue;
      cell.s = {
        alignment: { horizontal: "center", vertical: "center" },
        border: {
          top: { style: "thin", color: { rgb: "E9A8B4" } },
          bottom: { style: "thin", color: { rgb: "E9A8B4" } },
          left: { style: "thin", color: { rgb: "E9A8B4" } },
          right: { style: "thin", color: { rgb: "E9A8B4" } },
        },
      };
      if (r === 0) {
        cell.s = { ...(cell.s as object), font: { bold: true, sz: 16 } };
      }
      if (r === 3 || r === 4) {
        cell.s = {
          ...(cell.s as object),
          font: { bold: true },
          fill: { fgColor: { rgb: "F7DFE3" } },
        };
      }
      if (r === rowCount - 1) {
        cell.s = { ...(cell.s as object), font: { bold: true }, fill: { fgColor: { rgb: "F7F7F7" } } };
      }
    }
  }
}

function encodeCell(r: number, c: number): string {
  let col = "";
  let n = c;
  do {
    col = String.fromCharCode(65 + (n % 26)) + col;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `${col}${r + 1}`;
}
