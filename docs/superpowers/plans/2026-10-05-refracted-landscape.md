# 折光山水实施计划

Goal: 将已批准的方案 A 落地为具有原创山水背景、通透玻璃、连续署名动效及日夜过渡的个人站点，保留真实内容和现有操作

Architecture: Astro 静态页面与共享 CSS 材质，Motion 原生 JS 提供小范围可中断动效；同构日夜背景由 Astro 优化为 WebP；文字和链接不依赖动效加载

Stack: 现有 Astro 7.3.2 / Tailwind 4.3.3 / TypeScript 6.0.3，新增精确版本 Motion 14.0.0；浏览器检查复用本机已有 Playwright 与 Chrome，不增加站点测试运行时依赖

Spec: docs/superpowers/specs/2026-10-05-visual-redesign-directions.md（用户已选择 A）

Global constraints: 桌面原项目内实施，保留用户 Logo 原文件；不公开简历、不增加珍宝库；保留邮箱/QQ/微信复制、GitHub、人生轨迹数据及原生滚动；不推送发布未经预览的新版本

## 1. 可观察的回归检查
- `tests/browser-experience.mjs` 使用真实浏览器检查：未轮到的 Logo 笔画完全不可见、日夜图片存在且快速切换后状态正确、刷新保留主题、320/390/768/1440 布局无横向溢出、顶栏不超过 80px、键盘菜单可关闭、滚动进度响应、复制操作成功
- 先对旧版运行新测试，确认新行为缺失；旧源码字符串检查替换为上述用户可观察的契约，不继续锁死旧排版常量

## 2. 风景与共享材质
- `src/assets/landscape/day.png` / `night.png`：内置图像工具制作同一构图的想象山水，不冒充个人旅行照片
- `src/components/LandscapeBackdrop.astro`：两幅优化图、独立天体和阅读保护层，固定背景；主题切换只修改目标状态，由 CSS 从当前状态自然续接
- `src/styles/global.css`：日夜色板、透明玻璃边缘/高光、稳定阅读层、响应式间距、减少动画/减少透明度与不支持 backdrop-filter 的降级
- liquidGL 3.0.0 文档明确 CSS 动画折射不受支持；本轮用清晰 CSS/SVG 材质，不让截图渲染链破坏同步日夜过渡或移动端响应

## 3. 首页重新构图
- `ProfileHero.astro`：左身份和署名、右真实照片、玻璃题签、六条真实身份带，姓名优先，顶栏与署名不占据大幅视线
- `PersonalStory.astro`：留白轨迹栏配三段真实叙事，保留实时进度计算
- `CurrentFocus.astro`：五个兴趣方向与可选标签联动，明确是关注方向而非成果，实际科研入口
- `RouteIndex.astro`：四个不同图形的栏目入口，原生链接、连续路径、悬停/触摸反馈
- `ContactPanel.astro`：清晰联系区与湖面透视背景，保留复制及成功/失败读屏反馈
- `BrandWord.astro`：收敛为有构图意义且不横向裁断的镂空字；`SiteHeader` / `SiteFooter` / `PageIntro` 使用共享风格，其他栏目内容不改写

## 4. 连续书写和交互
- `TomphieLogo.astro`：每条路径默认隐藏，在上一笔结束后开始；按照真实路径长度计算单笔所需时间，不显示未开始的圆头
- `src/scripts/landscape-motion.ts`：Motion 负责局部可中断反馈及首页照片轻微滚动位移；不劫持滚动，不令触屏依赖悬停
- `ThemeToggle.astro`：同步图层/颜色/太阳月亮过渡，快速重复点击不锁定；保留 localStorage 与系统主题行为

## 5. 交付前检查
- 运行单元测试、Astro 检查和静态构建、产物测试
- 浏览器检查两种主题与四个宽度、菜单、复制、兴趣切换、滚动、早期书写帧；查看桌面/手机截图并修正真实问题
- 预览通过后提供本机预览链接；保留未发布状态，记录原创素材提示词、资产位置和依赖选择
