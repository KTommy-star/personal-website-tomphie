import { describe, expect, it } from "vitest";
import { createDraft, type PublicArticle } from "../src/lib/workbench-content";
import { mergeDirectory, filterDirectory } from "../src/lib/workbench-directory";

const article: PublicArticle = { collection: "notes", slug: "first-note", title: "公开笔记", sha: "a".repeat(40), url: "https://example.test/notes/first-note/" };
describe("real public articles and private editing sources", () => {
  it("includes public-only articles and gives all three filters distinct results", () => {
    const draft = createDraft("notes");
    const entries = mergeDirectory([draft], [article], true);
    expect(filterDirectory(entries, "all")).toHaveLength(2);
    expect(filterDirectory(entries, "drafts").map(entry => entry.draft?.id)).toEqual([draft.id]);
    expect(filterDirectory(entries, "published").map(entry => entry.article?.slug)).toEqual(["first-note"]);
  });
  it("merges by fixed public identity without replacing newer private writing", () => {
    const draft = { ...createDraft("notes"), slug: "local", published_slug: "first-note", published_collection: "notes", body: "尚未公开的新文字" };
    const entries = mergeDirectory([draft], [article], true);
    expect(entries).toHaveLength(1);
    expect(entries[0].draft?.body).toBe("尚未公开的新文字");
    expect(entries[0].published).toBe(true);
  });
  it("treats the repository as truth, including after withdrawal", () => {
    const draft = { ...createDraft("notes"), published_commit: "b".repeat(40) };
    expect(mergeDirectory([draft], [], true)[0].published).toBe(false);
    expect(mergeDirectory([draft], [], false)[0].published).toBe(true);
    expect(mergeDirectory([{ ...draft, published_commit: null, unpublished_commit: "c".repeat(40) }], [], true)[0].published).toBe(false);
  });
});
