import { describe, expect, it } from "vitest";
import { journeyChapters, studentRoles } from "../src/data/journey";

describe("journey content", () => {
  it("preserves the confirmed route and school order", () => {
    expect(journeyChapters.map((chapter) => chapter.place)).toEqual([
      "广东东莞",
      "重庆铜梁",
      "四川成都",
      "腾讯 Offer",
      "当前坐标",
    ]);
    expect(journeyChapters[1].steps?.map((step) => step.title)).toEqual([
      "水霖学校",
      "实验一小",
      "巴川中学",
    ]);
  });

  it("groups student work and keeps Tencent as a future milestone", () => {
    expect(studentRoles).toHaveLength(4);
    expect(
      journeyChapters.find((chapter) => chapter.id === "tencent-offer"),
    ).toMatchObject({
      filter: "milestone",
      status: "future",
    });
  });
});
