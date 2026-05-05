"use client";

import { ChangeEvent, DragEvent, useMemo, useRef, useState } from "react";
import { exportPerformanceWorkbook } from "@/lib/excel";
import { buildSheetRows, defaultTargetMonth, findDuplicateDays, monthOptions } from "@/lib/sheet";
import type { EditableRecord, OcrResponse, SalesMetrics } from "@/lib/types";

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/webp,image/bmp,image/tiff";

type Status = "idle" | "uploading" | "success" | "error";

export default function PerformanceApp() {
  const [files, setFiles] = useState<File[]>([]);
  const [records, setRecords] = useState<EditableRecord[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("请选择或拍摄小票图片。");
  const [targetMonth, setTargetMonth] = useState(defaultTargetMonth([]));
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const selectedRecords = useMemo(() => records.filter((record) => record.selected), [records]);
  const months = useMemo(() => monthOptions(records), [records]);
  const duplicates = useMemo(() => findDuplicateDays(selectedRecords), [selectedRecords]);
  const monthConflict = months.length > 1;
  const rows = useMemo(
    () => buildSheetRows(selectedRecords, targetMonth.year, targetMonth.month),
    [selectedRecords, targetMonth],
  );

  function addFiles(nextFiles: FileList | File[]) {
    const images = Array.from(nextFiles).filter((file) => file.type.startsWith("image/"));
    setFiles((current) => {
      const merged = [...current, ...images];
      const seen = new Set<string>();
      return merged.filter((file) => {
        const key = `${file.name}-${file.size}-${file.lastModified}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    });
    if (images.length > 0) setMessage(`已选择 ${images.length} 张图片，可继续添加或开始识别。`);
  }

  function removeFile(index: number) {
    setFiles((current) => current.filter((_, i) => i !== index));
  }

  async function recognize() {
    if (files.length === 0) {
      setMessage("请先上传至少一张小票图片。");
      return;
    }
    setStatus("uploading");
    setMessage("正在上传图片并调用 MinerU 识别，请稍候……");
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      const response = await fetch("/api/ocr", { method: "POST", body: formData });
      const json = (await response.json()) as OcrResponse & { error?: string };
      if (!response.ok) throw new Error(json.error || "识别失败");
      const editable = json.records.map((record) => ({ ...record, selected: true }));
      setRecords(editable);
      const defaultMonth = defaultTargetMonth(editable);
      setTargetMonth({ year: defaultMonth.year, month: defaultMonth.month });
      setStatus("success");
      setMessage(`识别完成，共解析 ${editable.length} 张小票。请检查预览后导出。`);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "识别失败，请稍后重试。");
    }
  }

  function updateRecord(id: string, updater: (record: EditableRecord) => EditableRecord) {
    setRecords((current) => current.map((record) => (record.id === id ? updater(record) : record)));
  }

  function updateDate(record: EditableRecord, value: string) {
    const [year, month, day] = value.split("-").map(Number);
    if (!year || !month || !day) return record;
    return { ...record, date: value, year, month, day };
  }

  function updateMetric(
    record: EditableRecord,
    group: "total" | "dineIn" | "takeaway",
    key: keyof SalesMetrics,
    value: string,
  ) {
    const numeric = key === "count" ? Math.round(Number(value) || 0) : Number(value) || 0;
    return {
      ...record,
      [group]: {
        ...record[group],
        [key]: numeric,
      },
    };
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(true);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function exportXlsx() {
    if (selectedRecords.length === 0) {
      setMessage("没有可导出的识别记录。");
      return;
    }
    await exportPerformanceWorkbook(rows, targetMonth.year, targetMonth.month);
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">InCity OCR Workbook</p>
          <h1>印象城小票识别转业绩表</h1>
          <p className="hero-text">
            上传每日营收小票照片，自动识别营收统计和渠道统计，生成可编辑的商场业绩表 XLSX。
          </p>
        </div>
        <div className="hero-actions">
          <button type="button" className="primary" onClick={() => cameraInputRef.current?.click()}>
            拍照上传
          </button>
          <button type="button" className="secondary" onClick={() => fileInputRef.current?.click()}>
            从相册/电脑选择
          </button>
        </div>
      </section>

      <input
        ref={cameraInputRef}
        type="file"
        accept={ACCEPTED_IMAGES}
        capture="environment"
        multiple
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_IMAGES}
        multiple
        hidden
        onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)}
      />

      <section
        className={`upload-card ${dragging ? "dragging" : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <div>
          <h2>1. 上传小票照片</h2>
          <p>手机可直接拍照，PC 可拖拽多张图片。单次最多 50 张。</p>
        </div>
        <div className="file-list">
          {files.length === 0 ? (
            <div className="empty-state">暂无文件，点击上方按钮或拖拽图片到这里。</div>
          ) : (
            files.map((file, index) => (
              <div className="file-pill" key={`${file.name}-${file.size}-${index}`}>
                <span>{file.name}</span>
                <small>{formatSize(file.size)}</small>
                <button type="button" onClick={() => removeFile(index)} aria-label={`移除 ${file.name}`}>
                  ×
                </button>
              </div>
            ))
          )}
        </div>
        <div className="toolbar">
          <button type="button" className="primary" disabled={status === "uploading"} onClick={recognize}>
            {status === "uploading" ? "识别中……" : "开始识别"}
          </button>
          <span className={`status ${status}`}>{message}</span>
        </div>
      </section>

      {records.length > 0 && (
        <>
          <section className="notice-stack">
            {monthConflict && (
              <div className="notice warning">
                已识别到多个月份，请选择本次要导出的目标月份。非目标月份记录会保留在预览中，但不会写入当前 XLSX。
              </div>
            )}
            {duplicates.length > 0 && (
              <div className="notice danger">
                发现同一天有多张小票：
                {duplicates.map(({ key, list }) => (
                  <span key={key}> {key}（{list.map((item) => item.fileName).join("、")}）</span>
                ))}
                。请取消勾选重复记录，系统默认不自动累加。
              </div>
            )}
          </section>

          <section className="panel-card">
            <div className="section-heading">
              <div>
                <h2>2. 检查并修正识别结果</h2>
                <p>修改日期或数字后，下面的导出预览会自动更新。</p>
              </div>
              <label className="month-select">
                导出月份
                <select
                  value={`${targetMonth.year}-${targetMonth.month}`}
                  onChange={(event) => {
                    const [year, month] = event.target.value.split("-").map(Number);
                    setTargetMonth({ year, month });
                  }}
                >
                  {months.map((month) => (
                    <option key={`${month.year}-${month.month}`} value={`${month.year}-${month.month}`}>
                      {month.label}（{month.count}张）
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="records-grid">
              {records.map((record) => (
                <article className="record-card" key={record.id}>
                  <header>
                    <label className="check-line">
                      <input
                        type="checkbox"
                        checked={record.selected}
                        onChange={(event) =>
                          updateRecord(record.id, (current) => ({ ...current, selected: event.target.checked }))
                        }
                      />
                      <strong>{record.fileName}</strong>
                    </label>
                    <input
                      type="date"
                      value={record.date}
                      onChange={(event) => updateRecord(record.id, (current) => updateDate(current, event.target.value))}
                    />
                  </header>
                  <MetricEditor
                    title="月总销售情况"
                    metrics={record.total}
                    onChange={(key, value) =>
                      updateRecord(record.id, (current) => updateMetric(current, "total", key, value))
                    }
                  />
                  <MetricEditor
                    title="堂食销售情况"
                    metrics={record.dineIn}
                    onChange={(key, value) =>
                      updateRecord(record.id, (current) => updateMetric(current, "dineIn", key, value))
                    }
                  />
                  <MetricEditor
                    title="外卖销售情况"
                    metrics={record.takeaway}
                    onChange={(key, value) =>
                      updateRecord(record.id, (current) => updateMetric(current, "takeaway", key, value))
                    }
                  />
                  {record.warnings.length > 0 && (
                    <details>
                      <summary>识别提醒（{record.warnings.length}）</summary>
                      <ul>
                        {record.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              ))}
            </div>
          </section>

          <section className="panel-card">
            <div className="section-heading">
              <div>
                <h2>3. 导出预览</h2>
                <p>
                  当前导出：{targetMonth.year}年{targetMonth.month}月，共 {rows.length} 天。
                </p>
              </div>
              <button type="button" className="primary" onClick={exportXlsx}>
                导出 XLSX
              </button>
            </div>
            <div className="table-wrap">
              <table className="preview-table">
                <thead>
                  <tr>
                    <th rowSpan={2}>日期</th>
                    <th colSpan={3}>月总销售情况</th>
                    <th colSpan={3}>堂食销售情况</th>
                    <th colSpan={3}>外卖销售情况</th>
                  </tr>
                  <tr>
                    <th>总流水</th>
                    <th>销售额</th>
                    <th>笔数</th>
                    <th>流水</th>
                    <th>销售额</th>
                    <th>笔数</th>
                    <th>流水</th>
                    <th>销售额</th>
                    <th>笔数</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.day} className={row.sourceFileName ? "has-data" : undefined}>
                      <td>{row.day}</td>
                      <MetricCells metrics={row.total} />
                      <MetricCells metrics={row.dineIn} />
                      <MetricCells metrics={row.takeaway} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}

function MetricEditor({
  title,
  metrics,
  onChange,
}: {
  title: string;
  metrics: SalesMetrics;
  onChange: (key: keyof SalesMetrics, value: string) => void;
}) {
  return (
    <div className="metric-editor">
      <h3>{title}</h3>
      <label>
        流水
        <input type="number" step="0.01" value={metrics.flow} onChange={(event) => onChange("flow", event.target.value)} />
      </label>
      <label>
        销售额
        <input
          type="number"
          step="0.01"
          value={metrics.amount}
          onChange={(event) => onChange("amount", event.target.value)}
        />
      </label>
      <label>
        笔数
        <input type="number" step="1" value={metrics.count} onChange={(event) => onChange("count", event.target.value)} />
      </label>
    </div>
  );
}

function MetricCells({ metrics }: { metrics: SalesMetrics }) {
  return (
    <>
      <td>{metrics.flow || ""}</td>
      <td>{metrics.amount || ""}</td>
      <td>{metrics.count || ""}</td>
    </>
  );
}

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.round(size / 1024)}KB`;
  return `${(size / 1024 / 1024).toFixed(1)}MB`;
}