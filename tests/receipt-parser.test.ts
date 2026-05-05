import assert from "node:assert/strict";
import { daysInMonth, parseReceiptText } from "../src/lib/receipt-parser";
import { buildSheetRows } from "../src/lib/sheet";

const sample = `
海曙印象城店
日期：2026/05/01 00:00 - 2026/05/01 23:59
查询时间：2026/05/01 22:29
订单类型：全部
渠道：全部
------------------------------
营收统计
标准流水： 10756.1元
实收： 9397.34元
有效订单： 537笔
出杯数： 784杯
------------------------------
渠道统计
渠道 订单数 标准流水 实收
微信小程序 247 5075.7 4877.75
饿了么外卖 117 2116.3 1555.79
进钱宝 67 1382.9 1267.33
美团外卖 58 1298.9 928.72
抖音小程序 30 579.5 504.23
支付宝小程序 13 197.3 184.41
京东秒送 5 105.5 79.11
`;

const record = parseReceiptText(sample, "p1.jpg");
assert.equal(record.year, 2026);
assert.equal(record.month, 5);
assert.equal(record.day, 1);
assert.equal(record.total.flow, 10756.1);
assert.equal(record.total.amount, 9397.34);
assert.equal(record.total.count, 537);
assert.deepEqual(record.dineIn, { flow: 7235.4, amount: 6833.72, count: 357 });
assert.deepEqual(record.takeaway, { flow: 3520.7, amount: 2563.62, count: 180 });

assert.equal(daysInMonth(2024, 2), 29);
assert.equal(daysInMonth(2026, 2), 28);
assert.equal(daysInMonth(2026, 4), 30);
assert.equal(daysInMonth(2026, 5), 31);
assert.equal(buildSheetRows([record], 2026, 5).length, 31);
assert.equal(buildSheetRows([record], 2026, 4).length, 30);
assert.equal(buildSheetRows([record], 2024, 2).length, 29);

console.log("receipt parser tests passed");
