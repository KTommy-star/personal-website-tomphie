import { describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  nextTheme,
  resolveTheme,
} from "../src/lib/theme";

describe("theme state", () => {
  it("uses a saved valid theme before system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the system preference", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme("invalid", false)).toBe("light");
  });

  it("toggles between the only two final states", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
    expect(THEME_STORAGE_KEY).toBe("tomphie-theme");
  });
});
