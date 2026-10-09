import { describe, expect, it } from "vitest";
import { handlePublishRequest } from "../supabase/functions/_shared/publisher";

const owner = "11111111-1111-4111-8111-111111111111";
const id = "22222222-2222-4222-8222-222222222222";
const operation = "33333333-3333-4333-8333-333333333333";
const laterOperation = "44444444-4444-4444-8444-444444444444";
const before = "a".repeat(40), removed = "b".repeat(40), successor = "c".repeat(40), blob = "d".repeat(40);
const path = "src/content/notes/first-note.md";
const env = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_ANON_KEY: "fixture", SUPABASE_SERVICE_ROLE_KEY: "server-fixture", GITHUB_TOKEN: "git-fixture", GITHUB_REPOSITORY: "fixture/site", PUBLIC_SITE_URL: "https://example.com/site/", ALLOWED_ORIGINS: "https://example.com" };
const source = '---\ntitle: "公开标题"\nsummary: "公开摘要"\ntopic: "AI"\nvisibility: "public"\ndraft: false\n---\n\n公开正文\n';
const request = (body: unknown) => new Request("https://project.supabase.co/functions/v1/publish-content", { method: "POST", headers: { authorization: "Bearer fixture", origin: env.ALLOWED_ORIGINS }, body: JSON.stringify(body) });
function fixture(options: { failFirstRecord?: "503" | "zero"; supersedeAtRecord?: boolean; supersedingAction?: "unpublish"; deploySuccessor?: boolean; successorPending?: boolean; returnedArticle?: boolean; unrelatedSuccessor?: boolean; changedPublication?: boolean; wrongCanonicalChange?: boolean; failTree?: boolean; rejectRef?: boolean; ambiguousRef?: "timeout" | "503"; privateOnly?: boolean; withdrawnInitially?: boolean } = {}) {
  let row: Record<string, unknown> = { id, owner_id: owner, collection: "notes", slug: "first-note", metadata: { title: "私密标题", summary: "私密摘要", topic: "AI" }, body: "未公开编辑，绝不能覆盖", revision: 7, published_slug: "first-note", published_collection: "notes", published_commit: before, publication_operation: null, publication_pending: false, unpublished_at: null };
  if (options.privateOnly) row = { ...row, published_slug: null, published_collection: null, published_commit: null };
  if (options.withdrawnInitially) row = { ...row, published_commit: null, unpublished_commit: before, unpublished_at: "2026-10-08T00:00:00Z" };
  let head = before, publicFile = !options.privateOnly && !options.withdrawnInitially, firstRecord = true;
  const commits = new Map<string, { message: string; files: { filename: string; status: string; sha: string }[] }>();
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input); calls.push({ url, init });
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: owner });
    if (url.endsWith("/rpc/is_workbench_owner")) return Response.json(true);
    if (url.endsWith("/rpc/reserve_workbench_publication")) { row = { ...row, publication_operation: operation, publication_pending: true }; return Response.json(row); }
    if (url.includes("/rest/v1/workbench_drafts?")) {
      if (init.method === "PATCH") {
        if (firstRecord) {
          firstRecord = false;
          if (options.supersedeAtRecord) row = { ...row, publication_operation: laterOperation, publication_pending: false, published_commit: options.supersedingAction ? null : successor, unpublished_commit: options.supersedingAction ? successor : null };
          if (options.failFirstRecord) return options.failFirstRecord === "503" ? new Response(null, { status: 503 }) : Response.json([]);
        }
        const expected = new URL(url).searchParams.get("publication_operation");
        if (expected && expected !== `eq.${row.publication_operation}`) return Response.json([]);
        row = { ...row, ...JSON.parse(String(init.body)) }; return Response.json([row]);
      }
      const query = new URL(url).searchParams;
      if (query.get("unpublished_commit") && query.get("unpublished_commit") !== `eq.${row.unpublished_commit}`) return Response.json([]);
      return Response.json([row]);
    }
    if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: head } });
    if (url.includes("/contents/src/content/notes?ref=")) {
      const ref = new URL(url).searchParams.get("ref");
      const exists = ref === before || (publicFile && ref === head);
      return Response.json(exists ? [{ name: "first-note.md", path, type: "file", sha: options.changedPublication && ref === head ? "e".repeat(40) : blob }] : [{ name: "_README.md", path: "src/content/notes/_README.md", type: "file", sha: blob }]);
    }
    if (url.endsWith(`/git/blobs/${blob}`)) return Response.json({ encoding: "base64", content: Buffer.from(source).toString("base64") });
    if (url.includes("/git/commits/") && init.method !== "POST") return Response.json({ tree: { sha: "tree" } });
    if (url.endsWith("/git/blobs")) return Response.json({ sha: blob });
    if (url.endsWith("/git/trees")) return options.failTree ? new Response(null, { status: 403 }) : Response.json({ sha: "new-tree" });
    if (url.endsWith("/git/commits")) { const message = JSON.parse(String(init.body)).message; commits.set(removed, { message, files: [{ filename: path, status: message.startsWith("content: publish") ? "modified" : "removed", sha: blob }] }); return Response.json({ sha: removed }); }
    if (url.endsWith("/git/refs/heads/main")) { if (options.rejectRef) return new Response(null, { status: 422 }); head = removed; publicFile = commits.get(removed)!.files[0].status !== "removed"; if (options.deploySuccessor) head = successor; if (options.returnedArticle) publicFile = true; if (options.ambiguousRef === "timeout") throw new TypeError("Timed out after upstream processed the request"); if (options.ambiguousRef === "503") return new Response(null, { status: 503 }); return Response.json({ object: { sha: head } }); }
    if (url.includes("/commits?path=")) return Response.json([...commits].map(([sha, value]) => ({ sha, commit: { message: value.message } })));
    if (url.includes("/commits/")) { const value = commits.get(url.split("/commits/")[1]); return Response.json({ sha: url.split("/commits/")[1], commit: { message: value?.message ?? "other commit" }, files: options.wrongCanonicalChange ? [{ filename: "src/content/notes/another.md", status: "removed", sha: blob }] : value?.files ?? [] }); }
    if (url.includes("/compare/")) return Response.json({ status: options.unrelatedSuccessor ? "diverged" : "ahead" });
    if (url.includes("/actions/runs?")) {
      const queried = new URL(url).searchParams.get("head_sha");
      if (options.successorPending && new URL(url).searchParams.get("status") === "success") return Response.json({ workflow_runs: [] });
      const success = queried !== removed || !options.deploySuccessor;
      const runHead = queried ?? head;
      return Response.json({ workflow_runs: [{ path: ".github/workflows/deploy.yml", head_branch: "main", head_sha: runHead, status: options.successorPending && runHead === successor ? "in_progress" : "completed", conclusion: success ? "success" : "cancelled", html_url: "https://github.com/fixture/site/actions/runs/1" }] });
    }
    throw new Error(`Unexpected external operation ${url}`);
  };
  return { calls, fetcher: fetcher as typeof fetch, row: () => row };
}

