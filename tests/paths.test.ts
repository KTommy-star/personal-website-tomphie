import { describe, expect, it } from "vitest";
import { withBase } from "../src/lib/paths";

describe("withBase", () => {
  it("keeps root-relative links unchanged at the domain root", () => {
    expect(withBase("/research", "/")).toBe("/research");
  });

  it("prefixes internal links for GitHub project pages", () => {
    expect(withBase("/research", "/personal-site/")).toBe(
      "/personal-site/research",
    );
  });

  it("preserves external, mail, phone, and hash links", () => {
    for (const href of [
      "https://example.com",
      "mailto:hi@example.com",
      "tel:10086",
      "#main",
    ]) {
      expect(withBase(href, "/personal-site/")).toBe(href);
    }
  });
});
