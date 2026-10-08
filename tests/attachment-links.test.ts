// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { attachmentInfo, attachmentMarkdown, decorateAttachmentLinks } from "../src/lib/attachment-links";

const reference = "asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf";
describe("attachment links", () => {
  it("recognizes owned storage references and preserves original names", () => {
    expect(attachmentInfo(reference, "论文.pdf")?.name).toBe("论文.pdf");
    expect(attachmentInfo(reference, "论文.pdf")?.extension).toBe("pdf");
    expect(attachmentInfo("asset://invalid.pdf", "bad")).toBeUndefined();
  });
  it("only upgrades same-origin published uploads, not arbitrary external files", () => {
    expect(attachmentInfo("/uploads/example.pptx", "演示稿")?.extension).toBe("pptx");
    expect(attachmentInfo("https://external.test/uploads/a.pdf", "a")).toBeUndefined();
    expect(attachmentInfo("javascript:alert(1)", "a.pdf")).toBeUndefined();
    expect(attachmentInfo("/other/file.pdf", "a")).toBeUndefined();
  });
  it("escapes Markdown delimiters and refuses malformed references", () => {
    expect(attachmentMarkdown("分析[终稿].pdf", reference)).toBe(`[分析\\[终稿\\].pdf](${reference})`);
    expect(() => attachmentMarkdown("a.pdf", "javascript:alert(1)")).toThrow();
  });
  it("decorates links once with text-only labels and accessible action hints", () => {
    const root = document.createElement("div");
    const link = document.createElement("a");
    link.href = "/uploads/sample.xlsx";
    link.textContent = "<危险>.xlsx";
    root.append(link);
    decorateAttachmentLinks(root);
    decorateAttachmentLinks(root);
    expect(link.querySelectorAll(".attachment-name")).toHaveLength(1);
    expect(link.textContent).toContain("<危险>.xlsx");
    expect(link.querySelector("script,危险")).toBeNull();
    expect(link.getAttribute("aria-label")).toContain("预览");
  });
});
