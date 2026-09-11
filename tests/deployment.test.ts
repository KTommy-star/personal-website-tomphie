import { describe, expect, it } from "vitest";
import { resolveDeployment } from "../src/lib/deployment.js";

describe("resolveDeployment", () => {
  it("uses relative URLs for local builds", () => {
    expect(resolveDeployment({})).toEqual({});
  });

  it("derives a GitHub project Pages URL", () => {
    expect(resolveDeployment({ GITHUB_REPOSITORY: "tomphie/personal-site" })).toEqual({
      site: "https://tomphie.github.io",
      base: "/personal-site",
    });
  });

  it("keeps a GitHub user site at the root", () => {
    expect(resolveDeployment({ GITHUB_REPOSITORY: "tomphie/tomphie.github.io" })).toEqual({
      site: "https://tomphie.github.io",
    });
  });

  it("supports a custom domain at the root", () => {
    expect(
      resolveDeployment({
        GITHUB_REPOSITORY: "tomphie/personal-site",
        SITE_URL: "https://tomphie.example",
        BASE_PATH: "/",
      }),
    ).toEqual({ site: "https://tomphie.example" });
  });
});
