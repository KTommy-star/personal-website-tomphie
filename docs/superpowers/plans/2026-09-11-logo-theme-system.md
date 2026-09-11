# Tomphie Logo and Theme System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the user's existing Tomphie line-art logo to the navigation, homepage opening, footer, and favicon, plus a persistent accessible light/dark theme.

**Architecture:** A reusable Astro SVG component owns both exact logo variants and uses `currentColor` for theme adaptation. A small typed theme module defines the two-state model, while an inline head bootstrap prevents theme flash and a header button owns user interaction. Existing semantic CSS tokens expand to theme-aware surface tokens so every current page inherits the selected theme.

**Tech Stack:** Astro 7.3.2, Tailwind CSS 4.3.3, TypeScript 6.0.3, Vitest 5.0.0, CSS animations, localStorage, matchMedia

**Spec:** `docs/superpowers/specs/2026-09-11-logo-theme-system-design.md`

## Global Constraints

- Work only in `/Users/kongsanjin/Desktop/个人网站-Tomphie`.
- Preserve the exact SVG path geometry from `/Users/kongsanjin/Desktop/tomphie-logo/tomphie-logo.svg` and `/Users/kongsanjin/Desktop/tomphie-logo/tomphie-icon.svg`.
- Do not add runtime dependencies or an animation library.
- Do not add a blocking splash screen or delay native scrolling.
- Keep the private resume and all private material outside the public repository and build output.
- Use semantic color tokens; no component may retain a fixed light surface.
- Respect `prefers-reduced-motion` and retain keyboard-visible focus.
- Verify at 320, 375, 768, 1024, and 1440px before publishing.

---

### Task 1: Theme state model

**Files:**
- Create: `src/lib/theme.ts`
- Create: `tests/theme.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `Theme`, `THEME_STORAGE_KEY`, `resolveTheme(storedTheme, prefersDark)`, and `nextTheme(theme)`.
- Consumed by: `ThemeToggle.astro` and tests; the head bootstrap must use the same storage key and accepted values.

- [ ] **Step 1: Add the failing theme tests**

```ts
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
```

Append `tests/theme.test.ts` to the explicit `test:unit` Vitest command in `package.json`.

- [ ] **Step 2: Run the test and confirm RED**

Run: `npm run test:unit`

Expected: FAIL because `src/lib/theme.ts` does not exist.

- [ ] **Step 3: Implement the minimal typed model**

```ts
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "tomphie-theme";

export function resolveTheme(
  storedTheme: string | null,
  prefersDark: boolean,
): Theme {
  if (storedTheme === "light" || storedTheme === "dark") return storedTheme;
  return prefersDark ? "dark" : "light";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "light" ? "dark" : "light";
}
```

- [ ] **Step 4: Run the unit tests and confirm GREEN**

Run: `npm run test:unit`

Expected: all unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json src/lib/theme.ts tests/theme.test.ts
git commit -m "feat: add theme state model"
```

---

### Task 2: Reusable logo and entrance drawing

**Files:**
- Create: `src/components/TomphieLogo.astro`
- Create: `tests/logo-theme-source.test.ts`
- Modify: `package.json`
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/ProfileHero.astro`
- Modify: `src/components/SiteFooter.astro`
- Modify: `public/favicon.svg`

**Interfaces:**
- Consumes: exact source SVG path data from the two user-owned SVG files.
- Produces: `<TomphieLogo variant="wordmark" | "icon" reveal={boolean} />`.
- Produces DOM hooks: `data-tomphie-logo`, `data-logo-variant`, and `data-logo-reveal`.

- [ ] **Step 1: Add failing source and output tests**

```ts
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
```

Extend `tests/build-output.test.ts` homepage assertions:

```ts
expect(html.match(/data-tomphie-logo/g)).toHaveLength(3);
expect(html).toContain('data-logo-variant="icon"');
expect(html).toContain('data-logo-variant="wordmark"');
expect(html).toContain("data-logo-reveal");
```

Append `tests/logo-theme-source.test.ts` to `test:unit` in `package.json`.

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:unit`

Expected: FAIL because `TomphieLogo.astro` does not exist.

