import { access, readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { JSDOM } from "jsdom";

const pages = [
  ["index.html", "Tomphie"],
  ["journey/index.html", "人生轨迹"],
  ["research/index.html", "科研"],
  ["projects/index.html", "项目"],
  ["notes/index.html", "笔记"],
  ["404.html", "没有找到这个坐标"],
] as const;

describe("static routes", () => {
  it("does not publish the retired section or link to it", async () => {
    await expect(
      access(new URL("../dist/treasure/index.html", import.meta.url)),
    ).rejects.toMatchObject({ code: "ENOENT" });

    for (const [file] of pages) {
      const html = await readFile(
        new URL(`../dist/${file}`, import.meta.url),
        "utf8",
      );
      expect(html).not.toContain("/treasure");
      expect(html).not.toContain("珍宝库");
    }
  });

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
    expect(html.match(/data-tomphie-logo/g)).toHaveLength(3);
    expect(html).toContain('data-logo-variant="icon"');
    expect(html).toContain('data-logo-variant="wordmark"');
    expect(html).toContain("data-logo-reveal");
    expect(html).toContain("data-theme-toggle");
    expect(html).toContain("切换到深色模式");
    expect(html).toContain('name="theme-color"');
    expect(html).toContain("小城大爱实践队");
    expect(html).toContain("软件e声摄影部");
    expect(html).toContain('data-copy-value="ksanjin@163.com"');
    expect(html).toContain('data-copy-value="2454002157"');
    expect(html).toContain('data-copy-value="TommyK2024"');
    expect(html).toContain("github.com/KTommy-star");
    expect(html).toContain('href="https://github.com/KTommy-star"');
    expect(html).toContain('data-route-progress');
    expect(html).toContain('data-route-card');
    expect(html).toContain('data-story-progress');
    expect(html).toContain('data-story-node');
    expect(html).not.toContain("resume-kong-junxin.pdf");
    expect(html).not.toContain("孔俊鑫 · PDF");
    expect(html).toContain('alt="孔俊鑫的湖畔复古插画头像"');
    expect(html).not.toContain('href="mailto:');
    expect(html).not.toContain("/Users/kongsanjin");
  });

  it("renders the complete life journey narrative", async () => {
    const html = await readFile(
      new URL("../dist/journey/index.html", import.meta.url),
      "utf8",
    );

    for (const copy of [
      "广东东莞",
      "水霖学校",
      "实验一小",
      "巴川中学",
      "电子科技大学",
      "一路工作室",
      "创新创业中心",
      "小城大爱实践队",
      "软件e声摄影部",
      "尚未开始实习",
    ]) {
      expect(html).toContain(copy);
    }
    expect(html).toContain("data-journey-map");
    expect(html).toContain("data-journey-filter");
    expect(html).toContain('data-brand-placement="journey"');
    expect(html).not.toContain("130 0231 1696");
    expect(html).not.toContain("2005-03");
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
  it("builds a private-by-default standalone workbench with correct configuration visibility", async () => {
    const html = await readFile(new URL("../dist/admin/index.html", import.meta.url), "utf8");
    expect(html).toContain("私人写作工作台");
    expect(html).toContain('content="noindex,nofollow,noarchive"');
    expect(html).toContain('id="workspace" hidden');
    const document = new JSDOM(html).window.document;
    const config = document.querySelector<HTMLElement>("[data-workbench]")!.dataset;
    const configured = Boolean(config.url && config.key && config.email && config.username);
    expect(document.querySelector<HTMLElement>("#configuration-notice")!.hidden).toBe(configured);
    expect(document.querySelector<HTMLElement>("#login-form")!.hidden).toBe(!configured);
    expect(html).not.toContain("data-glass");
    expect(html).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(html).not.toContain("GITHUB_TOKEN");
    const home = await readFile(new URL("../dist/index.html", import.meta.url), "utf8");
    const scripts = (text: string) => [...text.matchAll(/<script[^>]+src="([^"]+)"/g)].map(match => match[1]);
    const homeScripts = scripts(home);
    const editorScripts = scripts(html).filter(src => !homeScripts.includes(src));
    expect(editorScripts.length).toBeGreaterThan(0);
    const bundle = (src: string) => {
      const path = new URL(src, "https://example.test").pathname;
      const asset = path.slice(path.indexOf("/_astro/") + 1);
      return readFile(new URL(`../dist/${asset}`, import.meta.url), "utf8");
    };
    expect((await Promise.all(editorScripts.map(bundle))).join("\n")).toContain("tomphie-workbench-session");
    expect((await Promise.all(homeScripts.map(bundle))).join("\n")).not.toContain("tomphie-workbench-session");
  });
});
