# Tomphie 网站协作约定

- 项目唯一工作目录是 `/Users/kongsanjin/Desktop/个人网站-Tomphie`，不要在旧目录复制出另一份站点。
- 全站视觉与交互工作先阅读 `docs/superpowers/specs/2026-10-05-visual-redesign-directions.md`；旧版视觉说明仅作历史参考。
- 2026-10-05 已锚定 Motion 原生 JavaScript 版为重构动效主库，保留 Astro 静态优先架构；不为使用动效组件模板引入 React 或叠加 GSAP、Lenis。
- 通透玻璃使用共享材质令牌；liquidGL 是关键区域的折射增强候选，需先验证移动端性能与降级，再决定启用范围。
- 用户已确认方案 A「折光山水」，并授权重排现有内容、制作日夜背景、改善单起笔 Logo 动画；保留日夜模式，不编造科研/项目成果。实施计划见 `docs/superpowers/plans/2026-10-05-refracted-landscape.md`。
- 栏目固定为首页、人生轨迹、科研、项目、笔记；私人简历、未获公开授权的素材与密钥不得进入公开仓库或构建产物。
- 保留原生滚动、键盘操作、减少动态效果和玻璃不可用时的完整阅读体验。
- 只修改任务所需内容，保留用户现有改动与 `tomphie-logo/` 原始素材。
