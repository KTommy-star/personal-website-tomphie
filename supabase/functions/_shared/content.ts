export const collections = ["notes", "research", "projects"] as const;
export type Collection = (typeof collections)[number];
export interface Draft {
  id: string;
  collection: Collection;
  slug: string;
  metadata: Record<string, unknown>;
  body: string;
  revision: number;
  updated_at?: string;
  published_commit?: string | null;
  published_url?: string | null;
  published_slug?: string | null;
  published_collection?: string | null;
  published_revision?: number | null;
  published_fingerprint?: string | null;
  published_at?: string | null;
}
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const assetPattern = /^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(?:webp|png|jpe?g)$/i;

export function createDraft(collection: Collection): Draft {
  const id = crypto.randomUUID();
  const today = new Date().toISOString().slice(0, 10);
  const specific = collection === "research" ? { kind: "paper", status: "in-progress", authors: [], contribution: "", links: [] }
    : collection === "projects" ? { startedAt: today, challenge: "", role: "", outcome: "", links: [] }
      : { topic: "", series: "" };
  return { id, collection, slug: `${collection}-${today}-${id.slice(0, 8)}`, metadata: { title: "", summary: "", tags: [], ...specific }, body: "", revision: 0 };
}

export function validatePublication(draft: Draft): Record<string, unknown> {
  if (!collections.includes(draft.collection) || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(draft.slug)) throw new Error("链接标识只能使用小写英文、数字和连字符，最多 80 字符");
  if (typeof draft.body !== "string" || !draft.body.trim() || draft.body.length > 150_000) throw new Error("请填写正文，最多 150000 字符");
  const source = draft.metadata;
  const text = (key: string, required = true, max = 2000) => {
    const value = source[key];
    if (typeof value !== "string" || !value.trim()) { if (required) throw new Error(`请填写 ${key}`); return undefined; }
    if (value.length > max) throw new Error(`${key} 内容过长`);
    return value.trim();
  };
  const list = (key: string, required = false) => {
    const value = source[key] ?? [];
    if (!Array.isArray(value) || value.length > 30 || value.some(item => typeof item !== "string" || !item.trim() || item.length > 160) || (required && !value.length)) throw new Error(`请检查 ${key}`);
    return value.map(item => (item as string).trim());
  };
  const date = (key: string, required = false) => {
    const value = text(key, required, 40);
    if (value && (!/^\d{4}-\d{2}-\d{2}/.test(value) || !Number.isFinite(Date.parse(value)))) throw new Error(`请检查 ${key} 日期`);
    return value;
  };
  const links = () => {
    const value = source.links ?? [];
    if (!Array.isArray(value) || value.length > 20) throw new Error("请检查外部链接");
    return value.map(item => {
      if (!item || typeof item.label !== "string" || !item.label.trim() || typeof item.url !== "string") throw new Error("请填写链接名称与网址");
      const url = new URL(item.url);
      if (!["https:", "http:"].includes(url.protocol)) throw new Error("外部链接只允许 HTTPS 或 HTTP");
      return { label: item.label.trim().slice(0, 160), url: url.href };
    });
  };
  const cover = text("cover", false, 2000);
  if (cover && !cover.startsWith("asset://") && new URL(cover).protocol !== "https:") throw new Error("封面请上传图片或使用 HTTPS 地址");
  const metadata: Record<string, unknown> = { title: text("title", true, 160), summary: text("summary", true, 1000), tags: list("tags"), related: list("related") };
  if (cover) metadata.cover = cover;
  const publishedAt = date("publishedAt");
  if (publishedAt) metadata.publishedAt = publishedAt;
  if (draft.collection === "research") {
    if (!["paper", "report", "patent", "dataset", "code", "competition"].includes(String(source.kind)) || !["published", "submitted", "in-progress", "completed"].includes(String(source.status))) throw new Error("请选择研究类型与进展状态");
    Object.assign(metadata, { kind: source.kind, status: source.status, authors: list("authors", true), contribution: text("contribution"), links: links() });
  } else if (draft.collection === "projects") {
    Object.assign(metadata, { startedAt: date("startedAt", true), challenge: text("challenge"), role: text("role"), outcome: text("outcome"), links: links() });
    const endedAt = date("endedAt"); if (endedAt) metadata.endedAt = endedAt;
  } else {
    metadata.topic = text("topic"); const series = text("series", false); if (series) metadata.series = series;
    if (source.order !== undefined && source.order !== "") {
      if (!Number.isInteger(source.order) || Number(source.order) < 0) throw new Error("系列顺序需要是非负整数");
      metadata.order = source.order;
    }
  }
  collectAssets(draft);
  return metadata;
}

export function collectAssets(draft: Pick<Draft, "body" | "metadata">): string[] {
  const text = `${draft.body}\n${typeof draft.metadata.cover === "string" ? draft.metadata.cover : ""}`;
  return [...new Set((text.match(/asset:\/\/[^\s)\]"'<>]+/g) ?? []).map(ref => {
    const path = ref.slice(8);
    if (!assetPattern.test(path) || path.split("/").some(part => !uuidPattern.test(part.split(".")[0]))) throw new Error("图片引用格式不正确，请重新上传");
    return path;
  }))];
}

export async function publicationFingerprint(draft: Draft): Promise<string> {
  const content = JSON.stringify({ collection: draft.collection, slug: draft.slug, metadata: validatePublication(draft), body: draft.body });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function serializePublication(draft: Draft, timestamp: string, replacements: Record<string, string> = {}): string {
  const metadata = validatePublication(draft);
  const replace = (text: string) => Object.entries(replacements).reduce((result, [path, url]) => result.split(`asset://${path}`).join(url), text);
  if (typeof metadata.cover === "string") metadata.cover = replace(metadata.cover);
  Object.assign(metadata, { publishedAt: metadata.publishedAt ?? draft.published_at ?? timestamp, updatedAt: timestamp, visibility: "public", draft: false });
  return `---\n${Object.entries(metadata).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join("\n")}\n---\n\n${replace(draft.body)}\n`;
}
