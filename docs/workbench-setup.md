# Tomphie 私人写作工作台：启用说明

这次已完成本地代码。线上登录、跨设备草稿和一键发布，仍需要把你的 Supabase 项目与现有 GitHub 仓库连接起来。无需租服务器；不要把密码、GitHub Token 或后台密钥发到聊天中。

## 日常使用

入口在网站页脚的「私人写作工作台」，地址为 `/personal-website-tomphie/admin/`。

1. 用你设置的唯一管理员账号和密码登录；公共设备不要勾选「记住这台设备」
2. 选择科研、项目或笔记，新建草稿；标题、链接、摘要和栏目资料分别填写
3. 正文使用 Markdown，工具栏可以插入标题、列表、代码、公式和图片；手机可切换编辑/预览
4. 草稿会自动保存到私密云端，也能主动保存；只保存不会更新公开网站
5. 准备好后点击「发布到网站」并确认公开范围；等待提示部署成功后再查看文章
6. 目录选择「已发布 · 可继续编辑」，打开原文章修改，再点击「更新已发布文章」；同一篇的 ID 和公开链接不变
7. 内容未变化时会提醒，无需重复发布；部署期间发布按钮暂不可重复点击。进度读取超时可「重新检查进度」；真正部署失败时打开部署记录，在 GitHub 重新运行任务
8. 不需要的草稿可以点击「删除草稿」并确认；版本已被其他设备更新时会阻止删除

第一次发起发布后，页面链接和栏目会固定下来；即使发布连接失败，也沿用该链接重试，避免多设备写作留下重复页面。需要另一个链接时新建草稿。

图片先保存在私有桶，仅确认发布时才复制本篇引用的图片到公开仓库。第一版只接受图片，不接受 PDF 等附件，请勿上传私人简历。上传图片会重编码、移除原图元数据并缩小到约 1600px / 1MB；不是原片存档工具。

公开网站支持列表、主题筛选、标题/摘要/标签搜索、文章目录、代码和公式。进入栏目会重新读取最新公开列表，也可以点击「刷新内容」；搜索是静态页面内筛选，不是全文搜索。没有多人协作、自动导入既有文章或撤回公开文章功能。

删除的是私密草稿，不会撤下已发布文章或删除公开 Git 历史。删除已发布文章的草稿后，工作台不再保留它的编辑源；私有图片暂时保留，不自动清理。

## 一次性配置

### 1. 创建私密云端项目和唯一账号

