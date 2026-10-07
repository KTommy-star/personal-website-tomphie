// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { initContentLibrary } from "../src/lib/content-library";

afterEach(() => { vi.unstubAllGlobals(); document.body.replaceChildren(); });
const library = (version: string, content: string) => `<section data-content-library data-content-version="${version}"><button data-content-refresh>刷新内容</button><p data-content-refresh-status role="status"></p>${content}</section>`;
const published = `<input data-content-search><select data-content-filter><option value="">全部</option><option value="AI">AI</option></select><p data-content-count></p><article data-content-record data-search="公开的笔记" data-topic="AI"><a href="/personal-website-tomphie/notes/first/">公开的笔记</a></article><p hidden data-content-no-results>没有结果</p>`;

describe("fresh public content lists", () => {
  it("replaces a stale empty page with freshly deployed public records using a cache-busting request", async () => {
    document.body.innerHTML = library("old", "<p>暂时还没有公开笔记</p>");
    let requested = "";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      requested = url;
      expect(init.cache).toBe("no-store");
      return new Response(library("new", published));
    });
    const root = document.querySelector<HTMLElement>("[data-content-library]")!;
    await initContentLibrary(root);
    expect(requested).toContain("_content=");
    expect(root.textContent).toContain("公开的笔记");
    expect(root.textContent).not.toContain("暂时还没有公开笔记");
    const input = root.querySelector<HTMLInputElement>("[data-content-search]")!;
    input.value = "不存在的内容"; input.dispatchEvent(new Event("input"));
    expect(root.querySelector<HTMLElement>("[data-content-record]")!.hidden).toBe(true);
    expect(root.querySelector<HTMLElement>("[data-content-no-results]")!.hidden).toBe(false);
  });
  it("keeps readable existing records and gives a retry message when refresh fails", async () => {
    document.body.innerHTML = library("new", published);
    vi.stubGlobal("fetch", async () => { throw new TypeError("offline"); });
    const root = document.querySelector<HTMLElement>("[data-content-library]")!;
    await initContentLibrary(root);
    expect(root.querySelector("[data-content-record]")).not.toBeNull();
    expect(root.querySelector("[data-content-refresh-status]")!.textContent).toContain("重试");
  });
});
