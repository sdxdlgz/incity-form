# InCity OCR Workbook

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fsdxdlgz%2Fincity-form&env=MINERU_API_TOKEN&envDescription=MinerU%20API%20token%20used%20by%20the%20server-side%20OCR%20route&project-name=incity-form&repository-name=incity-form)

把每日营收小票照片识别成「商场业绩表」XLSX 的网页工具。项目基于 **Next.js + TypeScript + PWA**，支持手机拍照、相册选择、PC 拖拽上传，并通过服务端调用 MinerU API 完成 OCR。

## 功能特性

- **多端上传**：手机拍照/相册、电脑选择文件或拖拽上传。
- **移动端友好**：上传前自动压缩大图，降低手机网络上传失败概率。
- **服务端 OCR**：MinerU Token 仅保存在服务端环境变量中，不暴露给浏览器。
- **自动汇总**：
  - 月总销售情况：营收统计中的标准流水、实收、有效订单。
  - 堂食销售情况：微信小程序、进钱宝、抖音小程序、支付宝小程序求和。
  - 外卖销售情况：饿了么外卖、美团外卖、京东秒送求和。
- **可编辑预览**：导出前可修正日期、流水、销售额和笔数。
- **动态月份**：按目标年月自动生成 28/29/30/31 天，不固定 31 行。
- **XLSX 导出**：生成单 Sheet：`商场业绩表`。
- **PWA 支持**：可在手机浏览器中添加到桌面。

## 一键部署到 Vercel

点击顶部 **Deploy with Vercel** 按钮，按提示导入仓库并填写环境变量：

```bash
MINERU_API_TOKEN=你的 MinerU API Token
```

部署完成后即可通过 Vercel 域名访问。

> 注意：OCR 接口需要服务端运行环境，因此请不要把项目导出为纯静态站点。

## 本地开发

```bash
npm install
copy .env.example .env.local
npm run dev
```

在 `.env.local` 中填写：

```bash
MINERU_API_TOKEN=你的 MinerU API Token
```

本机访问：

```text
http://localhost:3000
```

手机访问本地开发服务时，请使用电脑局域网 IP，例如：

```text
http://192.168.60.83:3000
```

如果手机端出现 `Failed to fetch`，请检查手机和电脑是否在同一网络，并确认 Windows 防火墙允许 Node/3000 端口访问。

## VPS 部署

```bash
npm ci
npm run build
MINERU_API_TOKEN=你的 MinerU API Token npm run start
```

建议使用 Nginx 或 Caddy 反向代理到 Node 服务，并启用 HTTPS，以获得更稳定的拍照上传和 PWA 安装体验。

## 数据提取规则

- 日期取小票日期范围中的年月日，导出表中显示「日」。
- 月总销售情况：
  - 总流水 = `营收统计 / 标准流水`
  - 销售额 = `营收统计 / 实收`
  - 笔数 = `营收统计 / 有效订单`
- 堂食销售情况汇总渠道：
  - 微信小程序
  - 进钱宝
  - 抖音小程序
  - 支付宝小程序
- 外卖销售情况汇总渠道：
  - 饿了么外卖
  - 美团外卖
  - 京东秒送

## 常用命令

```bash
npm run dev        # 本地开发
npm run test       # 解析规则回归测试
npm run typecheck  # TypeScript 检查
npm run lint       # ESLint 检查
npm run build      # 生产构建
```

## 项目说明

- 第一版不做登录、数据库或长期文件存储。
- 同一天多张小票会提示冲突，默认不自动累加，避免重复拍摄导致流水翻倍。
- 如果识别结果异常，可展开「查看原始识别文本」定位 MinerU 输出格式，再调整解析规则。
