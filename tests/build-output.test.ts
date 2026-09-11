import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pages = [
  ["index.html", "Tomphie"],
  ["journey/index.html", "人生轨迹"],
  ["research/index.html", "科研"],
  ["projects/index.html", "项目"],
  ["notes/index.html", "笔记"],
  ["treasure/index.html", "珍宝库"],
  ["404.html", "没有找到这个坐标"],
] as const;

describe("static routes", () => {
  for (const [file, heading] of pages) {
    it(`renders ${file}`, async () => {
      const html = await readFile(
        new URL(`../dist/${file}`, import.meta.url),
        "utf8",
      );
      expect(html).toContain(heading);
      expect(html).toContain('id="main-content"');
      expect(html).toContain('name="description"');
      expect(html).toContain('property="og:title"');
    });
  }

  it("publishes the real homepage identity and contact paths", async () => {
    const html = await readFile(
      new URL("../dist/index.html", import.meta.url),
      "utf8",
    );

    expect(html).toContain("孔俊鑫");
    expect(html).toContain("Tommy");
    expect(html).toContain("UESTCer");
    expect(html).toContain("TOMPHIE");
    expect(html).toContain("小城大爱实践队");
    expect(html).toContain("软件e声摄影部");
    expect(html).toContain('data-copy-value="ksanjin@163.com"');
    expect(html).toContain('data-copy-value="2454002157"');
    expect(html).toContain('data-copy-value="TommyK2024"');
    expect(html).toContain("github.com/KTommy-star");
    expect(html).toContain('href="https://github.com/KTommy-star"');
    expect(html).not.toContain("resume-kong-junxin.pdf");
    expect(html).not.toContain("孔俊鑫 · PDF");
    expect(html).toContain('alt="孔俊鑫在湖边的个人照片"');
    expect(html).not.toContain('href="mailto:');
    expect(html).not.toContain("/Users/kongsanjin");
  });

  it("renders the TOMPHIE brand matrix across every homepage section", async () => {
    const html = await readFile(
      new URL("../dist/index.html", import.meta.url),
      "utf8",
    );

    const placements = ["hero", "story", "focus", "routes", "contact"];
    expect(html.match(/data-brand-word/g)).toHaveLength(placements.length);
    for (const placement of placements) {
      expect(html).toContain(`data-brand-placement="${placement}"`);
    }
  });

  it("publishes crawler guidance", async () => {
    const robots = await readFile(
      new URL("../dist/robots.txt", import.meta.url),
      "utf8",
    );
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });
});
