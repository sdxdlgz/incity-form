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
  "微信小程序",
  "进钱宝",
  "抖音小程序",
  "支付宝小程序",
] as const;

export const TAKEAWAY_CHANNELS = ["饿了么外卖", "美团外卖", "京东秒送"] as const;
