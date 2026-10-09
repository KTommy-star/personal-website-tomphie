import { describe, expect, it } from "vitest";
import { handlePublishRequest } from "../supabase/functions/_shared/publisher";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const sha = "b".repeat(40);
const commit = "a".repeat(40);
const operation = "44444444-4444-4444-8444-444444444444";
const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-fixture", SUPABASE_SERVICE_ROLE_KEY: "server-fixture", GITHUB_TOKEN: "github-fixture", GITHUB_REPOSITORY: "fixture/site", PUBLIC_SITE_URL: "https://example.com/site/", ALLOWED_ORIGINS: "https://example.com" };
const source = '---\ntitle: "公开标题"\nsummary: "公开摘要"\ntopic: "AI"\ntags: []\nrelated: []\npublishedAt: "2026-10-07"\nvisibility: "public"\ndraft: false\n---\n\n公开正文 [附件](https://example.com/site/uploads/old/file.pdf)\n';
const draft = { id, owner_id: owner, collection: "notes", slug: "first-note", metadata: { title: "私密标题", summary: "私密摘要", topic: "AI" }, body: "未公开的新正文", revision: 4, published_slug: "first-note", published_collection: "notes", published_commit: commit, publication_operation: operation, publication_pending: false };
const request = (body: unknown) => new Request("https://project.supabase.co/functions/v1/publish-content", { method: "POST", headers: { authorization: "Bearer user-token", origin: env.ALLOWED_ORIGINS }, body: JSON.stringify(body) });
function fixture(options: { text?: string; owner?: boolean; emptyRecord?: boolean; missing?: boolean; failRef?: boolean; orphan?: boolean; withdrawal?: boolean; republished?: boolean; conclusion?: string } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: owner });
    if (url.endsWith("/rpc/is_workbench_owner")) return Response.json(options.owner !== false);
    if (url.includes("/actions/runs?")) return Response.json({ workflow_runs: [{ path: ".github/workflows/deploy.yml", status: "completed", conclusion: options.conclusion ?? "success", html_url: "https://github.com/fixture/site/actions/runs/1" }] });
    if (!url.includes("/git/") && url.endsWith(`/commits/${commit}`)) return Response.json({ commit: { message: `content: unpublish notes/first-note\n\nWorkbench-Operation: ${JSON.stringify({ draftId: id, operation, action: "unpublish", collection: "notes", slug: "first-note", revision: 4 })}` }, files: [{ filename: "src/content/notes/first-note.md", status: "removed" }] });
    if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: commit } });
    if (url.endsWith(`/git/commits/${commit}`)) return Response.json({ tree: { sha: "tree" } });
    if (url.includes("/contents/src/content/notes?ref=")) return Response.json(options.missing ? [] : [{ name: "first-note.md", path: "src/content/notes/first-note.md", type: "file", sha }, { name: "_README.md", path: "src/content/notes/_README.md", type: "file", sha }]);
    if (url.endsWith(`/git/blobs/${sha}`)) return Response.json({ encoding: "base64", content: Buffer.from(options.text ?? source).toString("base64"), size: Buffer.byteLength(options.text ?? source) });
    if (url.includes("/rest/v1/workbench_drafts?")) {
      if (init.method === "PATCH") return Response.json(options.emptyRecord ? [] : [{ ...draft, ...JSON.parse(String(init.body)) }]);
      return Response.json(options.orphan ? [] : [options.withdrawal ? { ...draft, publication_operation: options.republished ? "55555555-5555-4555-8555-555555555555" : operation, published_commit: options.republished ? commit : null, unpublished_commit: commit, unpublished_at: null } : draft]);
    }
    if (url.endsWith("/rpc/recover_workbench_publication")) {
      const payload = JSON.parse(String(init.body));
      return Response.json(options.orphan ? { ...draft, id: payload.draft_id, metadata: payload.draft_metadata, body: payload.draft_body, revision: 1 } : draft);
    }
    if (url.endsWith("/rpc/reserve_workbench_publication")) return Response.json({ ...draft, publication_pending: true });
    if (url.endsWith("/git/trees")) return Response.json({ sha: "new-tree" });
    if (url.endsWith("/git/commits")) return Response.json({ sha: "c".repeat(40) });
    if (url.endsWith("/git/refs/heads/main")) return options.failRef ? Response.json({ message: "conflict" }, { status: 422 }) : Response.json({ object: { sha: "c".repeat(40) } });
    throw new Error(`Unexpected external operation ${url}`);
  };
  return { calls, fetcher: fetcher as typeof fetch };
}

