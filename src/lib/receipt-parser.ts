import { DINE_IN_CHANNELS, ReceiptRecord, SalesMetrics, TAKEAWAY_CHANNELS } from "./types";

const ZERO: SalesMetrics = { flow: 0, amount: 0, count: 0 };

const CHANNEL_ALIASES: Record<string, string[]> = {
  ["\u5fae\u4fe1\u5c0f\u7a0b\u5e8f"]: ["\u5fae\u4fe1\u5c0f\u7a0b\u5e8f", "\u5fae\u4fe1 \u5c0f\u7a0b\u5e8f", "\u5fae\u4fe1\u5c0f\u7a0b", "\u5fae\u4fe1"],
  ["\u8fdb\u94b1\u5b9d"]: ["\u8fdb\u94b1\u5b9d", "\u8fdb\u7ebf\u5b9d", "\u8fdb\u94b1", "\u8fdb\u94b1\u5b9d\u652f\u4ed8"],
  ["\u6296\u97f3\u5c0f\u7a0b\u5e8f"]: ["\u6296\u97f3\u5c0f\u7a0b\u5e8f", "\u6296\u97f3 \u5c0f\u7a0b\u5e8f", "\u6296\u97f3\u5c0f\u7a0b", "\u6296\u97f3"],
  ["\u652f\u4ed8\u5b9d\u5c0f\u7a0b\u5e8f"]: ["\u652f\u4ed8\u5b9d\u5c0f\u7a0b\u5e8f", "\u652f\u4ed8\u5b9d \u5c0f\u7a0b\u5e8f", "\u652f\u4ed8\u5b9d\u5c0f\u7a0b", "\u652f\u4ed8\u5b9d"],
  ["\u997f\u4e86\u4e48\u5916\u5356"]: ["\u997f\u4e86\u4e48\u5916\u5356", "\u997f\u4e86\u4e48 \u5916\u5356", "\u997f\u4e86\u4e48"],
  ["\u7f8e\u56e2\u5916\u5356"]: ["\u7f8e\u56e2\u5916\u5356", "\u7f8e\u56e2 \u5916\u5356", "\u7f8e\u56e2"],
  ["\u4eac\u4e1c\u79d2\u9001"]: ["\u4eac\u4e1c\u79d2\u9001", "\u4eac\u4e1c \u79d2\u9001", "\u4eac\u4e1c"],
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
  const channelBlock = getBlock(text, ["\u6e20\u9053\u7edf\u8ba1", "\u6e20\u9053\u7d71\u8a08"], ["\u5802\u98df\u8ba2\u5355\u652f\u4ed8\u7edf\u8ba1", "\u5802\u98df\u8a02\u55ae\u652f\u4ed8\u7d71\u8a08", "\u5802\u98df\u8ba2\u5355", "\u652f\u4ed8\u7edf\u8ba1"]);
  const searchIn = channelBlock || text;
  const htmlSearchIn = extractOriginalBlock(text, ["\u6e20\u9053\u7edf\u8ba1", "\u6e20\u9053\u7d71\u8a08"], ["\u5802\u98df\u8ba2\u5355\u652f\u4ed8\u7edf\u8ba1", "\u5802\u98df\u8a02\u55ae\u652f\u4ed8\u7d71\u8a08", "\u5802\u98df\u8ba2\u5355", "\u652f\u4ed8\u7edf\u8ba1"]) || text;
  const canonicalChannels = [...DINE_IN_CHANNELS, ...TAKEAWAY_CHANNELS];
  const tableRows = parseHtmlChannelRows(htmlSearchIn);

  for (const canonical of canonicalChannels) {
    const aliases = CHANNEL_ALIASES[canonical] ?? [canonical];
    const tableMetrics = findHtmlChannelMetrics(tableRows, aliases);
    if (tableMetrics) {
      channels.set(canonical, tableMetrics);
      continue;
    }

    const compact = compactText(searchIn);
    const metrics = parseChannelFromCompact(compact, aliases, canonicalChannels);
    if (metrics) {
      channels.set(canonical, metrics);
      continue;
    }

    const lines = searchIn
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const line = findChannelLine(lines, aliases);
    const lineMetrics = line ? parseChannelLine(line, canonical, aliases) : null;
    if (lineMetrics) channels.set(canonical, lineMetrics);
  }

  return channels;
}

function parseHtmlChannelRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const rowMatch of text.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const rowHtml = rowMatch[1] ?? "";
    const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) =>
      decodeHtml(stripHtml(cell[1] ?? "")).trim(),
    );
    if (cells.length > 0) rows.push(cells);
  }
  return rows;
}

function findHtmlChannelMetrics(rows: string[][], aliases: string[]): SalesMetrics | null {
  const compactAliases = aliases.map(compactText).filter(Boolean);
  for (const cells of rows) {
    const name = compactText(cells[0] ?? "");
    const aliasMatched = compactAliases.some((alias) => name.includes(alias));
    const fallbackMatched = compactAliases.some((alias) => alias.length === name.length && questionMask(alias) === name);
    if (!aliasMatched && !fallbackMatched) continue;
    const numbers = cells.flatMap((cell) => [...cell.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])));
    if (numbers.length < 3) return null;
    return {
      count: Math.round(numbers[0] ?? 0),
      flow: round2(numbers[1] ?? 0),
      amount: round2(numbers[2] ?? 0),
    };
  }
  return null;
}

function questionMask(input: string): string {
  return Array.from(input).map(() => "?").join("");
}


function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ");
}

