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

  it("publishes crawler guidance", async () => {
    const robots = await readFile(
      new URL("../dist/robots.txt", import.meta.url),
      "utf8",
    );
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Allow: /");
  });
});
