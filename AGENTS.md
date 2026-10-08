# Tomphie 网站协作约定

- 项目唯一工作目录是 `/Users/kongsanjin/Desktop/个人网站-Tomphie`，不要在旧目录复制出另一份站点。
- 全站视觉与交互工作先阅读 `docs/superpowers/specs/2026-10-05-visual-redesign-directions.md`；旧版视觉说明仅作历史参考。
- 2026-10-05 已锚定 Motion 原生 JavaScript 版为重构动效主库，保留 Astro 静态优先架构；不为使用动效组件模板引入 React 或叠加 GSAP、Lenis。
- 全站通透玻璃使用共享材质令牌与 `src/scripts/liquid-glass.ts`；零依赖光学模型固定在 `src/vendor/liquid-glass.js`。Chromium 的滚动卡片与顶栏直接折射真实 backdrop；WebKit/Gecko 使用 `src/lib/landscape-glass.ts` 的单一隐藏 GPU 采样器，共享山水纹理，只生成可见卡片自身承载的四条弧面边缘，不再在固定背景上画滚动卡片轮廓。中央透出原始 CSS 山水；禁止为手机滚动卡片逐帧搬动整屏风景副本；只有头像题签保留同框图像兼容层。手机背景高度使用 100lvh，菜单不嵌套在顶栏玻璃内。统一单遍折射，文字与控件本身不扭曲；不引入 liquidGL/html2canvas 全页截屏或第二套动效库。来源与浏览器边界见视觉交付记录。
- 用户已确认方案 A「折光山水」，并授权重排现有内容、制作日夜背景、改善单起笔 Logo 动画；保留日夜模式，不编造科研/项目成果。实施计划见 `docs/superpowers/plans/2026-10-05-refracted-landscape.md`。
- 手机玻璃使用 10px 弧面、顶栏/菜单 9px 与面板 12px 折射、0.24 反光，透明中心与轻薄内缘保持不变，不恢复厚重贴图边框。WebKit 所有可见边缘打包进紧凑图集，每帧仅一次 GPU 到 2D 复制，再分发到卡片内的窄画布；触点高光只在按下时定位，静止触摸不启动光学循环。顶栏用独立的局部渐隐保护文字，仅跨过滚动阈值时更新状态；移动菜单必须显式 `pointer-events: auto`，选中圆角按外轮廓减内边距计算。
- 栏目固定为首页、人生轨迹、科研、项目、笔记；私人简历、未获公开授权的素材与密钥不得进入公开仓库或构建产物。
- 保留原生滚动、键盘操作、减少动态效果和玻璃不可用时的完整阅读体验。
- 只修改任务所需内容，保留用户现有改动与 `tomphie-logo/` 原始素材。
