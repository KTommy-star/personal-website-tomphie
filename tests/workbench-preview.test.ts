// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderWorkbenchPreview } from "../src/lib/workbench-preview";

describe("workbench preview", () => {
  it("removes executable HTML and unsafe links", async () => {
    const html = await renderWorkbenchPreview('<script>alert(1)</script><img src=x onerror="alert(1)"><iframe src="https://example.com"></iframe>\n\n[click](javascript:alert(1))\n\n<a href="data:text/html,evil">bad</a>');
    const root = document.createElement("div");
    root.innerHTML = html;
    expect(root.querySelector("script,iframe,[onerror]" )).toBeNull();
    expect([...root.querySelectorAll("a")].some(a => /^(javascript|data):/i.test(a.getAttribute("href") ?? ""))).toBe(false);
  });

  it("preserves Chinese text and escapes code rather than executing it", async () => {
    const html = await renderWorkbenchPreview('# 青山手记\n\n```html\n<script>危险</script>\n```');
    const root = document.createElement("div");
    root.innerHTML = html;
    expect(root.querySelector("h1")?.textContent).toBe("青山手记");
    expect(root.querySelector("code")?.textContent).toContain("<script>危险</script>");
    expect(root.querySelector("script")).toBeNull();
  });

  it("resolves private image references in preview without changing Markdown", async () => {
    const reference = 'asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp';
    const markdown = `![湖边](${reference})`;
    const html = await renderWorkbenchPreview(markdown, async value => value === reference ? 'https://storage.example.com/private.webp?token=temporary' : 'javascript:alert(1)');
    const root = document.createElement("div");
    root.innerHTML = html;
    expect(root.querySelector("img")?.src).toBe('https://storage.example.com/private.webp?token=temporary');
    expect(markdown).toBe(`![湖边](${reference})`);
  });

  it("never renders an unsafe resolver result or unresolved asset as an image URL", async () => {
    const reference = 'asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.webp';
    const root = document.createElement("div");
    root.innerHTML = await renderWorkbenchPreview(`![图片](${reference})`, async () => 'javascript:alert(1)');
    expect(root.querySelector("img")?.getAttribute("src")).toBeNull();
  });

  it("renders inline and display math while refusing trusted HTML commands", async () => {
    const html = await renderWorkbenchPreview('公式 $x^2$\n\n$$\n\\frac{a}{b}\n$$\n\n$\\href{javascript:alert(1)}{危险}$');
    expect(html).toContain('katex');
    expect(html).toContain('math');
    const root = document.createElement("div");
    root.innerHTML = html;
    expect(root.querySelector('a[href^="javascript:"]')).toBeNull();
  });

  it("opens safe links separately with opener protection", async () => {
    const root = document.createElement("div");
    root.innerHTML = await renderWorkbenchPreview('[来源](https://example.com/paper)');
    const link = root.querySelector("a")!;
    expect(link.href).toBe("https://example.com/paper");
    expect(link.target).toBe("_blank");
    expect(link.rel).toContain("noopener");
  });
  it("resolves private document and video links without writing the signed URL into Markdown", async () => {
    const prefix = 'asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333';
    const source = `[报告.pdf](${prefix}.pdf)\n\n[演示.mp4](${prefix}.mp4)`;
    const root = document.createElement("div");
    root.innerHTML = await renderWorkbenchPreview(source, async reference => `https://storage.example.com/${reference.split('/').at(-1)}?token=temporary`);
    const links = Array.from(root.querySelectorAll("a"));
    expect(links).toHaveLength(2);
    expect(links[0].getAttribute("href")).toContain(".pdf?token=");
    expect(links[1].dataset.attachmentReference).toBe(`${prefix}.mp4`);
    expect(source).not.toContain("token=");
    expect(root.querySelector("iframe,video,object")).toBeNull();
  });
  it("does not turn a document reference into an executable image", async () => {
    const reference = 'asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf';
    const root = document.createElement("div");
    root.innerHTML = await renderWorkbenchPreview(`![误用](${reference})`, async () => 'https://storage.example.com/file.pdf');
    expect(root.querySelector("img")?.getAttribute("src")).toBeNull();
  });
});
