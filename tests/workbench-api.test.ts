// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkbenchApi } from "../src/lib/workbench-api";
import { createDraft } from "../src/lib/workbench-content";

const config = { url: "https://fixture.supabase.co", key: "public-fixture", username: "Tomphie", email: "owner@example.test" };
afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); sessionStorage.clear(); });

describe("workbench provider contract", () => {
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
