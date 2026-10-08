# 个人网站 · Tomphie

一个静态优先、内容驱动的个人数字档案，包含个人名片、人生轨迹、科研、项目和笔记五个主要空间。

## 技术组合

- Node.js `>=24.15.0`，与自动部署使用的 Node 24 保持一致
- Astro `7.3.2`
- Tailwind CSS `4.3.3`
- TypeScript `6.0.3`
- Vitest `5.0.0`
- Motion 原生 JavaScript `14.0.0`

版本由 `package-lock.json` 固定。不要直接升级单个核心依赖；升级前先检查 Astro、Astro Check 和 TypeScript 的 peer dependency 范围。

## 本地使用

```bash
npm install
npm run dev
```

浏览器打开终端显示的本地地址。

```bash
npm run verify
npm run build
```

`npm run verify` 依次检查路径和导航契约、Astro 类型、生产构建和最终静态页面。

## 项目文档

- 当前重构方向与工具约定：`docs/superpowers/specs/2026-10-05-visual-redesign-directions.md`（已确认 A「折光山水」）
- 重构实施与验证：`docs/superpowers/plans/2026-10-05-refracted-landscape.md`
- 原创视觉素材与验收记录：`docs/design/refracted-landscape.md`
- 内容与体验设计：`docs/superpowers/specs/2026-09-11-personal-website-content-experience-design.md`
- 模块 0 实施计划：`docs/superpowers/plans/2026-09-11-site-foundation.md`
- 内容提供指南：`docs/content-input-guide.md`
- 隐私与发布边界：`docs/privacy-and-publishing.md`

## 当前范围

当前采用「折光山水」：原创同构日夜背景、共享玻璃材质、单起笔署名动画、真实肖像与经历、可交互研究兴趣、栏目入口和复制联系。人生轨迹、全站导航及其他栏目阅读框架沿用同一视觉语言；科研、项目、笔记仍以真实的建设说明为主，不包含虚构成果。

`npm run test:browser` 使用外部已有 Playwright 与本机 Chrome。未在项目安装 Playwright 时，通过 `TOMPHIE_PLAYWRIGHT_PATH` 指定其 `index.mjs`；`TOMPHIE_PREVIEW_URL` 可指定产物预览地址。`npm run verify` 不依赖浏览器工具，也不需要新增测试包。

## 发布到 GitHub Pages

推送到 GitHub 仓库的 `main` 分支后，`.github/workflows/deploy.yml` 会自动构建并发布网站。首次发布时，需要在仓库的 **Settings → Pages** 中把 Source 设为 **GitHub Actions**。

部署配置会自动识别仓库类型：

- `用户名/用户名.github.io` 会发布在根路径；
- 普通仓库会自动使用 `/仓库名` 作为子路径；
- 使用自定义域名时，在仓库 Actions variables 中设置 `SITE_URL`，并把 `BASE_PATH` 设为 `/`。

正式绑定域名时，再补充 DNS 和 `public/CNAME`；在确定真实域名前不写入占位地址。
