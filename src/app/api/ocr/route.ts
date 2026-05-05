import { NextRequest, NextResponse } from "next/server";
import { runMineruOcr, recordsFromTexts } from "@/lib/mineru";
import { parseReceiptText } from "@/lib/receipt-parser";
import type { OcrResponse } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 180;

const MAX_FILES = 50;
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/bmp", "image/tiff"]);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((value): value is File => value instanceof File && value.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ error: "请至少上传一张图片。" }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `单次最多上传 ${MAX_FILES} 张图片。` }, { status: 400 });
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `${file.name} 超过 200MB 限制。` }, { status: 400 });
      }
      if (file.type && !ALLOWED_TYPES.has(file.type)) {
        return NextResponse.json({ error: `${file.name} 不是支持的图片格式。` }, { status: 400 });
      }
    }

    const ocrResults = await runMineruOcr(files.map((file) => ({ file, fileName: file.name })));
    const records = recordsFromTexts(ocrResults, parseReceiptText);
    const response: OcrResponse = {
      records,
      warnings: records.flatMap((record) => record.warnings.map((warning) => `${record.fileName}: ${warning}`)),
    };
    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "识别失败，请稍后重试。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
