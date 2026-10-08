import { collectAssets, serializePublication, uuidPattern, validatePublication, publicationFingerprint, type Draft } from "./content.ts";
import { getAssetType, MAX_PUBLICATION_ASSETS, MAX_PUBLICATION_ASSET_BYTES, validateAssetBytes } from "./assets.ts";

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
  constructor(message: string, public status = 400) { super(message); }
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
      if (!response.ok) throw new RequestError("发布连接失败，请检查后台授权或稍后重试；私密草稿仍然保留", 502);
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
    let payload: { action?: string; draftId?: string; revision?: number; commit?: string };
    try { payload = JSON.parse(raw); } catch { throw new RequestError("请求格式不正确"); }
    if (!payload || typeof payload !== "object") throw new RequestError("请求格式不正确");
    const gitRoot = `https://api.github.com/repos/${env.GITHUB_REPOSITORY}`;
    const gitHeaders = { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "Content-Type": "application/json", "X-GitHub-Api-Version": "2022-11-28" };
    const git = async (path: string, method = "GET", body?: unknown) => (await upstream(`${gitRoot}${path}`, { method, headers: gitHeaders, ...(body ? { body: JSON.stringify(body) } : {}) })).json();
    if (payload.action === "status") {
      if (!/^[a-f0-9]{40}$/.test(payload.commit ?? "")) throw new RequestError("发布任务标识不正确");
      const result = await git(`/actions/runs?head_sha=${payload.commit}&per_page=10`);
      const run = result.workflow_runs?.find((item: { name: string; path: string }) => item.path === ".github/workflows/deploy.yml" || item.name === "Deploy to GitHub Pages");
      return reply({ state: !run || run.status !== "completed" ? "pending" : run.conclusion === "success" ? "success" : "failure", url: run?.html_url ?? `${publicSite.href}` });
    }
    if (payload.action !== "publish" || !uuidPattern.test(payload.draftId ?? "") || !Number.isInteger(payload.revision) || Number(payload.revision) < 1) throw new RequestError("请先保存文章，再发布");
    const endpoint = `${env.SUPABASE_URL}/rest/v1/workbench_drafts?id=eq.${payload.draftId}&select=*`;
    const drafts = await (await upstream(endpoint, { headers: userHeaders })).json();
    const draft = drafts[0] as Draft | undefined;
    if (!draft || draft.id !== payload.draftId) throw new RequestError("草稿不存在或无权读取", 404);
    if (draft.revision !== payload.revision) throw new RequestError("草稿版本已改变，请重新预览保存后再发布", 409);
    if (draft.published_slug && (draft.published_slug !== draft.slug || draft.published_collection !== draft.collection)) throw new RequestError("已开始发布的内容请保持原栏目与链接");
    let metadata: Record<string, unknown>;
    try { metadata = validatePublication(draft); }
    catch (error) { throw new RequestError(error instanceof Error ? error.message : "请检查文章内容"); }
    const assets = collectAssets(draft);
    if (assets.length > MAX_PUBLICATION_ASSETS || assets.some(path => !path.startsWith(`${user.id}/${draft.id}/`))) throw new RequestError("发布只允许本篇文章上传的附件，最多 20 个文件");
    const fingerprint = await publicationFingerprint(draft);
    if (draft.published_commit && (draft.published_fingerprint === fingerprint || (!draft.published_fingerprint && draft.published_revision === draft.revision))) {
      const url = new URL(`${draft.collection}/${draft.published_slug ?? draft.slug}/`, publicSite).href;
      return reply({ commit: draft.published_commit, url, duplicate: true, fingerprint });
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
    const reservation = await fetcher(`${env.SUPABASE_URL}/rest/v1/rpc/reserve_workbench_publication`, { method: "POST", headers: userHeaders, body: JSON.stringify({ draft_id: draft.id, expected_revision: draft.revision }), signal: AbortSignal.timeout(15_000) });
    if (!reservation.ok) {
      const detail = await reservation.json().catch(() => ({}));
      throw new RequestError(detail.code === "40001" ? "草稿版本已改变，请重新预览保存后再发布" : "无法锁定发布链接，请检查权限后重试", detail.code === "40001" ? 409 : 502);
    }
    const ref = await git("/git/ref/heads/main");
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
    const commit = await git("/git/commits", "POST", { message: `content: publish ${draft.collection}/${draft.slug}`, tree: newTree.sha, parents: [ref.object.sha] });
    await git("/git/refs/heads/main", "PATCH", { sha: commit.sha, force: false });
    const url = new URL(`${draft.collection}/${draft.slug}/`, publicSite).href;
    // Only this authenticated publication handler uses the service key.
    let recorded = false;
    try {
      const record = await fetcher(endpoint, { method: "PATCH", headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "Content-Type": "application/json" }, body: JSON.stringify({ published_commit: commit.sha, published_url: url, published_slug: draft.slug, published_collection: draft.collection, published_revision: draft.revision, published_fingerprint: fingerprint, published_at: draft.published_at ?? metadata.publishedAt ?? timestamp }), signal: AbortSignal.timeout(15_000) });
      recorded = record.ok;
    } catch { /* The public commit already exists; do not report this as an unpublished draft. */ }
    return reply({ commit: commit.sha, url, fingerprint, ...(!recorded ? { warning: "已提交发布，但私密状态记录暂未更新；请勿重复点击发布" } : {}) });
  } catch (error) {
    if (error instanceof RequestError) return reply({ error: error.message }, error.status);
    return reply({ error: "发布连接中断，请先查看部署记录再重试；私密草稿仍然保留" }, 502);
  }
}
