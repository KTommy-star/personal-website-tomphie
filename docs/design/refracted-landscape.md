# 折光山水 · 视觉与交付记录

## 视觉约定

采用用户确认的 A 方向：山水摄影的空间、书页式中文衬线标题、真实肖像、通透功能玻璃。日间为雾白/湖青/山绿，夜间为深水蓝/银绿；背景不换地点，只换光线。五栏目及真实介绍保留，珍宝库和私人简历不进入公开站点。

`apple-design` 影响了即时反馈、可中断主题过渡和减少动画；`frontend-design` 影响了首屏非对称构图、章节尺度和原创图形，而不是同尺寸模板拼贴。

玻璃已于 2026-10-06 升级为浏览器 SVG 光学材质，并根据用户滚动反馈完成稳定化：实际弧面折射、清晰中心和随交互变化的高光。滚动面板优先直接过滤真实背景，不扭曲面板自身文字；不再使用三遍 RGB 色散。不是苹果原生 Liquid Glass SDK；减少透明度和高对比设置下使用实色阅读表面。

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

## 2026-10-06 · 初版真实通透折射升级

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

## 2026-10-06 · 全站卡片滚动稳定化（桌面阶段，手机分支已由下一节替代）

用户指出上下滚动时所有同类卡片背景卡顿、脱离。复现发现：浏览器合成线程先滚动卡片，JavaScript 下一帧再搬动每份全屏山水副本，造成错位；四张大卡片同时重绘，三遍色散进一步加重开销。此前仅验证静态光学像素，未发现持续滚动的成本。

本次修改仅涉及共享玻璃脚本及相关回归检查，不改内容和视觉排版：

- Chrome / Edge 的所有滚动玻璃直接使用同一引擎的原生 backdrop 模式，采样卡片背后的真实画面。滚动不再测量/改写卡片背景坐标，不再在卡片内复制完整风景；背景的明暗与章节一致，避免出现独立贴图的割裂感
- 导航是固定位置，使用静态对齐的山水层，不参与滚动同步，也不让路过的标题成为导航后第二层扭曲文字；头像兼容层与原图同框移动，同样不必随滚动更新
- WebKit / Gecko 仍保留普通 SVG filter 的图像兼容分支。尺寸和位置先统一读取再写入；未变化的尺寸/位置不重复写入，所有浏览器改为单遍折射，不取消弧面、透明中心或高光
- 透镜只在面板进入视野或尺寸改变时初始化/更新形状。原生分支的 hover/press 不启动背景跟踪帧循环；仅非原生短暂形变需要跟踪。释放操作只有一个共享处理器，只更新被按下的面板
- 日夜交叉渐变、真实复制联系方式、手机菜单、减少动态与高对比降级保留

### 对照结果

本机 Chrome、1440×960、减少动态模式、4 倍 CPU 降速，使用相同位置、速度 700px/s、上下各 1100px 的原生滚动手势。数据是此条件下的对照，不宣称所有手机都达到固定帧率。

| 指标 | 修改前 | 最终版本 |
| --- | ---: | ---: |
| 背景副本样式改写次数 | 457 | 0 |
| 超过 28ms 的帧 / 总采样帧 | 57 / 122 | 14 / 186 |
| 95 分位帧间隔 | 50ms | 33ms |
| 主线程任务耗时 | 291ms | 213ms |
| 样式重算耗时 | 77ms | 51ms |

滚动回归检查在旧实现先失败（单次滚动写入 126 次，预期 0），修复后通过。最终只运行 6 项相关浏览器检查：全站功能玻璃、真实背景像素折射、滚动无副本改写、日夜保存/过渡、菜单/复制、高对比；全部通过，约 6.9 秒。最终类型检查 0 错误 / 0 警告 / 0 提示，6 页构建成功。查看日夜卡片与 390px 人生轨迹地图，无浏览器异常或地图横向溢出；未冒称真实 Safari/iPhone 实测。