- [ ] **Step 3: Build the reusable SVG component**

Create an Astro component with this exact public contract:

```astro
---
interface Props {
  variant: "wordmark" | "icon";
  reveal?: boolean;
  class?: string;
}

const { variant, reveal = false, class: className } = Astro.props;
const viewBox = variant === "wordmark" ? "33 45 913 481" : "0 0 480 480";
---
```

Render one inline `svg` with `fill="none"`, `stroke="currentColor"`, round caps and joins, `aria-hidden="true"`, `data-tomphie-logo`, `data-logo-variant`, and conditional `data-logo-reveal`. Copy every `path` and unchanged `d` value from the two exact source files named in Global Constraints. Add `pathLength="1"` and sequential `--path-index` values to those paths. The reveal variant starts with dash offset `1` and animates to `0`; static variants remain fully visible.

Use one `logo-draw` keyframe, sequential delays, and a total visual duration between 1.25 and 1.55 seconds. Wrap all hidden initial path state inside `@media (prefers-reduced-motion: no-preference)` so reduced motion never hides the mark.

- [ ] **Step 4: Place the logo**

In `SiteHeader.astro`, replace `brand-dot` with the icon component and keep the `Tomphie` label. Put the theme control slot at the far right without changing navigation labels.

In `ProfileHero.astro`, place the reveal wordmark immediately before the `h1`, aligned to the same left edge. Delay the existing hero copy animation so the name begins around 55% of the logo draw, without hiding content when reduced motion is active.

In `SiteFooter.astro`, replace the text-only site name with a static wordmark followed by the existing description.

Rewrite `public/favicon.svg` using the exact icon paths, transparent background, and embedded light/dark media styles for the stroke.

- [ ] **Step 5: Build and confirm GREEN**

Run: `npm run build && npm run test:unit && npm run test:dist`

Expected: all logo source and output assertions pass; seven static routes build.

- [ ] **Step 6: Commit**

```bash
git add package.json public/favicon.svg src/components/TomphieLogo.astro src/components/SiteHeader.astro src/components/ProfileHero.astro src/components/SiteFooter.astro tests/logo-theme-source.test.ts tests/build-output.test.ts
git commit -m "feat: integrate Tomphie logo"
```

---

### Task 3: Persistent light and dark themes

