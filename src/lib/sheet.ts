import type { ReceiptRecord, SalesMetrics, SheetRow } from "./types";
import { daysInMonth, round2 } from "./receipt-parser";

export function monthOptions(records: ReceiptRecord[]) {
  const map = new Map<string, { year: number; month: number; label: string; count: number }>();
  for (const record of records) {
    const key = `${record.year}-${record.month}`;
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, {
        year: record.year,
        month: record.month,
        label: `${record.year}年${record.month}月`,
        count: 1,
      });
    }
  }
  return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month);
}

export function defaultTargetMonth(records: ReceiptRecord[]) {
  const options = monthOptions(records);
  if (options.length === 0) {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() + 1 };
  }
  return options.sort((a, b) => b.count - a.count || a.year - b.year || a.month - b.month)[0];
}

export function buildSheetRows(records: ReceiptRecord[], year: number, month: number): SheetRow[] {
  const totalDays = daysInMonth(year, month);
  const rows: SheetRow[] = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const record = records.find(
      (item) => item.year === year && item.month === month && item.day === day,
    );
    rows.push({
      day,
      total: copyMetrics(record?.total),
      dineIn: copyMetrics(record?.dineIn),
      takeaway: copyMetrics(record?.takeaway),
      sourceFileName: record?.fileName,
      warnings: record?.warnings ?? [],
    });
  }
  return rows;
}

export function findDuplicateDays(records: ReceiptRecord[]) {
  const counts = new Map<string, ReceiptRecord[]>();
  for (const record of records) {
    const key = `${record.year}-${record.month}-${record.day}`;
    const list = counts.get(key) ?? [];
    list.push(record);
    counts.set(key, list);
  }
  return [...counts.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({ key, list }));
}

export function sumRows(rows: SheetRow[]) {
  return rows.reduce(
    (acc, row) => ({
      total: addMetrics(acc.total, row.total),
      dineIn: addMetrics(acc.dineIn, row.dineIn),
      takeaway: addMetrics(acc.takeaway, row.takeaway),
    }),
    {
      total: emptyMetrics(),
      dineIn: emptyMetrics(),
      takeaway: emptyMetrics(),
    },
  );
}

export function addMetrics(a: SalesMetrics, b: SalesMetrics): SalesMetrics {
  return {
    flow: round2(a.flow + b.flow),
    amount: round2(a.amount + b.amount),
    count: a.count + b.count,
  };
}

export function emptyMetrics(): SalesMetrics {
  return { flow: 0, amount: 0, count: 0 };
}

function copyMetrics(metrics?: SalesMetrics): SalesMetrics {
  return metrics ? { ...metrics } : emptyMetrics();
}
