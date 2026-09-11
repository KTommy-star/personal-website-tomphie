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
});