**Files:**
- Create: `src/components/ThemeToggle.astro`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `src/styles/global.css`
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/components/RouteIndex.astro`
- Modify: `tests/logo-theme-source.test.ts`
- Modify: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `Theme`, `THEME_STORAGE_KEY`, and `nextTheme()` from `src/lib/theme.ts`.
- Produces: `<ThemeToggle />` with `data-theme-toggle`, `aria-pressed`, and state-specific accessible labels.
- Produces: `<html data-theme="light|dark">` before first paint and `--color-surface` / `--color-surface-glass` tokens.

- [ ] **Step 1: Extend tests for the theme contract**

Add these source assertions to `tests/logo-theme-source.test.ts`:

```ts
const layout = await readFile(
  new URL("../src/layouts/BaseLayout.astro", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../src/styles/global.css", import.meta.url),
  "utf8",
);
expect(layout).toContain("tomphie-theme");
expect(layout).toContain("prefers-color-scheme: dark");
expect(styles).toContain(':root[data-theme="dark"]');
expect(styles).toContain("--color-surface:");
expect(styles).toContain("color-scheme: dark");
```

Add these build assertions to `tests/build-output.test.ts`:

```ts
expect(html).toContain("data-theme-toggle");
expect(html).toContain("切换到深色模式");
expect(html).toContain('name="theme-color"');
```

- [ ] **Step 2: Run tests and confirm RED**

Run: `npm run test:unit && npm run build && npm run test:dist`

Expected: theme source/output assertions fail before implementation.

- [ ] **Step 3: Add pre-paint theme bootstrap**

In `BaseLayout.astro`, set `color-scheme` to `light dark`, keep a named `theme-color` meta element, and run an inline head script before body rendering:

```js
(() => {
  const key = "tomphie-theme";
  let stored = null;
  try { stored = localStorage.getItem(key); } catch {}
  const dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const theme = stored === "light" || stored === "dark"
    ? stored
    : dark ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();
```

The bootstrap must remain small and synchronous; it must not import a client framework.

- [ ] **Step 4: Add semantic theme tokens**

Keep the existing light palette and add `--color-surface`, `--color-surface-glass`, and `--color-surface-glass-hover`. Override all semantic tokens under `:root[data-theme="dark"]` with the approved values from the spec. Add a system-dark fallback only for `:root:not([data-theme])`.

Apply color transitions only after the bootstrap adds a `theme-ready` class. Under reduced motion, disable those transitions.

Replace RouteIndex fixed light RGBA values and the header mobile `bg-white` state with semantic tokens. Preserve the photograph's natural colors.

- [ ] **Step 5: Implement the accessible toggle**

Create a native button whose visible icon is a two-tone circle. On initialization and after every click, update:

```ts
button.ariaPressed = String(theme === "dark");
button.ariaLabel = theme === "dark"
  ? "切换到浅色模式"
  : "切换到深色模式";
document.documentElement.dataset.theme = theme;
document.documentElement.style.colorScheme = theme;
document.querySelector('meta[name="theme-color"]')
  ?.setAttribute("content", theme === "dark" ? "#0D1015" : "#F4F7FA");
```

Save the explicit choice with `tomphie-theme`. If storage throws, keep the current page state. Listen to system preference changes only when there is no saved choice.

Place `<ThemeToggle />` at the right side of `SiteHeader.astro`, before the mobile menu summary on narrow screens.

- [ ] **Step 6: Run the focused and full test suites**

Run: `npm run test:unit && npm run check && npm run build && npm run test:dist`

Expected: unit, Astro diagnostics, build, and distribution tests all pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/ThemeToggle.astro src/layouts/BaseLayout.astro src/styles/global.css src/components/SiteHeader.astro src/components/RouteIndex.astro tests/logo-theme-source.test.ts tests/build-output.test.ts
git commit -m "feat: add persistent dark mode"
```

---

### Task 4: Responsive, accessibility, and public deployment verification

**Files:**
- Modify only files identified by failures in Tasks 1–3.
- Test: `tests/logo-theme-source.test.ts`
- Test: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: completed Logo and theme components.
- Produces: verified static output at the existing GitHub Pages URL.

- [ ] **Step 1: Verify repository boundaries**

Run:

```bash
git status --short
rg -n "resume-kong-junxin|孔俊鑫 · PDF|/Users/kongsanjin" src public dist
```

Expected: only intended implementation files are changed; no private resume or local absolute path appears in the public site.

- [ ] **Step 2: Run the complete verification command**

Run: `npm run verify`

Expected: all tests pass, Astro reports zero diagnostics, and seven static routes build.

- [ ] **Step 3: Inspect responsive states**

At 320, 375, 768, 1024, and 1440px, inspect:

- header brand, theme button, and mobile menu fit on one line;
- homepage Logo remains visible and does not collide with the name;
- both themes have no horizontal overflow or fixed light rectangles;
- reduced-motion mode shows the complete Logo immediately.

Record any concrete defect as a failing source/output assertion before changing code, then rerun `npm run verify`.

- [ ] **Step 4: Commit any verification fixes**

If verification required code changes, commit only those tested changes:

```bash
git add src/components/TomphieLogo.astro src/components/ThemeToggle.astro src/components/SiteHeader.astro src/components/ProfileHero.astro src/components/SiteFooter.astro src/components/RouteIndex.astro src/layouts/BaseLayout.astro src/styles/global.css public/favicon.svg tests/logo-theme-source.test.ts tests/build-output.test.ts
git commit -m "fix: polish logo and theme responsiveness"
```

If no changes were required, do not create an empty commit.

- [ ] **Step 5: Publish and verify GitHub Pages**

Run:

```bash
git push origin main
gh run list --repo KTommy-star/personal-website-tomphie --limit 4
```

Wait for both `Verify website` and `Deploy to GitHub Pages` to succeed. Then request the public URL and confirm HTTP 200 plus the `data-theme-toggle`, `data-tomphie-logo`, and `data-logo-reveal` markers.
