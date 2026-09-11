import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("brand word placement", () => {
  it("keeps route and story backgrounds inside the viewport", async () => {
    const source = await readFile(
      new URL("../src/components/BrandWord.astro", import.meta.url),
      "utf8",
    );

    expect(source).toContain("inset-inline-start: -6vw;");
    expect(source).toContain("inset-inline-start: -20vw;");
    expect(source).toContain("inset-inline-end: -8rem;");
    expect(source).toContain("inset-inline-end: -6rem;");
  });
});
