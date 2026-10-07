import { describe, expect, it } from "vitest";
import { handlePublishRequest } from "../supabase/functions/_shared/publisher";

const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "public-fixture", SUPABASE_SERVICE_ROLE_KEY: "server-fixture", GITHUB_TOKEN: "github-fixture", GITHUB_REPOSITORY: "KTommy-star/personal-website-tomphie", PUBLIC_SITE_URL: "https://ktommy-star.github.io/personal-website-tomphie/", ALLOWED_ORIGINS: "https://ktommy-star.github.io" };
const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const commit = "a".repeat(40);
const image = `${owner}/${id}/33333333-3333-4333-8333-333333333333.webp`;
const draft = { id, collection: "notes", slug: "first-note", metadata: { title: "真实记录", summary: "学习过程", topic: "AI", tags: [] }, body: "# 学习过程\n\n正文", revision: 3, published_commit: null };
const request = (body: unknown, token = "user-token", origin = env.ALLOWED_ORIGINS) => new Request("https://project.supabase.co/functions/v1/publish-content", { method: "POST", headers: { "content-type": "application/json", origin, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const fixture = (options: { isOwner?: boolean; revision?: number; failGit?: boolean; draft?: Record<string, unknown>; failRecord?: boolean; imageBytes?: Uint8Array; conclusion?: string; reservationConflict?: boolean } = {}) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: owner, email: "owner@example.test" });
    if (url.endsWith("/rpc/is_workbench_owner")) return Response.json(options.isOwner !== false);
    if (url.endsWith("/rpc/reserve_workbench_publication")) return options.reservationConflict ? Response.json({ code: "40001", message: "版本冲突" }, { status: 409 }) : Response.json({ ...draft, revision: options.revision ?? 3, published_slug: draft.slug, published_collection: draft.collection, ...options.draft });
    if (url.includes("/rest/v1/workbench_drafts?") && init.method === "PATCH") {
      if (options.failRecord) throw new TypeError("Failed to fetch");
      return new Response(null, { status: 204 });
    }
    if (url.includes("/rest/v1/workbench_drafts?")) return Response.json([{ ...draft, revision: options.revision ?? 3, ...options.draft }]);
    if (url.includes("/storage/v1/object/authenticated/")) return new Response(options.imageBytes?.buffer as ArrayBuffer ?? new TextEncoder().encode("RIFF0000WEBP").buffer);
    if (url.includes("/actions/runs?")) return Response.json({ workflow_runs: options.conclusion ? [{ path: ".github/workflows/deploy.yml", status: "completed", conclusion: options.conclusion, html_url: "https://github.com/fixture/actions/runs/1" }] : [] });
    if (options.failGit && url.includes("api.github.com")) return Response.json({ message: "permission denied" }, { status: 403 });
    if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: "parent" } });
    if (url.endsWith("/git/commits/parent")) return Response.json({ tree: { sha: "old-tree" } });
    if (url.endsWith("/git/blobs")) return Response.json({ sha: "blob" });
    if (url.endsWith("/git/trees")) return Response.json({ sha: "new-tree" });
    if (url.endsWith("/git/commits")) return Response.json({ sha: commit });
    if (url.endsWith("/git/refs/heads/main")) return Response.json({ object: { sha: commit } });
    throw new Error(`Unexpected external operation ${url}`);
  };
  return { calls, fetcher: fetcher as typeof fetch };
};

describe("owner-only publication boundary", () => {
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
    expect(reservation).toBeLessThan(io.calls.findIndex(c => c.url.includes("api.github.com")));
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
  it("stops before Git when another device edits the draft before publication reservation", async () => {
    const io = fixture({ reservationConflict: true });
    const res = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 3 }), env, io.fetcher);
    expect(res.status).toBe(409);
    expect(io.calls.some(c => c.url.includes("api.github.com"))).toBe(false);
  });
});
