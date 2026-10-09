import { collections, uuidPattern, validatePublication, type Collection, type Draft } from "./content.ts";

export const gitShaPattern = /^[a-f0-9]{40}$/;
export interface PublicationOperation {
  draftId: string; operation: string; action: "publish" | "unpublish";
  collection: Collection; slug: string; revision: number;
  fingerprint?: string; publishedAt?: string;
}
export function operationMessage(operation: PublicationOperation): string {
  return `content: ${operation.action} ${operation.collection}/${operation.slug}\n\nWorkbench-Operation: ${JSON.stringify(operation)}`;
}
export function readOperation(message: unknown): PublicationOperation | undefined {
  if (typeof message !== "string") return;
  const matches = message.split("\n").filter(line => line.startsWith("Workbench-Operation: "));
  if (matches.length !== 1) return;
  try {
    const operation = JSON.parse(matches[0].slice("Workbench-Operation: ".length)) as PublicationOperation;
    if (!uuidPattern.test(operation.draftId ?? "") || !uuidPattern.test(operation.operation ?? "") || !["publish", "unpublish"].includes(operation.action) || !Number.isInteger(operation.revision) || operation.revision < 1) return;
    canonicalArticle(operation.collection, operation.slug);
    if (operation.fingerprint !== undefined && !/^[a-f0-9]{64}$/.test(operation.fingerprint)) return;
    if (operation.publishedAt !== undefined && (typeof operation.publishedAt !== "string" || !Number.isFinite(Date.parse(operation.publishedAt)))) return;
    return operation;
  } catch { return; }
}
export function canonicalArticle(collection: unknown, slug: unknown): { collection: Collection; slug: string; path: string } {
  if (!collections.includes(collection as Collection) || typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(slug)) throw new Error("文章栏目或链接标识不正确");
  return { collection: collection as Collection, slug, path: `src/content/${collection}/${slug}.md` };
}

export function readPublicSource(text: string, collection: Collection, slug: string): { public: boolean; title: string; metadata?: Record<string, unknown>; body?: string; warning?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!match) return { public: false, title: slug };
  const lines = match[1].split(/\r?\n/);
  const visibility = lines.filter(line => /^visibility:/.test(line));
  const draft = lines.filter(line => /^draft:/.test(line));
  if (visibility.some(line => /^visibility:\s*(?:"private"|'private'|private)\s*$/.test(line)) || draft.some(line => /^draft:\s*true\s*$/.test(line))) return { public: false, title: slug };
  if (visibility.length > 1 || draft.length !== 1 || !/^draft:\s*false\s*$/.test(draft[0]) || (visibility.length && !/^visibility:\s*(?:"public"|'public'|public)\s*$/.test(visibility[0]))) return { public: false, title: slug };
  let title = slug;
  try { const value = JSON.parse(lines.find(line => /^title:/.test(line))?.slice(6).trim() ?? "null"); if (typeof value === "string" && value.trim()) title = value.trim(); } catch { /* Unsupported YAML stays listed under its canonical slug. */ }
  try {
    if (text.length > 200_000) throw new Error("文章源文件过大，无法安全恢复编辑");
    const metadata: Record<string, unknown> = Object.create(null);
    for (const line of lines) {
      if (!line.trim()) continue;
      const field = /^([A-Za-z][A-Za-z0-9_]*):\s*(.+)$/.exec(line);
      if (!field || Object.hasOwn(metadata, field[1]) || ["constructor", "prototype"].includes(field[1])) throw new Error("暂不支持此文章的 YAML 格式；请在源文件中编辑");
      metadata[field[1]] = JSON.parse(field[2]);
    }
    delete metadata.visibility; delete metadata.draft; delete metadata.updatedAt;
    const body = match[2].replace(/^\r?\n/, "").replace(/\r?\n$/, "");
    const candidate = { collection, slug, metadata, body } as Draft;
    return { public: true, title, metadata: validatePublication(candidate), body };
  } catch (error) {
    return { public: true, title, warning: error instanceof Error && !/JSON/.test(error.message) ? error.message : "暂不支持此文章的 YAML 格式；请在源文件中编辑" };
  }
}

export function decodeGitSource(blob: { encoding?: string; content?: string; size?: number }): string {
  if (blob.encoding !== "base64" || typeof blob.content !== "string" || Number(blob.size) > 800_000 || blob.content.length > 1_100_000) throw new Error("文章源文件格式不正确或超过读取限制");
  const bytes = Uint8Array.from(atob(blob.content.replace(/\s/g, "")), char => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
