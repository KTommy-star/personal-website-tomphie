import { describe, expect, it } from "vitest";
import { collectAssets, createDraft, serializePublication, validatePublication } from "../supabase/functions/_shared/content";
import { assertPublicWorkbenchKey } from "../src/lib/workbench-content";

const note = () => ({ ...createDraft("notes"), slug: "fusion-note", body: "# 真实笔记\n\n学习记录", metadata: { title: "多模态学习", summary: "学习记录", topic: "人工智能", tags: ["AI"] } });

describe("workbench publication contracts", () => {
  it("blocks accidental privileged keys before they enter the public page", () => {
    expect(() => assertPublicWorkbenchKey("sb_secret_do-not-publish")).toThrow("公开连接密钥");
    expect(() => assertPublicWorkbenchKey(`header.${btoa(JSON.stringify({ role: "service_role" }))}.signature`)).toThrow("公开连接密钥");
    expect(() => assertPublicWorkbenchKey("github_pat_do-not-publish")).toThrow();
    expect(() => assertPublicWorkbenchKey("sb_publishable_fixture")).not.toThrow();
    expect(() => assertPublicWorkbenchKey(`header.${btoa(JSON.stringify({ role: "anon" }))}.signature`)).not.toThrow();
  });
  it("refuses paths outside a fixed content collection", () => {
    expect(() => validatePublication({ ...note(), slug: "../../.github/workflows/deploy" })).toThrow();
    expect(() => validatePublication({ ...note(), collection: "journey" } as never)).toThrow();
  });
  it("lets an incomplete draft exist but prevents its publication", () => {
    const draft = createDraft("research");
    expect(draft.revision).toBe(0);
    expect(() => validatePublication(draft)).toThrow();
  });
  it("requires real research attribution before publication", () => {
    expect(() => validatePublication({ ...note(), collection: "research", metadata: { ...note().metadata, kind: "paper", status: "in-progress", authors: [], contribution: "" } })).toThrow();
  });
  it("does not publish unsafe link schemes", () => {
    const draft = { ...note(), collection: "projects" as const, metadata: { ...note().metadata, startedAt: "2026-10-06", challenge: "问题", role: "开发", outcome: "结果", links: [{ label: "链接", url: "javascript:alert(1)" }] } };
    expect(() => validatePublication(draft)).toThrow();
  });
  it("serializes scalar metadata without YAML or frontmatter injection", () => {
    const text = serializePublication({ ...note(), metadata: { ...note().metadata, title: "标题\n---\ndraft: true", visibility: "private", draft: true, malicious: "never copy" } }, "2026-10-06T00:00:00Z");
    expect(text).toContain('title: "标题\\n---\\ndraft: true"');
    expect(text).toContain('visibility: "public"');
    expect(text).toContain("draft: false");
    expect(text).not.toContain("malicious");
    expect(text.split("\n---\n")).toHaveLength(2);
  });
  it("collects only referenced private assets and refuses malformed references", () => {
    const ref = "asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp";
    expect(collectAssets({ ...note(), metadata: { ...note().metadata, cover: ref }, body: `![图](${ref})\n![再一次](${ref})` })).toEqual([ref.slice(8)]);
    expect(() => collectAssets({ ...note(), body: "![图](asset://../../private)" })).toThrow();
  });
  it("keeps the original publication date when an article is updated", () => {
    const text = serializePublication({ ...note(), published_at: "2026-09-01T00:00:00Z" }, "2026-10-06T00:00:00Z");
    expect(text).toContain('publishedAt: "2026-09-01T00:00:00Z"');
    expect(text).toContain('updatedAt: "2026-10-06T00:00:00Z"');
  });
});
