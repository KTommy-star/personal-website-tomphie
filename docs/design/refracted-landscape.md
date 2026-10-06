# 折光山水 · 视觉与交付记录

## 视觉约定

采用用户确认的 A 方向：山水摄影的空间、书页式中文衬线标题、真实肖像、通透功能玻璃。日间为雾白/湖青/山绿，夜间为深水蓝/银绿；背景不换地点，只换光线。五栏目及真实介绍保留，珍宝库和私人简历不进入公开站点。

`apple-design` 影响了即时反馈、可中断主题过渡和减少动画；`frontend-design` 影响了首屏非对称构图、章节尺度和原创图形，而不是同尺寸模板拼贴。

玻璃已于 2026-10-06 升级为浏览器 SVG 光学材质：实际弧面折射、清晰中心、细微色散和随交互变化的高光，文字本身不扭曲。不是苹果原生 Liquid Glass SDK；减少透明度和高对比设置下使用实色阅读表面。

## 原创图像资产

均使用本次会话内置图像生成工具，不使用 API CLI、不购买或转载远程摄影素材

- `src/assets/landscape/day.png`：原创日景
- `src/assets/landscape/night.png`：以日景为输入编辑的同构夜景
- `src/assets/profile-artwork.png`：用户提供的湖畔复古头像原件；显示层裁出下半幅插画，让人物居中，不修改人物或图像内容。旧的原始个人照片与本地裁切文件保留，不再由首页引用

背景是想象的装饰山水，不标记为用户到访地点。日夜图像由 Astro 输出 WebP；最大背景输出约 119KB/114KB，手机按照 cover 后的实际画幅选择资源，避免拿窄屏宽度误选低清晰度源图。

### 日景提示词设计要点

One original 16:9 fine-art realistic, poetic landscape photograph. A still jade/silver lake and layered hazy mountain ridges, a contemporary landscape-photography treatment with subtle Chinese shanshui sensitivity, not a literal ink painting. Pearl sky, muted cyan water and pale blue-green hills in daylight. Mountains toward the right/lower middle, generous luminous upper-left negative space for actual HTML typography. Horizon around 55%, delicate natural water ripples, a small rocky shore and grasses only at the far bottom-right. No text, logo, watermark, people, buildings, boats, UI, lens objects, rainbow glow, visible sun or moon. Imagined decorative landscape, not a fabricated personal trip. Clear geometry for a matching night version preserving mountains, shore and horizon.

### 夜景实际编辑提示词

Create the NIGHT companion background for this personal portfolio landscape. Preserve EXACTLY the mountain silhouettes, shore, rocks, reflection geometry, horizon, composition, framing, camera position, and landscape features of the supplied daylight photograph so crossfading the two versions will feel like the same scene. Change ONLY lighting, sky and time of day: exquisite tranquil moonlit deep navy and muted teal lake, silver-blue light on mountain ridges, distant mist still subtly visible, a dark blue clear sky with a few extremely subtle small stars. Beautiful fine art nocturnal landscape photography, readable soft upper-left negative space with gentle blue atmospheric illumination, realistic delicate moonlight reflecting on still water. No visible moon or sun, no text, no people, no buildings, no boats, no logos, no watermarks, no interface. Do not add new landscape features. Retain premium detailed natural photography and the exact 16:9 original framing.

## Logo 与动效

保留用户原 Logo 的笔画形状。原始素材含分离的笔画，不能在不改标志的前提下变为几何意义的无抬笔单路径；本版实现一个连续的书写进度，按实际笔画长度依序绘制。未轮到的笔画完全透明，只有当前书写的末端可见，不并发显示圆头散点。完成约 2.1 秒，正文和操作无需等署名完成。减少动画时直接完整呈现。

主题状态立即更新，匹配构图的风景图层以 900ms 不锁定输入的过渡续接；太阳/月亮、玻璃颜色和按钮符号相互呼应。保留系统主题与 localStorage。滚动保持原生，经历进度绑定叙事范围而非固定侧栏的坐标。

## 2026-10-05 首版检查与边界

- `npm run verify`：17 个逻辑测试、11 个产物测试；Astro 类型检查 0 错误，6 个静态页面
- `npm run test:browser`：13 项全部通过，新增头像下半幅显示/人物居中以及清透玻璃检查；真实 Chrome、两种主题及 320/390/768/1440，覆盖早期 Logo、快速主题切换/刷新、图片加载、布局、键盘菜单、复制、研究兴趣、滚动进度、减少动画、高对比玻璃降级与地图题注对比
- 独立审查发现并修正了地图题注过淡、实色玻璃降级被局部样式覆盖、研究选择误改中心圆三处问题；补充的三个浏览器回归检查均先复现失败，再在修正后通过
- 独立查看桌面/手机/夜景截图，并检查人生轨迹、科研、项目、笔记的日夜与 390/1440 布局
- 不将 Chrome 桌面设备模拟冒称真实 iOS Safari 硬件验证；发布前仍建议真实设备访问
- 原有内容库仍为空，构建会提示这些目录尚无文章；未虚构成果来消除提示
- 安装动效时 npm 审计提示既有间接依赖 `devalue` / `http-cache-semantics` 的高风险公告；Motion 不在报告内，未自动升级无关核心依赖。当前发布产物是静态文件，这不等于宣布依赖审计已清零
- 首版仅本地预览；用户随后明确授权完成三项修改后更新现有公开 GitHub Pages，沿用原发布工作流

