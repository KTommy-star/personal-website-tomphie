import { createMarkdownProcessor } from "@astrojs/markdown-remark";
import { describe, expect, it } from "vitest";
import { publicMarkdown } from "../src/lib/public-markdown";

describe("public article Markdown", () => {
  it("renders actual headings, math and lists with the production pipeline", async () => {
    const processor = await createMarkdownProcessor(publicMarkdown);
    const result = await processor.render("## 研究记录\n\n公式 $x^2$\n\n- 第一项\n- 第二项");
    expect(result.code).toContain('class="katex"');
    expect(result.code).toContain("<li>第一项</li>");
    expect(result.metadata.headings).toEqual([expect.objectContaining({ depth: 2, text: "研究记录" })]);
  });
  it("removes authored executable HTML and unsafe link protocols", async () => {
    const processor = await createMarkdownProcessor(publicMarkdown);
    const result = await processor.render('<script>alert("attack")</script>\n\n<img src="x" onerror="alert(1)">\n\n[unsafe](javascript:alert)\n\n[safe](https://example.test)');
    expect(result.code).not.toContain("<script");
    expect(result.code).not.toContain("onerror");
    expect(result.code).not.toContain("javascript:");
    expect(result.code).toContain('href="https://example.test"');
  });
});
