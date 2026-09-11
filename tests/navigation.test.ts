import { describe, expect, it } from "vitest";
import { navigation } from "../src/data/navigation";
import { site } from "../src/data/site";

describe("site foundation", () => {
  it("uses the Tomphie identity", () => {
    expect(site.name).toBe("Tomphie");
    expect(site.locale).toBe("zh-CN");
  });

  it("exposes the approved primary navigation in order", () => {
    expect(navigation.map((item) => item.label)).toEqual([
      "首页",
      "人生轨迹",
      "科研",
      "项目",
      "笔记",
      "珍宝库",
    ]);
  });

  it("does not reuse a route", () => {
    expect(new Set(navigation.map((item) => item.href)).size).toBe(
      navigation.length,
    );
  });
});
