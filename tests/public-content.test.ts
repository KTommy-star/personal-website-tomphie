import { describe, expect, it } from "vitest";
import { publicEntries, matchingEntry } from "../src/lib/public-content";

describe("public reading routes", () => {
  it("excludes private or unfinished content from both lists and detail routes", () => {
    const entries = [
      { id: "private", data: { title: "私密", visibility: "private", draft: false } },
      { id: "unfinished", data: { title: "未完成", visibility: "public", draft: true } },
      { id: "approved", data: { title: "已公开", visibility: "public", draft: false } },
    ];
    expect(publicEntries(entries).map(item => item.id)).toEqual(["approved"]);
  });
  it("orders public content newest first without relying on input order", () => {
    const entries = [{ id: "old", data: { visibility: "public", draft: false, publishedAt: new Date("2026-01-01") } }, { id: "new", data: { visibility: "public", draft: false, publishedAt: new Date("2026-09-01") } }];
    expect(publicEntries(entries).map(item => item.id)).toEqual(["new", "old"]);
  });
  it("matches Chinese search and exact topic filters together", () => {
    expect(matchingEntry("多模态医学学习 AI", "医学", "医学", "医学")).toBe(true);
    expect(matchingEntry("多模态医学学习 AI", "医学", "AI", "医学")).toBe(false);
    expect(matchingEntry("多模态医学学习 AI", "Agent", "医学", "医学")).toBe(false);
  });
});
