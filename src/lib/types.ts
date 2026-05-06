export type Money = number;

export interface SalesMetrics {
  flow: Money;
  amount: Money;
  count: number;
}

export interface ReceiptRecord {
  id: string;
  fileName: string;
  date: string;
  year: number;
  month: number;
  day: number;
  total: SalesMetrics;
  dineIn: SalesMetrics;
  takeaway: SalesMetrics;
  rawText: string;
  warnings: string[];
}

export interface OcrResponse {
  records: ReceiptRecord[];
  warnings: string[];
}

export interface SheetRow {
  day: number;
  total: SalesMetrics;
  dineIn: SalesMetrics;
  takeaway: SalesMetrics;
  sourceFileName?: string;
  warnings?: string[];
}

export interface EditableRecord extends ReceiptRecord {
  selected: boolean;
}

export const DINE_IN_CHANNELS = [
  "\u5fae\u4fe1\u5c0f\u7a0b\u5e8f",
  "\u8fdb\u94b1\u5b9d",
  "\u6296\u97f3\u5c0f\u7a0b\u5e8f",
  "\u652f\u4ed8\u5b9d\u5c0f\u7a0b\u5e8f",
] as const;

export const TAKEAWAY_CHANNELS = ["\u997f\u4e86\u4e48\u5916\u5356", "\u7f8e\u56e2\u5916\u5356", "\u4eac\u4e1c\u79d2\u9001"] as const;
