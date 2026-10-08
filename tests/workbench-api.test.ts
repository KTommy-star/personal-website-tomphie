// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchApi } from "../src/lib/workbench-api";
import { createDraft } from "../src/lib/workbench-content";
import { File as NativeFile } from "node:buffer";

const config = { url: "https://fixture.supabase.co", key: "public-fixture", username: "Tomphie", email: "owner@example.test" };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe("workbench provider contract", () => {
  it("validates attachment filenames, size and bytes before any remote operation", async () => {
    const external = vi.fn(); vi.stubGlobal("fetch", external); const api = createWorkbenchApi(config);
    await expect(api.uploadAttachment(createDraft("notes").id, new NativeFile(["<script>unsafe</script>"], "fake.pdf", { type: "application/pdf" }) as unknown as File)).rejects.toThrow();
    await expect(api.uploadAttachment(createDraft("notes").id, new NativeFile(["unsafe"], "payload.html", { type: "text/html" }) as unknown as File)).rejects.toThrow();
    expect(external).not.toHaveBeenCalled();
  });
  it("rejects malformed preview paths before requesting a signed private URL", async () => {
    const external = vi.fn(); vi.stubGlobal("fetch", external); const api = createWorkbenchApi(config);
    await expect(api.previewAsset("asset://../../secret.pdf")).rejects.toThrow();
    await expect(api.previewAsset("asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.html")).rejects.toThrow();
    expect(external).not.toHaveBeenCalled();
  });
  it("rejects another draft's reference when preview is bound to the active draft", async () => {
    const external = vi.fn(); vi.stubGlobal("fetch", external); const api = createWorkbenchApi(config);
    const reference = "asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf";
    await expect(api.previewAsset(reference, "44444444-4444-4444-8444-444444444444")).rejects.toThrow("本篇");
    expect(external).not.toHaveBeenCalled();
  });
  it("uploads approved documents only to the authenticated owner's private draft path", async () => {
    const owner = "11111111-1111-4111-8111-111111111111"; const draftId = "22222222-2222-4222-8222-222222222222";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (input: unknown, init: RequestInit = {}) => {
      const url = String(input); calls.push({ url, init });
      if (url.includes("/auth/v1/token")) return Response.json({ access_token: "fixture-token", token_type: "bearer", expires_in: 3600, refresh_token: "fixture-refresh", user: { id: owner } });
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: owner });
      if (url.endsWith("/rpc/is_workbench_owner")) return Response.json(true);
      if (url.includes("/storage/v1/object/workbench-private/")) return Response.json({ Key: "uploaded", Id: "fixture" });
      throw new Error(`Unexpected operation ${url}`);
    });
    const api = createWorkbenchApi(config); await api.signIn("Tomphie", "fixture", false);
    const file = new NativeFile(["%PDF-1.7\nfixture\n%%EOF"], "个人报告.PDF", { type: "application/pdf" });
    const reference = await api.uploadAttachment(draftId, file as unknown as File);
    expect(reference).toMatch(new RegExp(`^asset://${owner}/${draftId}/[a-f0-9-]{36}\\.pdf$`));
    const upload = calls.find(call => call.url.includes("/storage/v1/object/"))!;
    expect(upload.url).toBe(`https://fixture.supabase.co/storage/v1/object/workbench-private/${reference.slice(8)}`);
    expect(new Headers(upload.init.headers).get("x-upsert")).toBe("false");
    expect(upload.url).not.toContain("个人报告");
  });
  it("deletes only the selected draft at its known revision through the owner RPC", async () => {
    const draft = { ...createDraft("notes"), revision: 4 };
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (input: unknown, init: RequestInit) => {
      calls.push({ url: String(input), body: JSON.parse(String(init.body)) });
      return new Response(null, { status: 204 });
    });
    await createWorkbenchApi(config).deleteDraft(draft);
    expect(calls).toEqual([{ url: "https://fixture.supabase.co/rest/v1/rpc/delete_workbench_draft", body: { draft_id: draft.id, expected_revision: 4 } }]);
  });
  it("preserves a draft when a newer device revision prevents deletion", async () => {
    const draft = { ...createDraft("notes"), body: "保留我的内容", revision: 4 };
    vi.stubGlobal("fetch", async () => Response.json({ code: "40001", message: "版本冲突", hint: null, details: null }, { status: 409 }));
    await expect(createWorkbenchApi(config).deleteDraft(draft)).rejects.toThrow("其他设备");
    expect(draft.body).toBe("保留我的内容");
  });
  it("requests a single returned database row, not a relation array", async () => {
    const draft = { ...createDraft("notes"), revision: 1 };
    vi.stubGlobal("fetch", async (_input: unknown, init: RequestInit) => {
      const single = new Headers(init.headers).get("accept") === "application/vnd.pgrst.object+json";
      const updated = { ...draft, revision: 2 };
      return Response.json(single ? updated : [updated]);
    });
    const saved = await createWorkbenchApi(config).saveDraft(draft);
    expect(saved.id).toBe(draft.id);
    expect(saved.revision).toBe(2);
  });
  it("surfaces database revision conflicts without mutating local text", async () => {
    const draft = { ...createDraft("notes"), body: "本机尚未保存的文字", revision: 1 };
    vi.stubGlobal("fetch", async () => Response.json({ code: "40001", message: "版本冲突", hint: null, details: null }, { status: 409 }));
    await expect(createWorkbenchApi(config).saveDraft(draft)).rejects.toThrow("本机内容已保留");
    expect(draft.body).toBe("本机尚未保存的文字");
  });
  it("fails clearly when no private service was configured", async () => {
    const external = vi.fn(); vi.stubGlobal("fetch", external);
    await expect(createWorkbenchApi({ ...config, key: "" }).saveDraft(createDraft("notes"))).rejects.toThrow("尚未连接");
    expect(external).not.toHaveBeenCalled();
  });
});
