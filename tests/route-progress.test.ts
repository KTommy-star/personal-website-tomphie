import { describe, expect, it } from "vitest";
import { calculateRouteProgress } from "../src/lib/route-progress";

describe("calculateRouteProgress", () => {
  it("maps the route line to the viewport journey", () => {
    expect(calculateRouteProgress(720, 1720, 1000)).toBe(0);
    expect(calculateRouteProgress(0, 1000, 1000)).toBeCloseTo(0.5);
    expect(calculateRouteProgress(-720, 280, 1000)).toBe(1);
  });

  it("clamps values before and after the route", () => {
    expect(calculateRouteProgress(1200, 2200, 1000)).toBe(0);
    expect(calculateRouteProgress(-1200, -200, 1000)).toBe(1);
  });
});
