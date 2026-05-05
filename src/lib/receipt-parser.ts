import { DINE_IN_CHANNELS, ReceiptRecord, SalesMetrics, TAKEAWAY_CHANNELS } from "./types";

const ZERO: SalesMetrics = { flow: 0, amount: 0, count: 0 };

const CHANNEL_ALIASES: Record<string, string[]> = {
  微信小程序: ["微信小程序", "微信 小程序", "微信小程", "微信"],
  进钱宝: ["进钱宝", "进线宝", "进銭宝", "进钱"],
  抖音小程序: ["抖音小程序", "抖音 小程序", "抖音小程", "抖音"],
  支付宝小程序: ["支付宝小程序", "支付宝 小程序", "支付宝小程"],
  饿了么外卖: ["饿了么外卖", "饿了么 外卖", "饿了么", "饿了么外賣"],
  美团外卖: ["美团外卖", "美团 外卖", "美團外賣", "美团"],
  京东秒送: ["京东秒送", "京東秒送", "京东 秒送"],
};

export function normalizeOcrText(input: string): string {
  return input
    .replace(/\r/g, "\n")
    .replace(/[：﹕]/g, ":")
    .replace(/[，]/g, ",")
    .replace(/[|]/g, " ")
    .replace(/[¥￥]/g, "")
    .replace(/元/g, "元")
    .replace(/\t/g, " ")
    .replace(/ {2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseReceiptText(rawText: string, fileName = "receipt"): ReceiptRecord {
  const text = normalizeOcrText(rawText);
  const warnings: string[] = [];
  const parsedDate = parseDate(text);

  if (!parsedDate) {
    warnings.push("未能识别日期，请在预览中手动修正。");
  }

  const total = parseRevenueStats(text, warnings);
  const channels = parseChannels(text);
  const dineIn = sumChannels(channels, DINE_IN_CHANNELS);
  const takeaway = sumChannels(channels, TAKEAWAY_CHANNELS);

  for (const channel of DINE_IN_CHANNELS) {
    if (!channels.has(channel)) warnings.push(`未识别到堂食渠道：${channel}`);
  }
  for (const channel of TAKEAWAY_CHANNELS) {
    if (!channels.has(channel)) warnings.push(`未识别到外卖渠道：${channel}`);
  }

  const fallback = new Date();
  const year = parsedDate?.year ?? fallback.getFullYear();
  const month = parsedDate?.month ?? fallback.getMonth() + 1;
  const day = parsedDate?.day ?? 1;

  return {
    id: `${sanitizeId(fileName)}-${year}-${month}-${day}-${hashText(text)}`,
    fileName,
    date: `${year}-${pad2(month)}-${pad2(day)}`,
    year,
    month,
    day,
    total,
    dineIn,
    takeaway,
    rawText: text,
    warnings,
  };
}

export function parseDate(text: string): { year: number; month: number; day: number } | null {
  const candidates = [
    /日期\s*[:：]?\s*(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/,
    /(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})\s+\d{1,2}:\d{2}/,
    /(20\d{2})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})/,
  ];

  for (const re of candidates) {
    const match = text.match(re);
    if (!match) continue;
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (isValidDateParts(year, month, day)) return { year, month, day };
  }
  return null;
}

function parseRevenueStats(text: string, warnings: string[]): SalesMetrics {
  const revenueBlock = getBlock(text, ["营收统计", "營收統計"], ["渠道统计", "渠道統計", "堂食订单支付统计"]);
  const searchIn = revenueBlock || text;
  const flow = findLabeledNumber(searchIn, ["标准流水", "標準流水", "流水"]);
  const amount = findLabeledNumber(searchIn, ["实收", "實收"]);
  const count = findLabeledNumber(searchIn, ["有效订单", "有效訂單", "有效订单数", "订单"]);

  if (flow == null) warnings.push("未能识别营收统计的标准流水。");
  if (amount == null) warnings.push("未能识别营收统计的实收。");
  if (count == null) warnings.push("未能识别营收统计的有效订单。");

  return {
    flow: round2(flow ?? 0),
    amount: round2(amount ?? 0),
    count: Math.round(count ?? 0),
  };
}

function parseChannels(text: string): Map<string, SalesMetrics> {
  const channels = new Map<string, SalesMetrics>();
  const channelBlock = getBlock(text, ["渠道统计", "渠道統計"], ["堂食订单支付统计", "堂食訂單支付統計", "支付统计"]);
  const searchIn = channelBlock || text;
  const lines = searchIn
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  for (const canonical of [...DINE_IN_CHANNELS, ...TAKEAWAY_CHANNELS]) {
    const aliases = CHANNEL_ALIASES[canonical] ?? [canonical];
    const line = findChannelLine(lines, aliases);
    const metrics = line ? parseChannelLine(line, canonical, aliases) : null;
    if (metrics) channels.set(canonical, metrics);
  }

  return channels;
}

function findChannelLine(lines: string[], aliases: string[]): string | null {
  const compactAliases = aliases.map(compactText);
  for (const line of lines) {
    const compactLine = compactText(line);
    if (compactAliases.some((alias) => compactLine.includes(alias))) return line;
  }
  return null;
}

function parseChannelLine(line: string, canonical: string, aliases: string[]): SalesMetrics | null {
  let tail = line;
  for (const alias of aliases) {
    const idx = compactText(line).indexOf(compactText(alias));
    if (idx >= 0) {
      tail = line.slice(Math.min(line.length, alias.length));
      break;
    }
  }

  const numbers = [...tail.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (numbers.length < 3) {
    const allNumbers = [...line.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
    if (allNumbers.length < 3) return null;
    return {
      count: Math.round(allNumbers[0] ?? 0),
      flow: round2(allNumbers[1] ?? 0),
      amount: round2(allNumbers[2] ?? 0),
    };
  }

  return {
    count: Math.round(numbers[0] ?? 0),
    flow: round2(numbers[1] ?? 0),
    amount: round2(numbers[2] ?? 0),
  };
}

function sumChannels(
  channels: Map<string, SalesMetrics>,
  names: readonly string[],
): SalesMetrics {
  return names.reduce(
    (acc, name) => {
      const metrics = channels.get(name) ?? ZERO;
      return {
        flow: round2(acc.flow + metrics.flow),
        amount: round2(acc.amount + metrics.amount),
        count: acc.count + metrics.count,
      };
    },
    { ...ZERO },
  );
}

function getBlock(text: string, starts: string[], ends: string[]): string | null {
  const startPattern = starts.map(escapeRegExp).join("|");
  const endPattern = ends.map(escapeRegExp).join("|");
  const re = new RegExp(`(?:${startPattern})([\\s\\S]*?)(?=${endPattern}|$)`, "i");
  const match = text.match(re);
  return match?.[1]?.trim() ?? null;
}

function findLabeledNumber(text: string, labels: string[]): number | null {
  for (const label of labels) {
    const escaped = escapeRegExp(label);
    const patterns = [
      new RegExp(`${escaped}\\s*[:：]?\\s*(-?\\d+(?:\\.\\d+)?)`, "i"),
      new RegExp(`${escaped}[^\\d-]{0,10}(-?\\d+(?:\\.\\d+)?)`, "i"),
    ];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) return Number(match[1]);
    }
  }
  return null;
}

function compactText(input: string): string {
  return input.replace(/\s+/g, "").replace(/[：:]/g, "");
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return false;
  return day >= 1 && day <= daysInMonth(year, month);
}

export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function sanitizeId(value: string): string {
  return value.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]+/g, "-").slice(0, 60);
}

function hashText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return hash.toString(16);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