## 用户确认后的发布调整

- 普通玻璃日间/夜间底色透明度为 14%/18%，导航与联系为 24%/28%；模糊 6–8px，降低白色高光遮罩，保留文字与实色降级
- 删除首页「此刻的坐标」浮块，避免遮挡肖像
- 修复 CSS 压缩只保留前缀声明的问题：标准属性置于最后，Vite CSS 目标明确包含 Safari/iOS 16.4，保留两种玻璃声明；经历筛选栏接入同一高对比降级
- 定位参考：[Lightning CSS 问题记录](https://github.com/parcel-bundler/lightningcss/issues/695)、[Vite CSS 构建目标说明](https://vite.dev/config/build-options.html#build-csstarget)；结论也经本机最小编译与产物浏览器检查复现，不冒称真实旧版 Safari 测试

本机构建预览：`http://127.0.0.1:4322/`
公开发布入口：`https://ktommy-star.github.io/personal-website-tomphie/`

## 2026-10-06 · 真实通透折射升级

用户指出原版全局玻璃仍接近毛玻璃，授权改善材质并直接更新现有部署。本轮不重排内容、不改变私人简历策略、不更换发布平台。

### 唯一材质实现

- 参考 [Apple Liquid Glass 总览](https://developer.apple.com/documentation/technologyoverviews/liquid-glass) 与 [Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/)，采用透镜折光、轻薄功能层、即时触摸反馈和可读性优先的原则，而不是提高模糊强度
- 锚定 [gentpan/liquidglass](https://github.com/gentpan/liquidglass) 的零依赖 SVG 引擎 v1.0.0，固定来源提交 `068ad226f53e1ca62d857f78bdc32f58f3c5fce7`，自托管于 `src/vendor/liquid-glass.js`；MIT 许可保留于 `public/licenses/liquid-glass.txt`。没有运行外部脚本、添加 React 或安装截屏依赖；未使用其组件和 spring，动效主库仍为 Motion
- `src/scripts/liquid-glass.ts` 对所有 `.glass` 功能面板添加独立装饰层，对齐复制当前日夜山水；头像题签复制同位置头像，文字、图标、链接不进入折射层
- 折射由曲面轮廓与折射率生成位移图，普通 `filter` 驱动 `feDisplacementMap`。不依赖只有 Chromium 支持的 `backdrop-filter: url()`；沿用上游的 WebKit/Gecko 尺度补偿、图像预解码与滤镜刷新处理
- 中心不做光学模糊，原生 backdrop 仅保留 0.6px 的微量抗噪；日间底色 6%/12%、夜间 8%/16%。玻璃边缘折射 16–21px，桌面有微弱色散，触屏使用单次折射减少开销
- 景色在滚动、粘性定位、视口变化和短暂按压变形时保持对齐。日夜副本使用与原背景相同的即时主题状态和交叉渐变，不使用有延迟的全页截图
- 只为进入视野的面板初始化透镜，位移图仅随形状变化生成，滚动只更新位置，静止时没有持续绘制循环；减少动态时不做触摸光学形变，高对比/减少透明度时关闭折射并恢复实色

### 本轮必要检查

- 类型检查：0 错误 / 0 警告 / 0 提示；正式静态构建成功，6 页
- 仅运行 5 项相关浏览器检查：全站功能面板真实折射、边缘像素位移而中心保持清晰、日夜交叉渐变与保存、手机菜单/复制、高对比降级；5 项通过，约 5.3 秒，没有重复全量验证
- 像素检查临时在卡片装饰层放置条纹，比较启用/关闭位移原语的截图；边缘变化显著高于中心，排除仅有透明度、阴影或高光但没有折射的情况。条纹只存在于检查页面，不进入站点资产
- 查看实际桌面日景、卡片、夜景与 390px 手机截图；无运行时错误、桌面无横向溢出，导航仍约 58px。未冒称使用真实 Safari/iPhone 硬件验证

### 浏览器实现边界

这是一套真实折射装饰背景的网页材质，不是对苹果私有系统渲染器的逐像素复刻。不抓取任意滚动正文，也不把文字复制或扭曲进透镜；导航下经过的正文仍用原生 backdrop 合成，山水与头像的折射由独立同步图层提供。引擎的跨浏览器实现有上游依据，本轮实际像素验收使用本机 Chrome。
