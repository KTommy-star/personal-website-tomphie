import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("Tomphie logo integration", () => {
  it("keeps both logo variants and normalized draw paths", async () => {
    const source = await readFile(
      new URL("../src/components/TomphieLogo.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain('variant: "wordmark" | "icon"');
    expect(source).toContain('pathLength="1"');
    expect(source).toContain("stroke-dashoffset");
    expect(source).toContain("prefers-reduced-motion: no-preference");
  });
  it("defines persistent dark theme hooks", async () => {
    const [layout, styles, toggle] = await Promise.all([
      readFile(new URL("../src/layouts/BaseLayout.astro", import.meta.url), "utf8"),
      readFile(new URL("../src/styles/global.css", import.meta.url), "utf8"),
      readFile(new URL("../src/components/ThemeToggle.astro", import.meta.url), "utf8"),
    ]);

    expect(layout).toContain("tomphie-theme");
    expect(layout).toContain("prefers-color-scheme: dark");
    expect(styles).toContain(':root[data-theme="dark"]');
    expect(styles).toContain("--color-surface:");
    expect(styles).toContain("color-scheme: dark");
    expect(toggle).toContain("data-theme-toggle");
    expect(toggle).toContain("切换到深色模式");
  });
});