describe("public article management", () => {
  it("lists the actual public Markdown inventory and excludes support files", async () => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "catalog", collection: "notes" }), env, io.fetcher);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ articles: [{ collection: "notes", slug: "first-note", title: "公开标题", sha, url: "https://example.com/site/notes/first-note/" }] });
    expect(io.calls.some(call => call.url.includes("workbench_drafts"))).toBe(false);
  });
  it("does not expose explicitly private source files in the catalog", async () => {
    const io = fixture({ text: source.replace('visibility: "public"', 'visibility: "private"') });
    const response = await handlePublishRequest(request({ action: "catalog", collection: "notes" }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ articles: [] });
  });
  it("keeps unsupported public YAML visible with an editing warning", async () => {
    const io = fixture({ text: source.replace('summary: "公开摘要"', 'summary: |\n  公开摘要') });
    const response = await handlePublishRequest(request({ action: "catalog", collection: "notes" }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ articles: [{ slug: "first-note", recoverable: false, warning: expect.any(String) }] });
  });
  it("returns an existing newer private source when recovering its public article", async () => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "recover", collection: "notes", slug: "first-note", sha }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ draft: { body: "未公开的新正文", revision: 4 } });
  });
  it("recovers an orphan from verified public source while preserving attachment links", async () => {
    const io = fixture({ orphan: true }); const response = await handlePublishRequest(request({ action: "recover", collection: "notes", slug: "first-note", sha, body: "客户端伪造正文" }), env, io.fetcher);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.draft.body).toContain("公开正文"); expect(result.draft.body).toContain("https://example.com/site/uploads/old/file.pdf"); expect(result.draft.body).not.toContain("伪造");
  });
  it("rejects a stale public blob before recovery writes", async () => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "recover", collection: "notes", slug: "first-note", sha: "d".repeat(40) }), env, io.fetcher);
    expect(response.status).toBe(409); expect(io.calls.some(call => call.init.method === "POST" && call.url.includes("recover_workbench_publication"))).toBe(false);
  });
  it("removes exactly the canonical article and preserves its private source and uploads", async () => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 4, sha }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ commit: "c".repeat(40), draft: { body: "未公开的新正文", published_commit: null, unpublished_commit: "c".repeat(40) } });
    const tree = JSON.parse(String(io.calls.find(call => call.url.endsWith("/git/trees"))!.init.body));
    expect(tree).toEqual({ base_tree: "tree", tree: [{ path: "src/content/notes/first-note.md", mode: "100644", type: "blob", sha: null }] });
    expect(JSON.parse(String(io.calls.find(call => call.url.endsWith("/git/refs/heads/main"))!.init.body))).toMatchObject({ force: false });
    expect(io.calls.some(call => call.url.includes("/storage/") || call.init.method === "DELETE")).toBe(false);
  });
  it.each([{ revision: 3, sha }, { revision: 4, sha: "d".repeat(40) }])("rejects stale removal approval %j before Git writes", async payload => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "unpublish", draftId: id, ...payload }), env, io.fetcher);
    expect(response.status).toBe(409); expect(io.calls.some(call => call.url.includes("api.github.com") && ["POST", "PATCH"].includes(call.init.method ?? ""))).toBe(false);
  });
  it("never records successful removal when a concurrent Git update rejects the branch move", async () => {
    const io = fixture({ failRef: true }); const response = await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 4, sha }), env, io.fetcher);
    expect(response.status).toBe(502);
    const records = io.calls.filter(call => call.url.includes("workbench_drafts") && call.init.method === "PATCH").map(call => JSON.parse(String(call.init.body)));
    expect(records).toEqual([expect.objectContaining({ published_commit: commit, unpublished_commit: null, publication_pending: false })]);
  });
  it("reports completed Git removal with a warning when private recording affects zero rows", async () => {
    const io = fixture({ emptyRecord: true }); const response = await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 4, sha }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ commit: "c".repeat(40), warning: expect.any(String) });
  });
  it.each(["catalog", "recover", "unpublish"])("refuses a non-owner's %s before Git access", async action => {
    const io = fixture({ owner: false }); const response = await handlePublishRequest(request({ action, collection: "notes", slug: "first-note", sha, draftId: id, revision: 4 }), env, io.fetcher);
    expect(response.status).toBe(403); expect(io.calls.some(call => call.url.includes("api.github.com"))).toBe(false);
  });
  it("rejects path traversal before looking up a public source", async () => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "recover", collection: "notes", slug: "../private", sha }), env, io.fetcher);
    expect(response.status).toBe(400); expect(io.calls.some(call => call.url.includes("api.github.com"))).toBe(false);
  });
  it("keeps removal unconfirmed until deployment succeeds", async () => {
    const io = fixture(); const response = await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 4, sha }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ draft: { unpublished_at: null } });
  });
  it("confirms withdrawal only after a successful deployment and guarded database recording", async () => {
    const io = fixture({ withdrawal: true, missing: true }); const response = await handlePublishRequest(request({ action: "status", commit }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "success", withdrawalConfirmed: true });
    const call = io.calls.find(call => call.url.includes("workbench_drafts") && call.init.method === "PATCH")!;
    expect(call.url).toContain(`publication_operation=eq.${operation}`);
    expect(JSON.parse(String(call.init.body)).unpublished_at).toEqual(expect.any(String));
  });
  it("does not enable deletion if withdrawal confirmation recording affects zero rows", async () => {
    const io = fixture({ withdrawal: true, emptyRecord: true, missing: true }); const response = await handlePublishRequest(request({ action: "status", commit }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ withdrawalConfirmed: false });
  });
  it.each([{ republished: true }, { conclusion: "failure" }])("does not confirm obsolete or failed withdrawal %j", async options => {
    const io = fixture({ withdrawal: true, ...options }); const response = await handlePublishRequest(request({ action: "status", commit }), env, io.fetcher);
    expect((await response.json()).withdrawalConfirmed).not.toBe(true);
    expect(io.calls.some(call => call.url.includes("workbench_drafts") && call.init.method === "PATCH")).toBe(false);
  });
  it("does not confirm withdrawal when the article has returned to the public Git tree", async () => {
    const io = fixture({ withdrawal: true }); const response = await handlePublishRequest(request({ action: "status", commit }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "failure", withdrawalConfirmed: false });
    expect(io.calls.some(call => call.url.includes("workbench_drafts") && call.init.method === "PATCH")).toBe(false);
  });
});