在 [Supabase 控制台](https://supabase.com/dashboard) 创建自己的项目，可以从 Free 套餐开始；选择你方便访问的区域。不要自动购买付费套餐。

在 Authentication 设置中关闭 **Allow new users to sign up**，不提供公开注册。接着在 Authentication → Users 手动创建一个邮箱/密码账号，设置自己的强密码，并将此账号设为已确认邮箱。复制这个用户的 UUID。

前端账号名（例如 `Tomphie`）只是这个邮箱账号的别名；权限由真实 Auth 用户 UUID 决定，知道账号名或邮箱不能登录。管理员邮箱会包含在公开的工作台配置中，如果介意可使用专用邮箱。

密码验证、会话刷新和登录限速由托管 Auth 提供。不要开启匿名登录，也不要给其他账号工作台权限。

### 2. 安装私密数据库与图片权限

在项目 SQL Editor 打开并执行仓库中的：

`supabase/migrations/202610060001_workbench.sql`

再执行增量升级 `supabase/migrations/202610070001_workbench_updates.sql`，启用内容指纹与带版本检查的删除草稿接口。这份升级不会删除已有草稿。

然后只执行一次下面的管理员绑定，将占位符换成上一节用户的真实 UUID：

```sql
insert into public.workbench_owner (singleton, user_id)
values (true, '你的真实用户UUID');
```

`workbench_owner` 只允许一个管理员。不要关闭草稿表的 RLS，也不要把 `workbench-private` 桶改为公开。私密草稿不依赖「隐藏链接」或前端密码判断来保护。

若未来更换管理员，需要由项目所有者在控制台迁移草稿和图片权限，不能只改用户名。

### 3. 配置公开的前端连接信息

在项目设置/API Keys 找到 Project URL 与 **publishable key**（或传统 `anon` key）。这两个属于可以公开的连接信息，不是后台权限密钥。

在 GitHub 仓库 Settings → Secrets and variables → Actions → **Variables** 创建以下 Repository variables：

| 变量 | 值 |
| --- | --- |
| `PUBLIC_WORKBENCH_URL` | 你的 `https://项目编号.supabase.co` |
| `PUBLIC_WORKBENCH_KEY` | publishable key 或 anon key |
| `PUBLIC_WORKBENCH_USERNAME` | 你决定的唯一登录账号名，如 `Tomphie` |
| `PUBLIC_WORKBENCH_EMAIL` | 第一步创建的管理员邮箱 |

GitHub Pages 构建流程已接入这四个变量。变量变更需要重新构建网站才生效。

本地预览时复制 `.env.example` 为 `.env` 并填入同样四项，再重新启动预览。`.env` 已忽略，不要提交它。这里严禁放 `service_role`、`sb_secret_…`、GitHub Token 或密码。

构建时会额外拒绝已知的后台密钥和 GitHub Token 格式，避免误填后泄漏；这只是防误用，仍应按名称选择正确的公开 key。

### 4. 给发布服务最小的 GitHub 权限

在 GitHub 创建 **fine-grained personal access token**，只选择：

`KTommy-star/personal-website-tomphie`

Repository permissions 仅需：

- Contents：Read and write
- Actions：Read-only
- Metadata：默认 Read-only

设置有效期，后续到期需要在发布服务中替换。无需账号全部仓库权限、工作流写权限或管理员权限。Token 只进入下一节的后台 Secrets，不进入网页、GitHub 前端 Variables 或聊天。

### 5. 部署受保护的发布函数

在 Supabase 控制台 Edge Functions → Secrets 添加：

| 后台 Secret | 值 |
| --- | --- |
| `GITHUB_TOKEN` | 上一节创建的 Token |
| `GITHUB_REPOSITORY` | `KTommy-star/personal-website-tomphie` |
| `PUBLIC_SITE_URL` | `https://ktommy-star.github.io/personal-website-tomphie/` |
| `ALLOWED_ORIGINS` | `https://ktommy-star.github.io` |

`ALLOWED_ORIGINS` 是来源域名，不带网站子路径；多个域名用英文逗号分隔。如果要本地登录/发布，可以额外加入实际本地来源，如 `http://localhost:4322`；不启用时不必加入。修改正式域名时同时更新这里及 `PUBLIC_SITE_URL`。

Supabase 平台会自动提供函数中的 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`，不需要把这些后台变量复制进前端。

在桌面项目中运行下面命令，替换项目编号（可从 Project URL 获取）。CLI 登录仅用于这一次配置，不是以后工作台的登录方式：

```sh
cd "/Users/kongsanjin/Desktop/个人网站-Tomphie"
npx --yes supabase@2.119.0 login
npx --yes supabase@2.119.0 functions deploy publish-content --project-ref 你的项目编号 --no-verify-jwt
```

CLI 首次会安装官方部署工具，需联网；不要把密钥直接写进终端命令历史。

这里的 `--no-verify-jwt` **不是允许匿名发布**：函数自己调用 Supabase Auth 验证真实登录令牌，再查询唯一管理员权限，之后才允许读取草稿或调用 GitHub。关闭的是旧版网关 JWT 格式检查，以兼容新的公开 API key。不要移除函数内的身份/管理员检查。

### 6. 发布工作台代码并重新构建

完成上述配置后，将本次本地代码审阅后提交、推送到现有仓库 `main`；现有 GitHub Pages 自动部署会生成工作台。前端变量未配置时，页面会明确提示「尚未连接私密云端」，不会假装登录或保存成功。

已有线上站点不会因为这次本地修改立刻改变。本次没有替你创建云端账号、填写密钥或推送代码。

## 最少的上线确认

实际账号配置之前，自动检查只能覆盖代码、静态构建和模拟接口，不能证明线上权限已经配置正确。启用后用自己的真实账号确认以下几项即可：

- 未登录时不能读取草稿或私密图片；其他 Auth 用户没有工作台权限
- 用电脑写一篇私密草稿，手机登录后能接着写；此时 GitHub 不应出现草稿正文
- 两台设备同时改同一篇时，旧版本保存提示冲突，不覆盖新版本
- 用一篇确认可以公开的真实内容测试发布，等待 GitHub Pages 部署成功
- 退出后编辑区隐藏，公共设备未记住会话

修改尚未保存时会警告离开；保存失败或版本冲突时可以先下载本机草稿再重新载入。别把「当前文字仍在」当成「云端已保存」。

## 维护边界

- Supabase Free 有存储/调用额度，低活跃项目可能暂停；这不影响已经发布的 GitHub Pages，但私密工作台需要在控制台恢复项目。免费额度以 [官方套餐说明](https://supabase.com/pricing) 为准
- 通过控制台更改密码或恢复账号；密码不保存在网站源码中
- 图片的临时签名预览链接有有效期，不是永久公开地址
- 已发布正文和图片会进入公开 Git 历史；从网页删掉不等于历史中彻底消失
- 草稿保存只访问 Supabase，发布才写 GitHub；发布按钮成功创建提交不等于部署成功
- 若部署失败，查看仓库 Actions 的 Deploy to GitHub Pages；若 Token 到期，只更新后台 Secret
- 工作台和普通访客页面分开加载，首页不包含编辑器/认证依赖

参考：[密码认证](https://supabase.com/docs/guides/auth/passwords)、[注册开关](https://supabase.com/docs/guides/auth/general-configuration)、[私密 Storage](https://supabase.com/docs/guides/storage/buckets/fundamentals)、[Storage 权限](https://supabase.com/docs/guides/storage/security/access-control)、[GitHub 原子树提交](https://docs.github.com/en/rest/git/trees)、[部署状态查询](https://docs.github.com/en/rest/actions/workflow-runs)。
