import JSZip from "jszip";
import { ReceiptRecord } from "./types";

const MINERU_BASE_URL = "https://mineru.net";
const MAX_POLL_ATTEMPTS = 40;
const POLL_INTERVAL_MS = 3000;

type MineruFileUrl =
  | string
  | {
      file_name?: string;
      name?: string;
      url?: string;
      upload_url?: string;
      uploadUrl?: string;
      file_id?: string;
      id?: string;
      data_id?: string;
    };

interface MineruBatchApplyResponse {
  code?: number;
  msg?: string;
  message?: string;
  data?: {
    batch_id?: string;
    batchId?: string;
    file_urls?: MineruFileUrl[];
    fileUrls?: MineruFileUrl[];
    urls?: MineruFileUrl[];
    files?: MineruFileUrl[];
  };
  batch_id?: string;
  batchId?: string;
  file_urls?: MineruFileUrl[];
  fileUrls?: MineruFileUrl[];
  urls?: MineruFileUrl[];
  files?: MineruFileUrl[];
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

  const batchId = json.data?.batch_id || json.data?.batchId || json.batch_id || json.batchId;
  const fileUrls = normalizeUploadUrls(
    json.data?.file_urls ||
      json.data?.fileUrls ||
      json.data?.urls ||
      json.data?.files ||
      json.file_urls ||
      json.fileUrls ||
      json.urls ||
      json.files ||
      [],
  );

  if (!batchId || fileUrls.length === 0) {
    throw new Error(
      `MinerU 返回缺少 batch_id 或上传地址。返回摘要：${summarizeForError(json)}`,
    );
  }
  return { batchId, fileUrls };
}

async function uploadFiles(files: OcrFileInput[], fileUrls: MineruFileUrl[]) {
  await Promise.all(
    files.map(async ({ file, fileName }, index) => {
      const matched = findUploadUrl(fileName, index, fileUrls);
      const url = getUploadUrl(matched);
      if (!url) {
        throw new Error(
          `MinerU 未返回 ${fileName} 的上传地址。上传地址摘要：${summarizeForError(fileUrls)}`,
        );
      }
      const response = await fetch(url, {
        method: "PUT",
        body: await file.arrayBuffer(),
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

async function mapExtractResults(response: MineruExtractResponse, files: OcrFileInput[]): Promise<OcrTextResult[]> {
  const items = extractResultItems(response.data ?? response);
  return Promise.all(
    files.map(async ({ fileName }, index) => {
      const item = findResultItem(items, fileName, index);
      const text = await extractTextFromItem(item);
      return {
        fileName,
        text,
        warnings: text ? [] : [`${fileName} MinerU result has no readable text.`],
      };
    }),
  );
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

async function extractTextFromItem(item: unknown): Promise<string> {
  if (!item) return "";
  if (typeof item === "string") return item;
  if (Array.isArray(item)) return (await Promise.all(item.map(extractTextFromItem))).filter(Boolean).join("\n");
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
      return downloadTextFromMineruUrl(value);
    }
  }
  return (await Promise.all(Object.values(obj).map(extractTextFromItem))).filter(Boolean).join("\n");
}

async function downloadTextFromMineruUrl(url: string): Promise<string> {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return `MinerU result download failed: ${response.status} ${response.statusText}`;
  const contentType = response.headers.get("content-type") || "";
  const bytes = await response.arrayBuffer();

  if (contentType.includes("zip") || url.toLowerCase().includes(".zip")) {
    const zip = await JSZip.loadAsync(bytes);
    const markdownFile = findPreferredMarkdownFile(zip);
    if (!markdownFile) return "";
    return markdownFile.async("string");
  }

  return new TextDecoder("utf-8").decode(bytes);
}

function findPreferredMarkdownFile(zip: JSZip): JSZip.JSZipObject | null {
  const files = Object.values(zip.files).filter((file) => !file.dir);
  const exact = files.find((file) => /(^|\/)full\.md$/i.test(file.name));
  if (exact) return exact;
  const markdown = files.find((file) => /\.(md|markdown|txt)$/i.test(file.name));
  return markdown ?? null;
}

function normalizeUploadUrls(input: unknown): MineruFileUrl[] {
  if (Array.isArray(input)) return input as MineruFileUrl[];
  if (!input || typeof input !== "object") return [];
  return Object.values(input as Record<string, unknown>).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (value && typeof value === "object") return [value as MineruFileUrl];
    return [];
  });
}

function getUploadUrl(item: MineruFileUrl | undefined): string | undefined {
  if (!item) return undefined;
  if (typeof item === "string") return item;
  return item.url || item.upload_url || item.uploadUrl;
}

function findUploadUrl(fileName: string, index: number, fileUrls: MineruFileUrl[]): MineruFileUrl | undefined {
  const target = normalizeName(fileName);
  return (
    fileUrls.find((item) => {
      if (typeof item === "string") return false;
      const names = [item.file_name, item.name, item.id, item.file_id, item.data_id].filter(Boolean).map(String);
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
  return items.length > 0;
}

function isFailureCode(code: number | undefined): boolean {
  return typeof code === "number" && code !== 0 && code !== 200;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

function summarizeForError(value: unknown): string {
  return JSON.stringify(value, (_key, innerValue) => {
    if (typeof innerValue === "string" && innerValue.length > 120) return `${innerValue.slice(0, 80)}...`;
    return innerValue;
  }).slice(0, 600);
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
