import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { handlePublishRequest } from "../supabase/functions/_shared/publisher";

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-fixture", SUPABASE_SERVICE_ROLE_KEY: "server-fixture", GITHUB_TOKEN: "github-fixture", GITHUB_REPOSITORY: "KTommy-star/personal-website-tomphie", PUBLIC_SITE_URL: "https://ktommy-star.github.io/personal-website-tomphie/", ALLOWED_ORIGINS: "https://ktommy-star.github.io" };
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const commit = "a".repeat(40);
const image = `${owner}/${id}/33333333-3333-4333-8333-333333333333.webp`;
const draft = { id, collection: "notes", slug: "first-note", metadata: { title: "真实记录", summary: "学习过程", topic: "AI", tags: [] }, body: "# 学习过程\n\n正文", revision: 3, published_commit: null };
const request = (body: unknown, token = "user-token", origin = env.ALLOWED_ORIGINS) => new Request("https://project.supabase.co/functions/v1/publish-content", { method: "POST", headers: { "content-type": "application/json", origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const fixture = (options: { isOwner?: boolean; revision?: number; failGit?: boolean; draft?: Record<string, unknown>; failRecord?: boolean; emptyRecord?: boolean; publicMissing?: boolean; publicBody?: string; imageBytes?: Uint8Array; assets?: Record<string, { bytes: Uint8Array; mime?: string }>; publishedAssets?: { path: string; type: string; sha: string }[]; conclusion?: string; reservationConflict?: boolean } = {}) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: owner, email: "owner@example.test" });
    if (url.endsWith("/rpc/is_workbench_owner")) return Response.json(options.isOwner !== false);
    if (url.endsWith("/rpc/reserve_workbench_publication")) return options.reservationConflict ? Response.json({ code: "40001", message: "版本冲突" }, { status: 409 }) : Response.json({ ...draft, revision: options.revision ?? 3, published_slug: draft.slug, published_collection: draft.collection, ...options.draft, publication_operation: "44444444-4444-4444-8444-444444444444", publication_pending: true });
    if (url.includes("/rest/v1/workbench_drafts?") && init.method === "PATCH") {
      if (options.failRecord) throw new TypeError("Failed to fetch");
      return Response.json(options.emptyRecord ? [] : [{ ...draft, ...JSON.parse(String(init.body)) }]);
    }
    if (url.includes("/rest/v1/workbench_drafts?")) return Response.json([{ ...draft, revision: options.revision ?? 3, ...options.draft }]);
    if (url.includes("/storage/v1/object/authenticated/")) {
      const asset = options.assets?.[url.split("/workbench-private/")[1]];
      return new Response((asset?.bytes ?? options.imageBytes ?? new TextEncoder().encode("RIFF0000WEBP")).buffer as ArrayBuffer, { headers: asset?.mime ? { "content-type": asset.mime } : {} });
    }
    if (url.includes("/actions/runs?")) return Response.json({ workflow_runs: options.conclusion ? [{ path: ".github/workflows/deploy.yml", status: "completed", conclusion: options.conclusion, html_url: "https://github.com/fixture/actions/runs/1" }] : [] });
    if (url.endsWith(`/commits/${commit}`)) return Response.json({ commit: { message: "legacy publication" }, files: [] });
    if (options.failGit && url.includes("api.github.com")) return Response.json({ message: "permission denied" }, { status: 403 });
    if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "parent" } });
    if (url.endsWith("/git/commits/parent")) return Response.json({ tree: { sha: "old-tree" } });
    if (url.includes("/contents/src/content/notes?ref=")) return Response.json(options.publicMissing ? [] : [{ name: "first-note.md", path: "src/content/notes/first-note.md", type: "file", sha: "b".repeat(40) }]);
    if (url.endsWith(`/git/blobs/${"b".repeat(40)}`)) return Response.json({ encoding: "base64", content: Buffer.from(`---\ntitle: "真实记录"\nsummary: "学习过程"\ntopic: "AI"\ntags: []\nrelated: []\nvisibility: "public"\ndraft: false\n---\n\n${options.publicBody ?? draft.body}\n`).toString("base64") });
    if (url.endsWith("/git/trees/old-tree?recursive=1")) return Response.json({ tree: options.publishedAssets ?? [], truncated: false });
    if (url.endsWith("/git/blobs")) return Response.json({ sha: "blob" });
    if (url.endsWith("/git/trees")) return Response.json({ sha: "new-tree" });
    if (url.endsWith("/git/commits")) return Response.json({ sha: commit });
    if (url.endsWith("/git/refs/heads/main")) return Response.json({ object: { sha: commit } });
    throw new Error(`Unexpected external operation ${url}`);
  };
  return { calls, fetcher: fetcher as typeof fetch };
};

