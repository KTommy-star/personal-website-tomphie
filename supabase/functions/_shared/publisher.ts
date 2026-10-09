import { collectAssets, serializePublication, uuidPattern, validatePublication, publicationFingerprint, collections, type Draft, type PublicArticle } from "./content.ts";
import { getAssetType, MAX_PUBLICATION_ASSETS, MAX_PUBLICATION_ASSET_BYTES, validateAssetBytes } from "./assets.ts";
import { canonicalArticle, decodeGitSource, gitShaPattern, readPublicSource, operationMessage, readOperation, type PublicationOperation } from "./publication-source.ts";

export interface PublishEnv {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GITHUB_TOKEN: string;
  GITHUB_REPOSITORY: string;
  PUBLIC_SITE_URL: string;
  ALLOWED_ORIGINS: string;
}
class RequestError extends Error {
  constructor(message: string, public status = 400, public upstreamStatus?: number) { super(message); }
}
function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
async function boundedAssetBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  const tooLarge = () => new RequestError("附件超过单个文件限制或本篇文章附件总计 40 MB 的限制", 413);
  if (Number(response.headers.get("content-length")) > maxBytes) throw tooLarge();
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > maxBytes) { await reader.cancel(); throw tooLarge(); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const prefix = new TextEncoder().encode(`blob ${bytes.length}\0`); const content = new Uint8Array(prefix.length + bytes.length);
  content.set(prefix); content.set(bytes, prefix.length);
  const hash = await crypto.subtle.digest("SHA-1", content);
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function handlePublishRequest(request: Request, env: PublishEnv, fetcher: typeof fetch = fetch): Promise<Response> {
  const origin = request.headers.get("origin") ?? "";
  const allowed = env.ALLOWED_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean) ?? [];
  const headers: Record<string, string> = { "Content-Type": "application/json", "Cache-Control": "no-store", Vary: "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
  const reply = (data: unknown, status = 200) => Response.json(data, { status, headers });
  if (origin && !allowed.includes(origin)) return reply({ error: "此站点未获工作台授权" }, 403);
  if (origin) headers["Access-Control-Allow-Origin"] = origin;
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply({ error: "不支持此操作" }, 405);
  const token = request.headers.get("authorization");
  if (!token?.startsWith("Bearer ")) return reply({ error: "请先登录工作台" }, 401);
  try {
    if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY || !env.GITHUB_TOKEN || !/^[\w.-]+\/[\w.-]+$/.test(env.GITHUB_REPOSITORY) || !env.PUBLIC_SITE_URL || !allowed.length) throw new RequestError("发布服务尚未完成配置", 503);
    const publicSite = new URL(env.PUBLIC_SITE_URL.endsWith("/") ? env.PUBLIC_SITE_URL : `${env.PUBLIC_SITE_URL}/`);
    if (publicSite.protocol !== "https:") throw new RequestError("公开网站必须使用 HTTPS", 503);
    const userHeaders = { apikey: env.SUPABASE_ANON_KEY, authorization: token, "Content-Type": "application/json" };
    const upstream = async (url: string, init: RequestInit) => {
      const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(20_000) });
      if (!response.ok) throw new RequestError("发布连接失败，请检查后台授权或稍后重试；私密草稿仍然保留", 502, response.status);
      return response;
    };
    const userResponse = await fetcher(`${env.SUPABASE_URL}/auth/v1/user`, { headers: userHeaders, signal: AbortSignal.timeout(15_000) });
    if (!userResponse.ok) throw new RequestError("登录已过期，请重新登录", 401);
    const user = await userResponse.json();
    if (!uuidPattern.test(user.id)) throw new RequestError("登录无效", 401);
    const ownerResponse = await upstream(`${env.SUPABASE_URL}/rest/v1/rpc/is_workbench_owner`, { method: "POST", headers: userHeaders, body: "{}" });
    if (await ownerResponse.json() !== true) throw new RequestError("该账号没有工作台权限", 403);
    const raw = await request.text();
    if (raw.length > 2048) throw new RequestError("请求过大", 413);
    let payload: { action?: string; draftId?: string; revision?: number; commit?: string; collection?: string; slug?: string; sha?: string };
    try { payload = JSON.parse(raw); } catch { throw new RequestError("请求格式不正确"); }
    if (!payload || typeof payload !== "object") throw new RequestError("请求格式不正确");
    const gitRoot = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
    const gitHeaders = { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" };
    const git = async (path: string, method = "GET", body?: unknown) => (await upstream(`${gitRoot}${path}`, { method, headers: gitHeaders, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
    const recordPublication = async (endpoint: string, fields: Record<string, unknown>, id: string): Promise<Draft | undefined> => {
      try {
        const result = await fetcher(endpoint, { method: "PATCH", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" }, body: JSON.stringify(fields), signal: AbortSignal.timeout(15_000) });
        if (!result.ok) return;
        const rows = await result.json();
        if (Array.isArray(rows) && rows.length === 1 && rows[0].id === id) return rows[0] as Draft;
      } catch { /* Git is authoritative after a successful branch update. */ }
    };
    const runPublication = async (snapshot: Draft, operation: string, work: (moveRef: (sha: string) => Promise<void>) => Promise<Response>) => {
      let attemptedRef = false, updatedRef = false;
      try {
        return await work(async sha => {
          attemptedRef = true;
          await git("/git/refs/heads/main", "PATCH", { sha, force: false });
          updatedRef = true;
        });
      } catch (error) {
        const rejectedRef = error instanceof RequestError && error.upstreamStatus !== undefined && error.upstreamStatus >= 400 && error.upstreamStatus < 500;
        if (!updatedRef && (!attemptedRef || rejectedRef)) {
          const keys = ["published_commit", "published_url", "published_slug", "published_collection", "published_revision", "published_fingerprint", "published_at", "unpublished_commit", "unpublished_at", "publication_operation"] as const;
          const fields = Object.fromEntries(keys.map(key => [key, snapshot[key] ?? null]));
          await recordPublication(`${env.SUPABASE_URL}/rest/v1/workbench_drafts?id=eq.${snapshot.id}&owner_id=eq.${user.id}&publication_operation=eq.${operation}&select=*`, { ...fields, publication_pending: snapshot.publication_pending ?? false }, snapshot.id);
        }
        throw error;
      }
    };
    const articleInventory = async (collection: string, ref: string) => {
      const entries = await git(`/contents/src/content/${collection}?ref=${ref}`);
      if (!Array.isArray(entries) || entries.length >= 1000) throw new RequestError("公开文章目录不完整，请稍后重试或检查源文件", 502);
      return entries.filter((entry: { type?: string; name?: string; path?: string; sha?: string }) => entry.type === "file" && typeof entry.name === "string" && /^[a-z0-9][a-z0-9-]{0,79}\.md$/.test(entry.name) && entry.path === `src/content/${collection}/${entry.name}` && gitShaPattern.test(entry.sha ?? "")) as { name: string; path: string; sha: string }[];
    };
    const workflowRun = async (query: string) => {
      const result = await git(`/actions/runs?${query}&per_page=30`);
      return (result.workflow_runs ?? []).filter((run: { path?: string; name?: string; head_branch?: string }) => (run.path === ".github/workflows/deploy.yml" || run.name === "Deploy to GitHub Pages") && (!run.head_branch || run.head_branch === "main"));
    };
    const isAncestor = async (base: string, head: string) => base === head || ["ahead", "identical"].includes((await git(`/compare/${base}...${head}`)).status);
    const checkOperation = async (commit: string, suppliedDraft?: Draft) => {
      const runs = await workflowRun(`head_sha=${commit}`);
      let run = runs[0];
      let state: "pending" | "success" | "failure" = !run || run.status !== "completed" ? "pending" : run.conclusion === "success" ? "success" : "failure";
      const committed = await git(`/commits/${commit}`);
      const operation = readOperation(committed.commit?.message);
      if (!operation) return { state, url: run?.html_url ?? publicSite.href };
      const canonical = canonicalArticle(operation.collection, operation.slug);
      const change = committed.files?.find((file: { filename?: string; status?: string }) => file.filename === canonical.path);
      if (!change || (operation.action === "unpublish" ? change.status !== "removed" : !["added", "modified"].includes(change.status))) throw new RequestError("发布任务与文章源文件变化不匹配，未更新私密记录", 409);
      if (operation.action === "publish" && !gitShaPattern.test(change.sha ?? "")) throw new RequestError("发布任务缺少有效文章版本标识，未更新私密记录", 409);
      const ref = await git("/git/ref/heads/main");
      if (!await isAncestor(commit, ref.object.sha)) return { state: "pending" as const, url: run?.html_url ?? publicSite.href, action: operation.action, warning: "提交尚未确认进入网站主分支，私密源仍保留" };
      const current = (await articleInventory(canonical.collection, ref.object.sha)).find(entry => entry.path === canonical.path);
      const present = operation.action === "publish" ? current?.sha === change.sha : !current;
      if (!present) return { state: "failure" as const, url: run?.html_url ?? publicSite.href, action: operation.action, ...(operation.action === "unpublish" ? { withdrawalConfirmed: false } : {}), warning: "文章的当前公开源已变化，未覆盖私密记录" };
      const endpoint = `${env.SUPABASE_URL}/rest/v1/workbench_drafts?id=eq.${operation.draftId}&owner_id=eq.${user.id}&publication_operation=eq.${operation.operation}&select=*`;
      const rows = suppliedDraft ? [suppliedDraft] : await (await upstream(endpoint, { headers: userHeaders })).json();
      const draft = rows[0] as Draft | undefined;
      if (!draft || draft.id !== operation.draftId || draft.publication_operation !== operation.operation || draft.collection !== operation.collection || draft.slug !== operation.slug) {
        return { state, url: run?.html_url ?? publicSite.href, action: operation.action, ...(operation.action === "unpublish" ? { withdrawalConfirmed: false } : {}), warning: "此操作已被后续操作替代，未覆盖当前私密记录" };
      }
      // A newer successful deployment may include a cancelled operation's commit.
      if (present && state !== "success") {
        const successors = await workflowRun("branch=main&status=success");
        for (const successor of successors) {
          if (successor.status !== "completed" || successor.conclusion !== "success" || !gitShaPattern.test(successor.head_sha ?? "") || !await isAncestor(commit, successor.head_sha) || !await isAncestor(successor.head_sha, ref.object.sha)) continue;
          const candidate = (await articleInventory(canonical.collection, successor.head_sha)).find(entry => entry.path === canonical.path);
          if (operation.action === "unpublish" ? Boolean(candidate) : candidate?.sha !== change.sha) continue;
          state = "success"; run = successor; break;
        }
        if (state !== "success" && ref.object.sha !== commit) {
          const latest = (await workflowRun(`head_sha=${ref.object.sha}`))[0];
          if (!latest || latest.status !== "completed") { state = "pending"; if (latest) run = latest; }
        }
      }
      const url = new URL(`${canonical.collection}/${canonical.slug}/`, publicSite).href;
      const fields: Record<string, unknown> = operation.action === "unpublish"
        ? { published_commit: null, published_revision: null, published_fingerprint: null, unpublished_commit: commit, unpublished_at: state === "success" ? draft.unpublished_at ?? new Date().toISOString() : null, publication_pending: false }
        : { published_commit: commit, published_url: url, published_slug: canonical.slug, published_collection: canonical.collection, published_revision: operation.revision, published_fingerprint: operation.fingerprint ?? null, published_at: draft.published_at ?? operation.publishedAt ?? new Date().toISOString(), unpublished_commit: null, unpublished_at: null, publication_pending: false };
      const changed = Object.entries(fields).some(([key, value]) => (draft as unknown as Record<string, unknown>)[key] !== value);
      const recorded = changed ? await recordPublication(endpoint, fields, draft.id) : draft;
      return { state, url: run?.html_url ?? publicSite.href, commit, action: operation.action, ...(recorded ? { draft: recorded } : { warning: "Git 操作已完成，但私密状态暂未恢复；请重新检查进度" }), ...(operation.action === "unpublish" ? { withdrawalConfirmed: state === "success" && Boolean(recorded?.unpublished_at) } : {}) };
    };
    if (payload.action === "catalog" || payload.action === "recover") {
      if (!collections.includes(payload.collection as typeof collections[number])) throw new RequestError("文章栏目不正确");
      const collection = payload.collection as typeof collections[number];
      let canonical: ReturnType<typeof canonicalArticle> | undefined;
      if (payload.action === "recover") {
        try { canonical = canonicalArticle(collection, payload.slug); } catch (error) { throw new RequestError((error as Error).message); }
        if (!gitShaPattern.test(payload.sha ?? "")) throw new RequestError("公开文章版本标识不正确");
      }
      const ref = await git("/git/ref/heads/main");
      const entries = await articleInventory(collection, ref.object.sha);
      const articles: PublicArticle[] = [];
      for (const entry of entries) {
        if (canonical && entry.path !== canonical.path) continue;
        if (canonical && entry.sha !== payload.sha) throw new RequestError("公开文章已更新，请刷新目录后重试", 409);
        let source: ReturnType<typeof readPublicSource>;
        try { source = readPublicSource(decodeGitSource(await git(`/git/blobs/${entry.sha}`)), collection, entry.name.slice(0, -3)); }
        catch { throw new RequestError("无法读取完整公开文章源文件，请重试", 502); }
        if (!source.public) continue;
        const slug = entry.name.slice(0, -3);
        const url = new URL(`${collection}/${slug}/`, publicSite).href;
        if (canonical) {
          if (!source.metadata || source.body === undefined) throw new RequestError(source.warning ?? "此源文件格式暂不支持工作台编辑");
          const response = await upstream(`${env.SUPABASE_URL}/rest/v1/rpc/recover_workbench_publication`, { method: "POST", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ draft_id: crypto.randomUUID(), article_owner: user.id, draft_collection: collection, draft_slug: slug, draft_metadata: source.metadata, draft_body: source.body, source_commit: ref.object.sha, source_url: url }) });
          const restored = await response.json();
          const draft = Array.isArray(restored) ? restored[0] : restored;
          if (!draft || !uuidPattern.test(draft.id ?? "") || draft.collection !== collection || draft.slug !== slug) throw new RequestError("恢复记录未完成，公开源文件仍保留", 502);
          return reply({ draft });
        }
        articles.push({ collection, slug, title: source.title, sha: entry.sha, url, commit: ref.object.sha, recoverable: !source.warning, ...(source.warning ? { warning: source.warning } : {}) });
      }
      if (canonical) throw new RequestError("公开文章不存在，请刷新目录", 404);
      return reply({ articles });
    }
    if (payload.action === "reconcile") {
      if (!uuidPattern.test(payload.draftId ?? "")) throw new RequestError("草稿标识不正确");
      const rows = await (await upstream(`${env.SUPABASE_URL}/rest/v1/workbench_drafts?id=eq.${payload.draftId}&owner_id=eq.${user.id}&select=*`, { headers: userHeaders })).json();
      const draft = rows[0] as Draft | undefined;
      if (!draft || draft.id !== payload.draftId) throw new RequestError("草稿不存在或无权读取", 404);
      if (!draft.publication_pending && !(draft.unpublished_commit && !draft.unpublished_at)) return reply({ draft });
      if (!uuidPattern.test(draft.publication_operation ?? "")) return reply({ draft, warning: "此草稿缺少发布操作记录，请检查部署记录" });
      const canonical = canonicalArticle(draft.collection, draft.slug);
      const history = await git(`/commits?path=${encodeURIComponent(canonical.path)}&sha=main&per_page=100`);
      if (!Array.isArray(history)) throw new RequestError("无法读取文章操作记录，请重试", 502);
      const match = history.find(item => { const operation = readOperation(item.commit?.message); return operation?.draftId === draft.id && operation.operation === draft.publication_operation; });
      if (!match || !gitShaPattern.test(match.sha ?? "")) return reply({ draft, warning: "暂未找到此操作的主分支提交，私密源保留；请检查部署记录后重试" });
      return reply(await checkOperation(match.sha, draft));
    }
    if (payload.action === "status") {
      if (!/^[a-f0-9]{40}$/.test(payload.commit ?? "")) throw new RequestError("发布任务标识不正确");
      return reply(await checkOperation(payload.commit!));
    }
    if (!["publish", "unpublish"].includes(payload.action ?? "") || !uuidPattern.test(payload.draftId ?? "") || !Number.isInteger(payload.revision) || Number(payload.revision) < 1) throw new RequestError("请先保存文章，再发布");
    const endpoint = `${env.SUPABASE_URL}/rest/v1/workbench_drafts?id=eq.${payload.draftId}&select=*`;
    const drafts = await (await upstream(endpoint, { headers: userHeaders })).json();
    const draft = drafts[0] as Draft | undefined;
    if (!draft || draft.id !== payload.draftId) throw new RequestError("草稿不存在或无权读取", 404);
    if (draft.revision !== payload.revision) throw new RequestError("草稿版本已改变，请重新预览保存后再发布", 409);
    if (draft.published_slug && (draft.published_slug !== draft.slug || draft.published_collection !== draft.collection)) throw new RequestError("已开始发布的内容请保持原栏目与链接");
    if (payload.action === "unpublish") {
      if (!gitShaPattern.test(payload.sha ?? "")) throw new RequestError("公开文章版本标识不正确");
      let canonical: ReturnType<typeof canonicalArticle>;
      try { canonical = canonicalArticle(draft.collection, draft.slug); } catch (error) { throw new RequestError((error as Error).message); }
      const ref = await git("/git/ref/heads/main");
      const entry = (await articleInventory(canonical.collection, ref.object.sha)).find(item => item.path === canonical.path);
      if (!entry) throw new RequestError("公开文章不存在，请刷新目录后重试", 404);
      if (entry.sha !== payload.sha) throw new RequestError("公开文章已更新，尚未撤下；请刷新目录后重新确认", 409);
      const source = readPublicSource(decodeGitSource(await git(`/git/blobs/${entry.sha}`)), canonical.collection, canonical.slug);
      if (!source.public) throw new RequestError("此文章不是当前公开版本，尚未撤下", 409);
      const reservation = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/reserve_workbench_publication`, { method: "POST", headers: userHeaders, body: JSON.stringify({ draft_id: draft.id, expected_revision: draft.revision }), signal: AbortSignal.timeout(15_000) });
      if (!reservation.ok) throw new RequestError("草稿版本已改变或无法锁定文章，尚未撤下，请重新载入", 409);
      const reserved = await reservation.json();
      if (!uuidPattern.test(reserved.publication_operation ?? "")) throw new RequestError("发布操作保护尚未升级，请执行工作台升级 SQL", 503);
      const operation: PublicationOperation = { draftId: draft.id, operation: reserved.publication_operation, action: "unpublish", collection: canonical.collection, slug: canonical.slug, revision: draft.revision };
      return await runPublication(draft, operation.operation, async moveRef => {
        const parent = await git(`/git/commits/${ref.object.sha}`);
        const tree = await git("/git/trees", "POST", { base_tree: parent.tree.sha, tree: [{ path: canonical.path, mode: "100644", type: "blob", sha: null }] });
        const commit = await git("/git/commits", "POST", { message: operationMessage(operation), tree: tree.sha, parents: [ref.object.sha] });
        await moveRef(commit.sha);
        const url = new URL(`${canonical.collection}/${canonical.slug}/`, publicSite).href;
        const recorded = await recordPublication(`${endpoint}&owner_id=eq.${user.id}&publication_operation=eq.${operation.operation}`, { published_commit: null, published_revision: null, published_fingerprint: null, unpublished_commit: commit.sha, unpublished_at: null, publication_pending: false }, draft.id);
        return reply({ commit: commit.sha, url, ...(recorded ? { draft: recorded } : { warning: "撤下提交已创建，但私密状态记录未更新；请等待部署并刷新目录，勿重复提交" }) });
      });
    }
    let metadata: Record<string, unknown>;
    try { metadata = validatePublication(draft); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : "请检查文章内容"); }
    const assets = collectAssets(draft);
    if (assets.length > MAX_PUBLICATION_ASSETS || assets.some(path => !path.startsWith(`${user.id}/${draft.id}/`))) throw new RequestError("发布只允许本篇文章上传的附件，最多 20 个文件");
    const fingerprint = await publicationFingerprint(draft);
    if (draft.published_commit && (draft.published_fingerprint === fingerprint || (!draft.published_fingerprint && draft.published_revision === draft.revision))) {
      const ref = await git("/git/ref/heads/main");
      const entry = (await articleInventory(draft.collection, ref.object.sha)).find(item => item.name === `${draft.slug}.md`);
      if (entry) {
        const source = readPublicSource(decodeGitSource(await git(`/git/blobs/${entry.sha}`)), draft.collection, draft.slug);
        const replacements = Object.fromEntries(assets.map(path => [path, new URL(`uploads/${draft.id}/${path.split("/").at(-1)}`, publicSite).href]));
        const expected = readPublicSource(serializePublication(draft, "1970-01-01T00:00:00Z", replacements), draft.collection, draft.slug);
        if (!draft.metadata.publishedAt) { if (source.metadata) delete source.metadata.publishedAt; if (expected.metadata) delete expected.metadata.publishedAt; }
        if (source.public && source.metadata && source.body === expected.body && JSON.stringify(source.metadata) === JSON.stringify(expected.metadata)) {
          const url = new URL(`${draft.collection}/${draft.published_slug ?? draft.slug}/`, publicSite).href;
          return reply({ commit: draft.published_commit, url, duplicate: true, fingerprint });
        }
      }
    }
    // Validate/download every approved asset before creating any public Git blob.
    const attachments: { path: string; bytes: Uint8Array }[] = []; let totalBytes = 0;
    for (const path of assets) {
      const response = await upstream(`${env.SUPABASE_URL}/storage/v1/object/authenticated/workbench-private/${path}`, { headers: userHeaders });
      const bytes = await boundedAssetBytes(response, Math.min(getAssetType(path)!.maxBytes, MAX_PUBLICATION_ASSET_BYTES - totalBytes));
      try { validateAssetBytes(bytes, path, response.headers.get("content-type") ?? ""); }
      catch (error) { throw new RequestError(error instanceof Error ? error.message : "引用附件不符合格式要求"); }
      totalBytes += bytes.length; attachments.push({ path, bytes });
    }
    // Keep a delayed approved revision from becoming a child of a newer publication.
    const ref = await git("/git/ref/heads/main");
    const reservation = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/reserve_workbench_publication`, { method: "POST", headers: userHeaders, body: JSON.stringify({ draft_id: draft.id, expected_revision: draft.revision }), signal: AbortSignal.timeout(15_000) });
    if (!reservation.ok) {
      const detail = await reservation.json().catch(() => ({}));
      throw new RequestError(detail.code === "40001" ? "草稿版本已改变，请重新预览保存后再发布" : "无法锁定发布链接，请检查权限后重试", detail.code === "40001" ? 409 : 502);
    }
    const reserved = await reservation.json();
    if (!uuidPattern.test(reserved.publication_operation ?? "")) throw new RequestError("发布操作保护尚未升级，请执行工作台升级 SQL", 503);
    return await runPublication(draft, reserved.publication_operation, async moveRef => {
      const parent = await git(`/git/commits/${ref.object.sha}`);
      const previousAssets = new Map<string, string>();
      if (draft.published_commit && attachments.length) {
        const previousTree = await git(`/git/trees/${parent.tree.sha}?recursive=1`);
        if (!previousTree.truncated && Array.isArray(previousTree.tree)) {
          for (const entry of previousTree.tree) if (entry.type === "blob" && typeof entry.path === "string" && entry.path.startsWith(`public/uploads/${draft.id}/`)) previousAssets.set(entry.path, entry.sha);
        }
      }
      const tree: { path: string; mode: string; type: string; sha: string }[] = [];
      const replacements: Record<string, string> = {};
      for (const attachment of attachments) {
        const filename = attachment.path.split("/").at(-1)!;
        const path = `uploads/${draft.id}/${filename}`;
        replacements[attachment.path] = new URL(path, publicSite).href;
        let sha = previousAssets.get(`public/${path}`);
        if (!sha || sha !== await gitBlobSha(attachment.bytes)) {
          const blob = await git("/git/blobs", "POST", { content: base64(attachment.bytes), encoding: "base64" });
          sha = blob.sha;
        }
        attachment.bytes = new Uint8Array();
        tree.push({ path: `public/${path}`, mode: "100644", type: "blob", sha: sha! });
      }
      const timestamp = new Date().toISOString();
      const body = serializePublication(draft, timestamp, replacements);
      const article = await git("/git/blobs", "POST", { content: body, encoding: "utf-8" });
      tree.push({ path: `src/content/${draft.collection}/${draft.slug}.md`, mode: "100644", type: "blob", sha: article.sha });
      const newTree = await git("/git/trees", "POST", { base_tree: parent.tree.sha, tree });
      const operation: PublicationOperation = { draftId: draft.id, operation: reserved.publication_operation, action: "publish", collection: draft.collection, slug: draft.slug, revision: draft.revision, fingerprint, publishedAt: String(draft.published_at ?? metadata.publishedAt ?? timestamp) };
      const commit = await git("/git/commits", "POST", { message: operationMessage(operation), tree: newTree.sha, parents: [ref.object.sha] });
      await moveRef(commit.sha);
      const url = new URL(`${draft.collection}/${draft.slug}/`, publicSite).href;
      // Only this authenticated publication handler uses the service key.
      const recorded = await recordPublication(`${endpoint}&owner_id=eq.${user.id}&publication_operation=eq.${operation.operation}`, { published_commit: commit.sha, published_url: url, published_slug: draft.slug, published_collection: draft.collection, published_revision: draft.revision, published_fingerprint: fingerprint, published_at: draft.published_at ?? metadata.publishedAt ?? timestamp, unpublished_commit: null, unpublished_at: null, publication_pending: false }, draft.id);
      return reply({ commit: commit.sha, url, fingerprint, ...(!recorded ? { warning: "已提交发布，但私密状态记录暂未更新；请勿重复点击发布" } : {}) });
    });
  } catch (error) {
    if (error instanceof RequestError) return reply({ error: error.message }, error.status);
    return reply({ error: "发布连接中断，请先查看部署记录再重试；私密草稿仍然保留" }, 502);
  }
}
