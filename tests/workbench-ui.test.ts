// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({ configured: true, restoreSession: vi.fn(), listDrafts: vi.fn(), saveDraft: vi.fn(), publishDraft: vi.fn(), getPublishStatus: vi.fn(), deleteDraft: vi.fn(), signOut: vi.fn() }));
vi.mock("../src/lib/workbench-api", () => ({ createWorkbenchApi: () => service }));
const id = "22222222-2222-4222-8222-222222222222";
const commit = "a".repeat(40);
const url = "https://ktommy-star.github.io/personal-website-tomphie/notes/first-note/";
const draft = { id, collection: "notes", slug: "first-note", metadata: { title: "测试笔记", summary: "真实保存的摘要", topic: "AI", tags: [], related: [], publishedAt: "2026-10-07" }, body: "原有正文", revision: 3 };
const fingerprint = createHash("sha256").update(JSON.stringify({ collection: "notes", slug: "first-note", metadata: { title: "测试笔记", summary: "真实保存的摘要", tags: [], related: [], publishedAt: "2026-10-07", topic: "AI" }, body: "原有正文" })).digest("hex");
const published = { ...draft, published_commit: commit, published_url: url, published_slug: "first-note", published_collection: "notes", published_revision: 3, published_fingerprint: fingerprint };
const button = (id: string) => document.getElementById(id) as HTMLButtonElement;
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
async function openDraft(value = draft) {
  service.listDrafts.mockResolvedValue([structuredClone(value)]);
  await import("../src/scripts/workbench");
  await flush();
  (document.querySelector(".draft-item") as HTMLButtonElement).click();
  await flush();
}

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks(); vi.useFakeTimers();
  vi.stubGlobal("crypto", webcrypto);
  document.documentElement.innerHTML = readFileSync("src/pages/admin/index.astro", "utf8").split("---").slice(2).join("---");
  service.restoreSession.mockResolvedValue(true);
  service.saveDraft.mockImplementation(async value => ({ ...value, revision: value.revision + 1 }));
  service.publishDraft.mockResolvedValue({ commit, url, fingerprint });
  service.getPublishStatus.mockResolvedValue({ state: "success", url: "https://github.com/fixture/actions/runs/1" });
  service.deleteDraft.mockResolvedValue(undefined);
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("workbench publication and deletion feedback", () => {
  it("shows submission feedback immediately and prevents a second click until deployment finishes", async () => {
    await openDraft();
    let finish!: (value: unknown) => void;
    service.publishDraft.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    service.getPublishStatus.mockResolvedValue({ state: "pending", url: "" });
    button("publish-draft").click(); await flush();
    expect(document.getElementById("publish-status")!.textContent).toContain("提交");
    expect(button("publish-draft").disabled).toBe(true);
    finish({ commit, url, fingerprint }); await flush();
    expect(button("publish-draft").disabled).toBe(true);
    expect(document.getElementById("publish-status")!.textContent).toContain("部署");
    button("publish-draft").click(); await flush();
    expect(service.publishDraft).toHaveBeenCalledTimes(1);
    service.getPublishStatus.mockResolvedValue({ state: "success", url: "" });
    await vi.advanceTimersByTimeAsync(10_000); await flush();
    expect(button("publish-draft").disabled).toBe(false);
    expect(document.getElementById("published-link")!.hidden).toBe(false);
    expect((document.getElementById("published-link") as HTMLAnchorElement).href).toContain("first-note/");
  });
  it("reminds the author about identical published content without submitting it again", async () => {
    await openDraft(published); await flush();
    button("publish-draft").click(); await flush();
    await vi.waitFor(() => expect(document.getElementById("publish-warning")!.textContent).toContain("未变化"));
    expect(service.publishDraft).not.toHaveBeenCalled();
  });
  it("keeps publication locked after a polling timeout until a terminal state is checked", async () => {
    service.getPublishStatus.mockResolvedValue({ state: "pending", url: "https://github.com/fixture/actions/runs/1" });
    await openDraft(published);
    await vi.advanceTimersByTimeAsync(300_000); await flush();
    expect(button("publish-draft").disabled).toBe(true);
    expect(button("delete-draft").disabled).toBe(true);
    expect(button("check-publication").disabled).toBe(false);
    service.getPublishStatus.mockResolvedValue({ state: "success", url: "https://github.com/fixture/actions/runs/1" });
    button("check-publication").click(); await flush();
    expect(button("publish-draft").disabled).toBe(false);
  });
  it("directs a failed deployment to its run record instead of inviting duplicate publication", async () => {
    service.getPublishStatus.mockResolvedValue({ state: "failure", url: "https://github.com/fixture/actions/runs/1" });
    await openDraft(published);
    expect(document.getElementById("publish-status")!.textContent).toContain("部署记录");
    expect((document.getElementById("deployment-link") as HTMLAnchorElement).href).toBe("https://github.com/fixture/actions/runs/1");
    button("publish-draft").click();
    await vi.waitFor(() => expect(document.getElementById("publish-warning")!.textContent).toContain("未变化"));
    expect(service.publishDraft).not.toHaveBeenCalled();
  });
  it("keeps the published ID and URL while editing and submitting the next revision", async () => {
    await openDraft(published); await flush();
    expect(button("publish-draft").textContent).toContain("更新");
    const body = document.getElementById("body") as HTMLTextAreaElement;
    body.value = "更新后的正文"; body.dispatchEvent(new Event("input", { bubbles: true }));
    button("publish-draft").click(); await flush();
    await vi.waitFor(() => expect(service.publishDraft).toHaveBeenCalledWith(expect.objectContaining({ id, slug: "first-note", body: "更新后的正文", revision: 4 })));
  });
  it("deletes the confirmed private draft and removes it from the directory", async () => {
    await openDraft();
    expect(button("delete-draft")).not.toBeNull();
    button("delete-draft").click(); await flush();
    expect(service.deleteDraft).toHaveBeenCalledWith(expect.objectContaining({ id, revision: 3 }));
    expect(document.querySelector(".draft-item")).toBeNull();
    expect(document.getElementById("draft-form")!.hidden).toBe(true);
  });
  it("keeps a draft visible when deletion fails instead of pretending it was removed", async () => {
    await openDraft(); service.deleteDraft.mockRejectedValue(new Error("其他设备已更新这篇草稿，未删除"));
    expect(button("delete-draft")).not.toBeNull();
    button("delete-draft").click(); await flush();
    expect(document.querySelector(".draft-item")).not.toBeNull();
    expect((document.getElementById("body") as HTMLTextAreaElement).value).toBe("原有正文");
    expect(document.getElementById("workbench-error")!.textContent).toContain("未删除");
  });
  it("does not delete when confirmation is canceled", async () => {
    await openDraft(); vi.mocked(window.confirm).mockReturnValue(false);
    button("delete-draft").click(); await flush();
    expect(service.deleteDraft).not.toHaveBeenCalled();
    expect(document.querySelector(".draft-item")).not.toBeNull();
  });
  it("warns that deleting a published draft leaves the public article and removes its editable source", async () => {
    await openDraft(published);
    button("delete-draft").click(); await flush();
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("不会被撤下"));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("无法再从工作台编辑"));
    expect(service.deleteDraft).toHaveBeenCalledWith(expect.objectContaining({ id }));
  });
});