describe("owner-only publication boundary", () => {
  it("publishes approved documents and videos in the same atomic tree as the article", async () => {
    const pdf = image.replace(".webp", ".pdf"); const video = image.replace(".webp", ".mp4");
    const io = fixture({ draft: { body: `[报告](asset://${pdf})\n[录像](asset://${video})` }, assets: {
      [pdf]: { bytes: new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF"), mime: "application/pdf" },
      [video]: { bytes: new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 109, 112, 52, 50]), mime: "video/mp4" },
    } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200);
    const tree = JSON.parse(String(io.calls.find(c => c.url.endsWith("/git/trees"))!.init.body));
    expect(tree.tree.map((entry: { path: string }) => entry.path)).toEqual([`public/uploads/${id}/33333333-3333-4333-8333-333333333333.pdf`, `public/uploads/${id}/33333333-3333-4333-8333-333333333333.mp4`, "src/content/notes/first-note.md"]);
    const article = io.calls.filter(c => c.url.endsWith("/git/blobs")).at(-1)!;
    expect(JSON.parse(String(article.init.body)).content).toContain("[报告](https://ktommy-star.github.io/personal-website-tomphie/uploads/");
    expect(JSON.parse(String(article.init.body)).content).not.toContain("asset://");
  });
  it("validates every referenced attachment before writing any public blob", async () => {
    const pdf = image.replace(".webp", ".pdf");
    const io = fixture({ draft: { body: `![图片](asset://${image})\n[报告](asset://${pdf})` }, assets: { [pdf]: { bytes: new TextEncoder().encode("<html>disguised</html>"), mime: "application/pdf" } } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(400); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it("rejects a mismatched stored MIME type before public writes", async () => {
    const pdf = image.replace(".webp", ".pdf");
    const io = fixture({ draft: { body: `[报告](asset://${pdf})` }, assets: { [pdf]: { bytes: new TextEncoder().encode("%PDF-1.7\nfixture"), mime: "text/html" } } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(400); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it("stops when individually permitted videos exceed the article's aggregate budget", async () => {
    const first = image.replace(".webp", ".mp4"); const second = first.replace("33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444");
    const bytes = new Uint8Array(21 * 1024 * 1024); bytes.set([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 109, 112, 52, 50]);
    const io = fixture({ draft: { body: `[一](asset://${first})\n[二](asset://${second})` }, assets: { [first]: { bytes, mime: "video/mp4" }, [second]: { bytes, mime: "video/mp4" } } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(413); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it("refuses another owner's document without requesting its private bytes", async () => {
    const other = image.replace(owner, "44444444-4444-4444-8444-444444444444").replace(".webp", ".pdf");
    const io = fixture({ draft: { body: `[报告](asset://${other})` } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(400); expect(io.calls.some(c => c.url.includes("/storage/") || c.url.includes("api.github.com"))).toBe(false);
  });
  it("rejects too many referenced attachments before downloading them", async () => {
    const links = Array.from({ length: 21 }, (_, index) => `[报告](asset://${owner}/${id}/00000000-0000-4000-8000-${String(index).padStart(12, "0")}.pdf)`).join("\n");
    const io = fixture({ draft: { body: links } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(400); expect(io.calls.some(c => c.url.includes("/storage/") || c.url.includes("api.github.com"))).toBe(false);
  });
  it("reuses an existing matching public asset blob when only article text changes", async () => {
    const pdf = image.replace(".webp", ".pdf"); const bytes = new TextEncoder().encode("%PDF-1.7\nfixture\n%%EOF");
    const sha = createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
    const path = `public/uploads/${id}/33333333-3333-4333-8333-333333333333.pdf`;
    const io = fixture({ draft: { body: `[更新后的报告](asset://${pdf})`, published_commit: commit, published_slug: "first-note", published_collection: "notes", published_fingerprint: "old" }, assets: { [pdf]: { bytes, mime: "application/pdf" } }, publishedAssets: [{ path, type: "blob", sha }] });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200);
    expect(io.calls.filter(c => c.url.endsWith("/git/blobs"))).toHaveLength(1);
    const tree = JSON.parse(String(io.calls.find(c => c.url.endsWith("/git/trees"))!.init.body));
    expect(tree.tree[0]).toMatchObject({ path, sha });
  });
  it("uploads changed asset bytes rather than reusing a different public blob", async () => {
    const pdf = image.replace(".webp", ".pdf"); const bytes = new TextEncoder().encode("%PDF-1.7\nchanged\n%%EOF");
    const io = fixture({ draft: { body: `[报告](asset://${pdf})`, published_commit: commit, published_slug: "first-note", published_collection: "notes", published_fingerprint: "old" }, assets: { [pdf]: { bytes, mime: "application/pdf" } }, publishedAssets: [{ path: `public/uploads/${id}/33333333-3333-4333-8333-333333333333.pdf`, type: "blob", sha: "b".repeat(40) }] });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200); expect(io.calls.filter(c => c.url.endsWith("/git/blobs"))).toHaveLength(2);
  });
  it("recognizes an unchanged legacy publication without a stored fingerprint", async () => {
    const io = fixture({ draft: { published_commit: commit, published_revision: 3, published_slug: "first-note", published_collection: "notes" } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(await res.json()).toMatchObject({ duplicate: true, commit });
    expect(io.calls.some(c => c.url.includes("api.github.com") && ["POST", "PATCH"].includes(c.init.method ?? ""))).toBe(false);
  });
  it("returns the existing release for identical content without another Git commit", async () => {
    const fingerprint = createHash("sha256").update(JSON.stringify({ collection: "notes", slug: "first-note", metadata: { title: "真实记录", summary: "学习过程", tags: [], related: [], topic: "AI" }, body: draft.body })).digest("hex");
    const io = fixture({ draft: { published_commit: commit, published_fingerprint: fingerprint, published_revision: 2, revision: 3, published_slug: "first-note", published_collection: "notes" } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ duplicate: true, commit, url: "https://ktommy-star.github.io/personal-website-tomphie/notes/first-note/" });
    expect(io.calls.some(c => c.url.includes("api.github.com") && ["POST", "PATCH"].includes(c.init.method ?? ""))).toBe(false);
  });
  it("updates an edited published draft at the original path and records the content fingerprint", async () => {
    const io = fixture({ draft: { body: "修改后的正文", published_commit: commit, published_slug: "first-note", published_collection: "notes", published_fingerprint: "old-content" } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200);
    const tree = JSON.parse(String(io.calls.find(c => c.url.endsWith("/git/trees"))!.init.body));
    expect(tree.tree.map((entry: { path: string }) => entry.path)).toEqual(["src/content/notes/first-note.md"]);
    const recorded = JSON.parse(String(io.calls.find(c => c.init.method === "PATCH" && c.url.includes("workbench_drafts"))!.init.body));
    expect(recorded.published_revision).toBe(3);
    expect(recorded.published_fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it("requires authentication before touching any backend", async () => {
    const io = fixture(); const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }, ""), env, io.fetcher);
    expect(res.status).toBe(401); expect(io.calls).toHaveLength(0);
  });
  it("refuses an authenticated non-owner before GitHub writes", async () => {
    const io = fixture({ isOwner: false }); const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(403); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it("rejects a stale approved revision without publishing newer private text", async () => {
    const io = fixture({ revision: 4 }); const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(409); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it("rejects a browser origin that was not configured", async () => {
    const io = fixture(); const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }, "user-token", "https://untrusted.example"), env, io.fetcher);
    expect(res.status).toBe(403); expect(io.calls).toHaveLength(0);
  });
  it("publishes one fixed-path atomic tree from the saved draft, not client text", async () => {
    const io = fixture(); const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3, body: "should never be published" }), env, io.fetcher);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ commit, url: "https://ktommy-star.github.io/personal-website-tomphie/notes/first-note/" });
    const tree = io.calls.find(c => c.url.endsWith("/git/trees"))!;
    expect(JSON.parse(String(tree.init.body))).toMatchObject({ base_tree: "old-tree", tree: [{ path: "src/content/notes/first-note.md", mode: "100644", type: "blob", sha: "blob" }] });
    const blob = io.calls.find(c => c.url.endsWith("/git/blobs"))!;
    expect(JSON.parse(String(blob.init.body)).content).toContain("学习过程");
    expect(JSON.parse(String(blob.init.body)).content).not.toContain("should never be published");
    expect(JSON.parse(String(io.calls.find(c => c.url.endsWith("/git/refs/heads/main"))!.init.body)).force).toBe(false);
    const reservation = io.calls.findIndex(c => c.url.endsWith("/rpc/reserve_workbench_publication"));
    expect(reservation).toBeGreaterThan(0);
    expect(reservation).toBeLessThan(io.calls.findIndex(c => c.url.includes("api.github.com") && ["POST", "PATCH"].includes(c.init.method ?? "")));
  });
  it("reports a GitHub failure instead of falsely reporting a release", async () => {
    const io = fixture({ failGit: true }); const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(502);
    expect(io.calls.some(c => c.init.method === "PATCH" && c.url.includes("workbench_drafts"))).toBe(false);
  });
  it("rejects another draft's private image before any public operation", async () => {
    const io = fixture({ draft: { body: `![private](asset://${owner}/44444444-4444-4444-8444-444444444444/33333333-3333-4333-8333-333333333333.webp)` } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(400); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it("copies only referenced images with the approved article in one tree", async () => {
    const io = fixture({ draft: { body: `![image](asset://${image})` } });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200);
    const tree = JSON.parse(String(io.calls.find(c => c.url.endsWith("/git/trees"))!.init.body));
    expect(tree.tree.map((item: { path: string }) => item.path)).toEqual([`public/uploads/${id}/33333333-3333-4333-8333-333333333333.webp`, "src/content/notes/first-note.md"]);
    const blobs = io.calls.filter(c => c.url.endsWith("/git/blobs")).map(c => JSON.parse(String(c.init.body)));
    expect(blobs[0].encoding).toBe("base64");
    expect(blobs[1].content).toContain(`/uploads/${id}/33333333-3333-4333-8333-333333333333.webp`);
    expect(blobs[1].content).not.toContain("asset://");
  });
  it("refuses disguised non-image uploads before GitHub writes", async () => {
    const io = fixture({ draft: { body: `![image](asset://${image})` }, imageBytes: new TextEncoder().encode("<script>unsafe</script>") });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(400); expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
  it.each([undefined, "success", "failure"])("distinguishes deployment state %s", async conclusion => {
    const io = fixture({ conclusion });
    const res = await handlePublishRequest(request({ action: "status", commit }), env, io.fetcher);
    expect((await res.json()).state).toBe(conclusion ?? "pending");
  });
  it("does not misreport a completed Git commit when private bookkeeping disconnects", async () => {
    const io = fixture({ failRecord: true });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ commit, warning: expect.stringContaining("已提交") });
  });
  it("stops before Git writes when another device edits the draft before publication reservation", async () => {
    const io = fixture({ reservationConflict: true });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(409);
    expect(io.calls.some(c => c.url.includes("api.github.com") && ["POST", "PATCH"].includes(c.init.method ?? ""))).toBe(false);
  });
  it("republishes an absent article even when failed removal bookkeeping left the old fingerprint", async () => {
    const io = fixture({ publicMissing: true, draft: { published_commit: commit, published_revision: 3, published_slug: "first-note", published_collection: "notes" } });
    const response = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).not.toHaveProperty("duplicate");
    expect(io.calls.some(call => call.url.endsWith("/git/refs/heads/main") && call.init.method === "PATCH")).toBe(true);
  });
  it("does not suppress an update when the Git source differs from private bookkeeping", async () => {
    const io = fixture({ publicBody: "在Git修改过的公开正文", draft: { published_commit: commit, published_revision: 3, published_slug: "first-note", published_collection: "notes" } });
    const response = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).not.toHaveProperty("duplicate");
  });
  it("does not report private bookkeeping as recorded when the database updates zero rows", async () => {
    const io = fixture({ emptyRecord: true });
    const response = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).toHaveProperty("warning");
  });
});
