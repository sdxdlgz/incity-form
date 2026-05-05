# 印象城业绩表 OCR

一个用于把每日营收小票照片识别成「商场业绩表」XLSX 的 Next.js + TypeScript + PWA 网页项目。

## 功能

- 手机拍照、相册选择或 PC 拖拽上传多张小票图片。
- 服务端调用 MinerU 精准解析 API，Token 不暴露到浏览器。
- 自动提取：
  - 日期：从小票日期范围识别年月日，导出表中只显示日。
  - 月总：营收统计的标准流水、实收、有效订单。
  - 堂食：微信小程序、进钱宝、抖音小程序、支付宝小程序四个渠道求和。
  - 外卖：饿了么外卖、美团外卖、京东秒送三个渠道求和。
- 导出前可编辑预览，支持识别错误修正。
- 导出单 sheet：`商场业绩表`，并按目标年月动态生成 28/29/30/31 天。
- PWA 支持移动端添加到桌面。

## 本地开发

```bash
npm install
cp .env.example .env.local
# 填写 MINERU_API_TOKEN
npm run dev
```

打开 <http://localhost:3000>。

## 环境变量

```bash
MINERU_API_TOKEN=你的MinerU Token
```

## 部署

### Vercel

1. 导入 GitHub 仓库。
2. 在 Project Settings → Environment Variables 添加 `MINERU_API_TOKEN`。
3. 使用默认 Next.js 构建命令部署。

### VPS

```bash
npm ci
npm run build
MINERU_API_TOKEN=你的MinerU Token npm run start
```

建议用 Nginx/Caddy 反向代理到 Node 服务端口，并启用 HTTPS，手机拍照和 PWA 安装体验更稳定。

## 测试

```bash
npm run test
npm run typecheck
npm run lint
npm run build
```

## 注意

- 第一版不做登录、数据库或长期文件存储。
- 同一天多张小票会提示冲突，默认不自动累加，避免重复拍摄导致流水翻倍。
- 若上传跨月份小票，需要在预览页选择目标导出月份。
