import { ReceiptRecord } from "./types";

const MINERU_BASE_URL = "https://mineru.net";
const MAX_POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 3000;

interface MineruFileUrl {
  file_name?: string;
  name?: string;
  url?: string;
  upload_url?: string;
  file_id?: string;
  id?: string;
}

interface MineruBatchApplyResponse {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    batch_id?: string;
    file_urls?: MineruFileUrl[];
    files?: MineruFileUrl[];
  };
  batch_id?: string;
  file_urls?: MineruFileUrl[];
}

interface MineruExtractResponse {
  code?: number;
  msg?: string;
  message?: string;
  data?: unknown;
}

export interface OcrFileInput {
  file: File;
  fileName: string;
}

export interface OcrTextResult {
  fileName: string;
  text: string;
  warnings: string[];
}

export async function runMineruOcr(files: OcrFileInput[]): Promise<OcrTextResult[]> {
  const token = process.env.MINERU_API_TOKEN;
  if (!token) {
    throw new Error("服务端未配置 MINERU_API_TOKEN，无法调用 MinerU OCR。");
  }
  if (files.length === 0) return [];
  if (files.length > 50) {
    throw new Error("MinerU 单次最多支持 50 个文件，请分批上传。");
  }

  const applyResult = await applyUploadUrls(token, files);
  await uploadFiles(files, applyResult.fileUrls);
  const extractResult = await pollExtractResults(token, applyResult.batchId);
  return mapExtractResults(extractResult, files);
}

async function applyUploadUrls(token: string, files: OcrFileInput[]) {
  const body = {
    enable_formula: false,
    language: "ch",
    enable_table: true,
    files: files.map(({ fileName }) => ({ name: fileName, is_ocr: true, data_id: fileName })),
  };

  const response = await fetch(`${MINERU_BASE_URL}/api/v4/file-urls/batch`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const json = (await response.json().catch(() => ({}))) as MineruBatchApplyResponse;
  if (!response.ok || isFailureCode(json.code)) {
    throw new Error(`申请 MinerU 上传地址失败：${json.msg || json.message || response.statusText}`);
  }

  const batchId = json.data?.batch_id || json.batch_id;
  const fileUrls = json.data?.file_urls || json.data?.files || json.file_urls || [];
  if (!batchId || fileUrls.length === 0) {
    throw new Error("MinerU 返回缺少 batch_id 或上传地址。");
  }
  return { batchId, fileUrls };
}

async function uploadFiles(files: OcrFileInput[], fileUrls: MineruFileUrl[]) {
  await Promise.all(
    files.map(async ({ file, fileName }, index) => {
      const matched = findUploadUrl(fileName, index, fileUrls);
      const url = matched?.url || matched?.upload_url;
      if (!url) throw new Error(`MinerU 未返回 ${fileName} 的上传地址。`);
      const response = await fetch(url, {
        method: "PUT",
        body: file,
        headers: file.type ? { "Content-Type": file.type } : undefined,
      });
      if (!response.ok) {
        throw new Error(`上传 ${fileName} 到 MinerU 失败：${response.status} ${response.statusText}`);
      }
    }),
  );
}

async function pollExtractResults(token: string, batchId: string): Promise<MineruExtractResponse> {
  let last: MineruExtractResponse | null = null;
  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    const response = await fetch(`${MINERU_BASE_URL}/api/v4/extract-results/batch/${batchId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const json = (await response.json().catch(() => ({}))) as MineruExtractResponse;
    last = json;
    if (!response.ok || isFailureCode(json.code)) {
      throw new Error(`获取 MinerU 解析结果失败：${json.msg || json.message || response.statusText}`);
    }
    if (hasFinished(json)) return json;
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`MinerU 解析超时，请稍后重试。最后状态：${JSON.stringify(last).slice(0, 300)}`);
}

function mapExtractResults(response: MineruExtractResponse, files: OcrFileInput[]): OcrTextResult[] {
  const items = extractResultItems(response.data ?? response);
  return files.map(({ fileName }, index) => {
    const item = findResultItem(items, fileName, index);
    const text = extractTextFromItem(item);
    return {
      fileName,
      text,
      warnings: text ? [] : [`${fileName} 未能从 MinerU 结果中提取到文本。`],
    };
  });
}

function extractResultItems(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return [];
  const obj = data as Record<string, unknown>;
  for (const key of ["extract_result", "extract_results", "results", "files", "items"]) {
    const value = obj[key];
    if (Array.isArray(value)) return value;
  }
  return [obj];
}

function findResultItem(items: unknown[], fileName: string, index: number): unknown {
  const target = normalizeName(fileName);
  const found = items.find((item) => {
    if (!item || typeof item !== "object") return false;
    const obj = item as Record<string, unknown>;
    const names = [obj.file_name, obj.name, obj.data_id, obj.filename].filter(Boolean).map(String);
    return names.some((name) => normalizeName(name) === target);
  });
  return found ?? items[index] ?? null;
}

function extractTextFromItem(item: unknown): string {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (Array.isArray(item)) return item.map(extractTextFromItem).filter(Boolean).join("\n");
  if (typeof item !== "object") return "";
  const obj = item as Record<string, unknown>;
  const directKeys = [
    "md_content",
    "markdown",
    "content",
    "text",
    "layout_text",
    "ocr_text",
    "result",
  ];
  for (const key of directKeys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  for (const key of ["full_zip_url", "zip_url", "result_url", "md_url", "markdown_url", "url"]) {
    const value = obj[key];
    if (typeof value === "string" && /^https?:\/\//.test(value)) {
      return `MinerU 返回了下载链接但未内嵌文本：${value}`;
    }
  }
  return Object.values(obj).map(extractTextFromItem).filter(Boolean).join("\n");
}

function findUploadUrl(fileName: string, index: number, fileUrls: MineruFileUrl[]): MineruFileUrl | undefined {
  const target = normalizeName(fileName);
  return (
    fileUrls.find((item) => {
      const names = [item.file_name, item.name, item.id, item.file_id].filter(Boolean).map(String);
      return names.some((name) => normalizeName(name) === target);
    }) ?? fileUrls[index]
  );
}

function hasFinished(response: MineruExtractResponse): boolean {
  const data = response.data;
  const text = JSON.stringify(data ?? response).toLowerCase();
  if (/running|processing|pending|extracting|waiting|排队|解析中|处理中/.test(text)) return false;
  if (/done|finished|success|completed|complete|解析成功|完成/.test(text)) return true;
  const items = extractResultItems(data ?? response);
  return items.length > 0 && items.some((item) => Boolean(extractTextFromItem(item)));
}

function isFailureCode(code: number | undefined): boolean {
  return typeof code === "number" && code !== 0 && code !== 200;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function recordsFromTexts(results: OcrTextResult[], parse: (text: string, fileName: string) => ReceiptRecord) {
  return results.map((result) => {
    const record = parse(result.text, result.fileName);
    return { ...record, warnings: [...result.warnings, ...record.warnings] };
  });
}