function decodeHtml(input: string): string {
  return input
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'");
}

function parseChannelFromCompact(
  compact: string,
  aliases: string[],
  allChannels: readonly string[],
): SalesMetrics | null {
  const found = findFirstAlias(compact, aliases);
  if (!found) return null;

  let end = compact.length;
  for (const channel of allChannels) {
    for (const alias of CHANNEL_ALIASES[channel] ?? [channel]) {
      const channelIndex = compact.indexOf(compactText(alias), found.end);
      if (channelIndex >= 0 && channelIndex < end) end = channelIndex;
    }
  }

  const segment = compact.slice(found.end, end);
  return parseChannelNumbers(segment);
}

function findFirstAlias(compact: string, aliases: string[]): { index: number; end: number } | null {
  return aliases
    .map(compactText)
    .filter(Boolean)
    .map((alias) => {
      const index = compact.indexOf(alias);
      return { index, end: index >= 0 ? index + alias.length : -1 };
    })
    .filter((match) => match.index >= 0)
    .sort((a, b) => a.index - b.index || b.end - a.end)[0] ?? null;
}

function parseChannelNumbers(segment: string): SalesMetrics | null {
  const spacedNumbers = [...segment.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
  if (spacedNumbers.length >= 3 && /\s/.test(segment)) {
    return {
      count: Math.round(spacedNumbers[0] ?? 0),
      flow: round2(spacedNumbers[1] ?? 0),
      amount: round2(spacedNumbers[2] ?? 0),
    };
  }

  const compact = compactText(segment);
  const best = splitCompactChannelNumbers(compact);
  if (!best) return null;
  return best;
}

function splitCompactChannelNumbers(compact: string): SalesMetrics | null {
  let best: { metrics: SalesMetrics; score: number } | null = null;

  for (let countLength = 1; countLength <= 4 && countLength < compact.length; countLength += 1) {
    const countText = compact.slice(0, countLength);
    if (!/^\d+$/.test(countText)) continue;
    const count = Number(countText);
    const rest = compact.slice(countLength);

    for (const flowText of decimalPrefixCandidates(rest)) {
      const amountText = rest.slice(flowText.length);
      if (!/^\d+\.\d+$/.test(amountText)) continue;
      const flow = Number(flowText);
      const amount = Number(amountText);
      const score = scoreChannelCandidate(count, flow, amount);
      if (!Number.isFinite(score)) continue;
      if (!best || score > best.score) best = { metrics: { count, flow: round2(flow), amount: round2(amount) }, score };
    }
  }

  return best?.metrics ?? null;
}

function decimalPrefixCandidates(text: string): string[] {
  const candidates: string[] = [];
  for (const match of text.matchAll(/\./g)) {
    const dot = match.index ?? -1;
    if (dot <= 0) continue;
    for (let decimals = 1; decimals <= 2; decimals += 1) {
      const end = dot + 1 + decimals;
      const candidate = text.slice(0, end);
      if (/^\d+\.\d+$/.test(candidate) && end < text.length) candidates.push(candidate);
    }
  }
  return candidates;
}

function scoreChannelCandidate(count: number, flow: number, amount: number): number {
  if (count <= 0 || count > 2000 || flow <= 0 || amount <= 0) return Number.NEGATIVE_INFINITY;
  if (flow < amount) return Number.NEGATIVE_INFINITY;
  const average = flow / count;
  if (average < 1 || average > 200) return Number.NEGATIVE_INFINITY;
  const discountRatio = amount / flow;
  if (discountRatio < 0.3 || discountRatio > 1.05) return Number.NEGATIVE_INFINITY;
  const centsPreference = Number.isInteger(flow * 10) ? 0.1 : 0;
  return 1000 - Math.abs(average - 18) - Math.abs(discountRatio - 0.9) * 20 + centsPreference;
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
  const compactLine = compactText(line);
  let tail = compactLine;

  for (const alias of aliases) {
    const compactAlias = compactText(alias);
    const idx = compactLine.indexOf(compactAlias);
    if (idx >= 0) {
      tail = compactLine.slice(idx + compactAlias.length);
      break;
    }
  }

  return parseChannelNumbers(tail);
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

function extractOriginalBlock(text: string, starts: string[], ends: string[]): string | null {
  const startMatches = starts
    .map((start) => ({ start, index: text.indexOf(start) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);
  const foundStart = startMatches[0];
  if (!foundStart) return null;

  const searchFrom = foundStart.index + foundStart.start.length;
  let endIndex = text.length;
  for (const end of ends) {
    const idx = text.indexOf(end, searchFrom);
    if (idx >= 0 && idx < endIndex) endIndex = idx;
  }
  return text.slice(searchFrom, endIndex).trim();
}

function getBlock(text: string, starts: string[], ends: string[]): string | null {
  const compact = compactText(text);
  const compactStarts = starts.map(compactText);
  const compactEnds = ends.map(compactText);
  const startMatches = compactStarts
    .map((start) => ({ start, index: compact.indexOf(start) }))
    .filter((item) => item.index >= 0)
    .sort((a, b) => a.index - b.index);

  const foundStart = startMatches[0];
  if (!foundStart) return null;

  let endIndex = compact.length;
  const searchFrom = foundStart.index + foundStart.start.length;
  for (const end of compactEnds) {
    const idx = compact.indexOf(end, searchFrom);
    if (idx >= 0 && idx < endIndex) endIndex = idx;
  }

  return compact.slice(searchFrom, endIndex).trim();
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