describe("recoverable publication operations", () => {
  it.each(["503", "zero"] as const)("repairs a completed removal whose initial database recording failed with %s", async failure => {
    const io = fixture({ failFirstRecord: failure });
    const result = await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    expect((await result.json()).warning).toEqual(expect.any(String));
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "success", withdrawalConfirmed: true });
    expect(io.row()).toMatchObject({ body: "未公开编辑，绝不能覆盖", revision: 7, published_commit: null, unpublished_commit: removed, unpublished_at: expect.any(String), publication_pending: false });
  });
  it("does not let a late removal response overwrite a newer publication operation", async () => {
    const io = fixture({ supersedeAtRecord: true });
    await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    expect(io.row()).toMatchObject({ publication_operation: laterOperation, published_commit: successor, unpublished_commit: null });
    const patch = io.calls.find(call => call.url.includes("workbench_drafts") && call.init.method === "PATCH")!;
    expect(patch.url).toContain(`publication_operation=eq.${operation}`);
  });
  it("reconciles an operation from Git history after the browser lost the response", async () => {
    const io = fixture({ failFirstRecord: "503" });
    await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "reconcile", draftId: id }), env, io.fetcher);
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ commit: removed, action: "unpublish", draft: { publication_pending: false, unpublished_commit: removed }, withdrawalConfirmed: true });
  });
  it("confirms a cancelled removal deployment when a successful successor deployed its deletion", async () => {
    const io = fixture({ deploySuccessor: true });
    await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "success", withdrawalConfirmed: true });
    expect(io.calls.some(call => call.url.includes(`/compare/${removed}...${successor}`))).toBe(true);
  });
  it.each([{ deploySuccessor: true, returnedArticle: true }, { deploySuccessor: true, unrelatedSuccessor: true }])("does not confirm a successor that lacks the deletion or ancestry %j", async options => {
    const io = fixture(options);
    await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect((await response.json()).withdrawalConfirmed).not.toBe(true); expect(io.row().unpublished_at).toBeNull();
  });
  it("does not let a late publication response overwrite a newer withdrawal operation", async () => {
    const io = fixture({ supersedeAtRecord: true, supersedingAction: "unpublish" });
    const response = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    expect(response.status).toBe(200); expect(io.row()).toMatchObject({ publication_operation: laterOperation, published_commit: null, unpublished_commit: successor });
  });
  it("repairs publication bookkeeping without copying public text over newer private edits", async () => {
    const io = fixture({ failFirstRecord: "503" });
    await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "success", draft: { published_commit: removed, publication_pending: false, body: "未公开编辑，绝不能覆盖", revision: 7 } });
  });
  it("confirms a cancelled publication when a successor deployed the same public blob", async () => {
    const io = fixture({ deploySuccessor: true });
    await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "success" });
  });
  it("does not report an old publication deployed when the successor contains another blob", async () => {
    const io = fixture({ deploySuccessor: true, changedPublication: true });
    await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect((await response.json()).state).not.toBe("success");
  });
  it.each(["publish", "unpublish"])("keeps polling a cancelled %s while a successor is still deploying", async action => {
    const io = fixture({ deploySuccessor: true, successorPending: true });
    await handlePublishRequest(request({ action, draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect(await response.json()).toMatchObject({ state: "pending" });
  });
  it("rejects operation metadata that does not correspond to the actual canonical Git change", async () => {
    const io = fixture({ failFirstRecord: "503", wrongCanonicalChange: true });
    await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    const before = io.row();
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect(response.status).toBe(409); expect(io.row()).toEqual(before);
  });
  it("does not replay an old operation after the row has reserved another token", async () => {
    const io = fixture({ supersedeAtRecord: true });
    await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    const before = io.row();
    const response = await handlePublishRequest(request({ action: "status", commit: removed }), env, io.fetcher);
    expect((await response.json()).withdrawalConfirmed).not.toBe(true); expect(io.row()).toEqual(before);
  });
  it("clears a first publication reservation and slug lock when Git fails before the ref update", async () => {
    const io = fixture({ privateOnly: true, failTree: true }); const snapshot = io.row();
    const response = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    expect(response.status).toBe(502); expect(io.row()).toMatchObject({ published_slug: null, published_commit: null, publication_operation: null, publication_pending: false, body: snapshot.body, revision: snapshot.revision });
  });
  it("preserves confirmed withdrawal when republication fails before reaching main", async () => {
    const io = fixture({ withdrawnInitially: true, failTree: true });
    await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    expect(io.row()).toMatchObject({ published_commit: null, unpublished_commit: before, unpublished_at: "2026-10-08T00:00:00Z", publication_pending: false });
  });
  it.each(["publish", "unpublish"])("cleans a definitely rejected %s ref update without changing prior public state", async action => {
    const io = fixture({ rejectRef: true }); const snapshot = io.row();
    const response = await handlePublishRequest(request({ action, draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    expect(response.status).toBe(502); expect(io.row()).toMatchObject({ published_commit: snapshot.published_commit, publication_operation: null, publication_pending: false });
  });
  it.each(["timeout", "503"] as const)("keeps an ambiguous ref failure %s recoverable instead of clearing its reservation", async ambiguousRef => {
    const io = fixture({ ambiguousRef });
    const response = await handlePublishRequest(request({ action: "unpublish", draftId: id, revision: 7, sha: blob }), env, io.fetcher);
    expect(response.status).toBe(502); expect(io.row()).toMatchObject({ publication_operation: operation, publication_pending: true });
    const repaired = await handlePublishRequest(request({ action: "reconcile", draftId: id }), env, io.fetcher);
    expect(await repaired.json()).toMatchObject({ withdrawalConfirmed: true, draft: { unpublished_commit: removed, publication_pending: false } });
  });
  it("does not let failed-operation cleanup overwrite a newer operation token", async () => {
    const io = fixture({ failTree: true, supersedeAtRecord: true });
    await handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    expect(io.row()).toMatchObject({ publication_operation: laterOperation, publication_pending: false, published_commit: successor });
  });
});

function concurrentPublication(existing: boolean) {
  let row: Record<string, unknown> = { id, owner_id: owner, collection: "notes", slug: "first-note", metadata: { title: "公开标题", summary: "公开摘要", topic: "AI" }, body: "A approved revision 7", revision: 7, published_slug: existing ? "first-note" : null, published_collection: existing ? "notes" : null, published_commit: existing ? before : null, published_fingerprint: "older fingerprint" };
  let head = before, nextBlob = 0, nextCommit = 0, reserveCount = 0;
  const commits = new Map<string, { parent: string; body: string }>();
  const blobs = new Map<string, string>();
  const trees = new Map<string, string>();
  let releaseFirst!: () => void, signalReserved!: () => void;
  const paused = new Promise<void>(resolve => { releaseFirst = resolve; });
  const reserved = new Promise<void>(resolve => { signalReserved = resolve; });
  const fetcher = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input);
    if (url.endsWith("/auth/v1/user")) return Response.json({ id: owner });
    if (url.endsWith("/rpc/is_workbench_owner")) return Response.json(true);
    if (url.includes("/rest/v1/workbench_drafts?")) {
      if (init.method === "PATCH") {
        const expected = new URL(url).searchParams.get("publication_operation");
        if (expected !== `eq.${row.publication_operation}`) return Response.json([]);
        row = { ...row, ...JSON.parse(String(init.body)) };
      }
      return Response.json([row]);
    }
    if (url.endsWith("/rpc/reserve_workbench_publication")) {
      const payload = JSON.parse(String(init.body));
      if (payload.expected_revision !== row.revision) return Response.json({ code: "40001" }, { status: 409 });
      row = { ...row, publication_operation: ++reserveCount === 1 ? operation : laterOperation, publication_pending: true };
      const response = { ...row };
      if (reserveCount === 1) { signalReserved(); await paused; }
      return Response.json(response);
    }
    if (url.endsWith("/git/ref/heads/main")) return Response.json({ object: { sha: head } });
    if (url.includes("/git/commits/") && init.method !== "POST") return Response.json({ tree: { sha: `tree-${url.split("/git/commits/")[1]}` } });
    if (url.endsWith("/git/blobs")) { const sha = String(++nextBlob).padStart(40, "0"); blobs.set(sha, JSON.parse(String(init.body)).content); return Response.json({ sha }); }
    if (url.endsWith("/git/trees")) { const payload = JSON.parse(String(init.body)); const tree = `tree-${nextBlob}`; trees.set(tree, blobs.get(payload.tree.find((entry: { path: string }) => entry.path === path).sha)!); return Response.json({ sha: tree }); }
    if (url.endsWith("/git/commits")) { const payload = JSON.parse(String(init.body)); const sha = String(++nextCommit + 100).padStart(40, "0"); commits.set(sha, { parent: payload.parents[0], body: trees.get(payload.tree)! }); return Response.json({ sha }); }
    if (url.endsWith("/git/refs/heads/main")) {
      const payload = JSON.parse(String(init.body));
      if (payload.force !== false || commits.get(payload.sha)!.parent !== head) return Response.json({ message: "not a fast forward" }, { status: 422 });
      head = payload.sha; return Response.json({ object: { sha: head } });
    }
    throw new Error(`Unexpected external operation ${url}`);
  };
  return { fetcher: fetcher as typeof fetch, reserved, releaseFirst, saveNewRevision() { row = { ...row, revision: 8, body: "B approved revision 8" }; }, row: () => row, head: () => head, body: () => commits.get(head)?.body };
}

describe("publication base remains tied to the approved revision", () => {
  it.each([false, true])("does not let delayed revision 7 overwrite completed revision 8 (already public: %s)", async existing => {
    const io = concurrentPublication(existing);
    const first = handlePublishRequest(request({ action: "publish", draftId: id, revision: 7 }), env, io.fetcher);
    await io.reserved;
    io.saveNewRevision();
    const second = await handlePublishRequest(request({ action: "publish", draftId: id, revision: 8 }), env, io.fetcher);
    expect(second.status).toBe(200);
    const latest = await second.json();
    io.releaseFirst();
    const delayed = await first;
    expect(delayed.status).toBe(502);
    expect(io.head()).toBe(latest.commit);
    expect(io.body()).toContain("B approved revision 8"); expect(io.body()).not.toContain("A approved revision 7");
    expect(io.row()).toMatchObject({ revision: 8, published_commit: latest.commit, publication_operation: laterOperation, publication_pending: false });
  });
});
