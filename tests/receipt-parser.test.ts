import assert from "node:assert/strict";
import { daysInMonth, parseReceiptText } from "../src/lib/receipt-parser";
import { buildSheetRows } from "../src/lib/sheet";

const sample = "\n" +
  "\u6d77\u66d9\u5370\u8c61\u57ce\u5e97\n" +
  "\u65e5\u671f\uff1a2026/05/01 00:00 - 2026/05/01 23:59\n" +
  "\u67e5\u8be2\u65f6\u95f4\uff1a2026/05/01 22:29\n" +
  "\u8ba2\u5355\u7c7b\u578b\uff1a\u5168\u90e8\n" +
  "\u6e20\u9053\uff1a\u5168\u90e8\n" +
  "------------------------------\n" +
  "\u8425\u6536\u7edf\u8ba1\n" +
  "\u6807\u51c6\u6d41\u6c34\uff1a 10756.1\u5143\n" +
  "\u5b9e\u6536\uff1a 9397.34\u5143\n" +
  "\u6709\u6548\u8ba2\u5355\uff1a 537\u7b14\n" +
  "\u51fa\u676f\u6570\uff1a 784\u676f\n" +
  "------------------------------\n" +
  "\u6e20\u9053\u7edf\u8ba1\n" +
  "\u6e20\u9053 \u8ba2\u5355\u6570 \u6807\u51c6\u6d41\u6c34 \u5b9e\u6536\n" +
  "\u5fae\u4fe1\u5c0f\u7a0b\u5e8f 247 5075.7 4877.75\n" +
  "\u997f\u4e86\u4e48\u5916\u5356 117 2116.3 1555.79\n" +
  "\u8fdb\u94b1\u5b9d 67 1382.9 1267.33\n" +
  "\u7f8e\u56e2\u5916\u5356 58 1298.9 928.72\n" +
  "\u6296\u97f3\u5c0f\u7a0b\u5e8f 30 579.5 504.23\n" +
  "\u652f\u4ed8\u5b9d\u5c0f\u7a0b\u5e8f 13 197.3 184.41\n" +
  "\u4eac\u4e1c\u79d2\u9001 5 105.5 79.11\n";

const record = parseReceiptText(sample, "p1.jpg");
assert.equal(record.year, 2026);
assert.equal(record.month, 5);
assert.equal(record.day, 1);
assert.equal(record.total.flow, 10756.1);
assert.equal(record.total.amount, 9397.34);
assert.equal(record.total.count, 537);
assert.deepEqual(record.dineIn, { flow: 7235.4, amount: 6833.72, count: 357 });
assert.deepEqual(record.takeaway, { flow: 3520.7, amount: 2563.62, count: 180 });

const collapsedRecord = parseReceiptText(sample.replace(/\n/g, " "), "collapsed.jpg");
assert.deepEqual(collapsedRecord.dineIn, { flow: 7235.4, amount: 6833.72, count: 357 });
assert.deepEqual(collapsedRecord.takeaway, { flow: 3520.7, amount: 2563.62, count: 180 });

const noisyHeaderRecord = parseReceiptText(sample.replace("????", "???? Markdown??"), "noisy-header.jpg");
assert.deepEqual(noisyHeaderRecord.dineIn, { flow: 7235.4, amount: 6833.72, count: 357 });
assert.deepEqual(noisyHeaderRecord.takeaway, { flow: 3520.7, amount: 2563.62, count: 180 });

assert.equal(daysInMonth(2024, 2), 29);
assert.equal(daysInMonth(2026, 2), 28);
assert.equal(daysInMonth(2026, 4), 30);
assert.equal(daysInMonth(2026, 5), 31);
assert.equal(buildSheetRows([record], 2026, 5).length, 31);
assert.equal(buildSheetRows([record], 2026, 4).length, 30);
assert.equal(buildSheetRows([record], 2024, 2).length, 29);

console.log("receipt parser tests passed");