技术依据：[Chromium 的主线程与合成滚动架构](https://developer.chrome.com/docs/chromium/renderingng-architecture)、[MDN：backdrop-filter 与 SVG 滤镜](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)。不同引擎的 backdrop URL 边界沿用固定引擎的实现说明，不把仅有 CSS 语法支持误判为实际折射支持。

## 2026-10-06 · iPhone 共享山水光学层与实时导航（已由 2026-10-08 的边缘附着方案替代）

用户确认桌面已经正常，但 iPhone 全部同类卡片仍有切割/卡顿，同时要求顶栏采样实时背景。原因是上一轮只让 Chromium 走原生路径，WebKit 的卡片仍逐帧移动各自的全屏山水副本；iOS 地址栏伸缩还会改变背景取景。没有把手机窗口尺寸的 Chrome 检查当作 Safari 渲染验证。

- Chromium 卡片保留原生 backdrop，顶栏取消静态图片例外，同样直接折射实时页面；不重排桌面内容
- WebKit/Gecko 懒加载 `src/lib/landscape-glass.ts`，只创建一个 WebGL 场景，复用固定引擎的曲面光学位移图。它是页面真正显示的山水背景，不在每个卡片内叠放贴图；卡片中央不重复绘制，只有可见弧面边缘按相同世界坐标采样折射。滚动无需改写图片位置或上传整屏纹理
- 只在首次加载、真实尺寸/图片改变时上传日夜背景纹理；位移图只在形状改变时生成。绘制分辨率最高 1.5×，位移图最长边 512px，静止和隐藏页面不运行持续循环，日夜过渡/短按压期间才补齐绘制帧
- 手机背景采用 `100lvh`，地址栏收起/展开时不重新缩放山水；日夜折射共用场景的实际渐变进度，没有另一个滞后的主题副本
- 手机菜单移到顶栏玻璃的兄弟层，避免嵌套 backdrop root 切断对真实页面的采样。菜单局部 3px 抗叠影与适度底色保证阅读，顶栏保持轻薄清透；保留 native details、点击外部关闭、从菜单链接按 Escape 返回触发器
- 头像题签只保留同框照片折射，不随滚动同步整屏景色。高对比/减少透明度关闭光学层；WebGL 不可用或丢失时恢复原 CSS 山水及可用界面

浏览器边界：Safari 的任意 DOM 内容 SVG backdrop 位移尚不能依赖。因此 iPhone 的真实光学折射针对当前山水背景，路过正文仍通过原生 CSS backdrop 合成，不截屏或伪造任意 DOM 折射。[WebKit 已知问题与近期状态](https://bugs.webkit.org/show_bug.cgi?id=245510)、[沿用的光学引擎及 WebGL 实现](https://github.com/gentpan/liquidglass)。MIT 来源许可仍保留，没有新安装依赖或第二套动效库。

验证使用本机 Chrome 的真实像素检查，以及 iPhone UA/触控/DPR=3 下明确进入 WebKit 兼容代码路径的检查，不是 Safari 内核或 iPhone 硬件帧率验证。新回归先在旧实现失败（共享场景数 0、导航含静态副本），修复后可见只有一个场景、卡片及导航没有整屏副本，触控滚动时副本样式写入 0 次。查看日夜与手机菜单实际截图，无运行时/GL 异常；不承诺所有 iPhone 型号达到固定帧率。

类型检查 0 错误 / 0 警告 / 0 提示，正式 6 页构建成功；只运行 7 项与此次修改有关的浏览器回归（约 7.8 秒）。另外模拟 WebGL 上下文丢失，场景恢复且导航保持可用；切换高对比时立即使用实色，不沿用原先 700ms 透明渐变。

## 2026-10-08 · 手机滚动拖影修复（当前方案）

之前的共享背景避免了整屏照片副本，但仍把移动卡片的折射轮廓绘制在固定画布上。Safari 原生滚动和主线程光学坐标更新不同步时，轮廓会留在旧位置。现在原始 CSS 山水始终显示，单一隐藏 WebGL 采样器仅生成四条透明光学边缘，并将这些窄画布附着在各自卡片内部；原生合成滚动直接带走卡片与边缘，不再依赖 JavaScript 对齐轮廓。

- 日夜纹理共用、仅随真实尺寸或图片变化上传；只更新可见玻璃，内缘平滑融入真实背景，圆形透镜的对角弧面也被覆盖
- GPU 只绘制边缘，卡片中心不复制照片；四条边缘绘制后才复制结果，避免每条边缘分别等待一次 GPU 绘制。静止时无持续循环，没有新运行时依赖
- Chromium / 安卓 Chrome / 桌面原生 backdrop 路径保持不变；WebKit / Gecko 使用同一曲面模型。视觉语言一致，不声称不同浏览器的任意 DOM 折射能力完全相同
- 顶栏和工作台共用修复，保留触摸反馈、日夜渐变、减少动态、高对比和 GPU 丢失后的原生透明降级；补齐 visualViewport 滚动通知
- `tests/mobile-glass.mjs` 使用真正的 Playwright WebKit 26.5：旧实现先因边缘没有附着到卡片而失败，新实现通过延迟绘制时的滚动附着、实际像素折射、透明中心、320/390/844px 横竖屏、日夜与 GPU 丢失检查。另检查安卓 Chrome 触屏配置；不是实体 iPhone / 安卓硬件帧率保证
- 同时通过既有桌面玻璃回归及工作台共用玻璃/紧凑顶栏检查。WebKit 本机 DPR=3 的 70 帧滚动采样，95 分位帧间隔 21ms，仅代表该测试环境

技术依据：[WebKit 的异步滚动架构](https://trac.webkit.org/wiki/Scrolling)。重跑手机浏览器检查需安装对应 Playwright WebKit；网站自身不依赖 Playwright。
