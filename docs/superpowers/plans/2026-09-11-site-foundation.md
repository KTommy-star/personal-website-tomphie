# Personal Website Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build module 0 as a deployable, accessible Astro foundation with the approved content routes, shared design system, motion-safe homepage scaffold, and a clear content handoff guide.

**Architecture:** Astro renders every route as static HTML so the site remains readable without client JavaScript and can later deploy to GitHub Pages. Tailwind CSS 4 supplies utility classes and design tokens; the first scroll narrative is CSS-only progressive enhancement, while future complex maps and archive interactions may be isolated React islands.

**Tech Stack:** Astro 7 stable, Tailwind CSS 4, TypeScript 6 strict mode, Vitest, Astro Check, npm, static HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-11-personal-website-content-experience-design.md`

## Global Constraints

- Keep all six primary destinations: 首页、人生轨迹、科研、项目、笔记、珍宝库.
- Preserve native browser scrolling; do not implement scroll-jacking.
- Every animation must have a readable static final state and respect `prefers-reduced-motion`.
- Use one global accent per view; avoid gradients, glow, stock card grids, and decorative animation.
- Use semantic HTML, visible keyboard focus, a skip link, and sequential heading levels.
- Keep the first version static-first; do not add authentication, comments, CMS, 3D, or autoplay media.
- Do not add React until a concrete interaction requires client JavaScript.

---

### Task 1: Toolchain and base-path behavior

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `tests/paths.test.ts`
- Create: `src/lib/paths.ts`

**Interfaces:**
- Consumes: a requested internal path and Astro-compatible base path.
- Produces: `withBase(path: string, base?: string): string` for every internal navigation link.

- [ ] **Step 1: Add test tooling and write the failing path tests**

```ts
import { describe, expect, it } from "vitest";
import { withBase } from "../src/lib/paths";

describe("withBase", () => {
  it("keeps root-relative links unchanged at the domain root", () => {
    expect(withBase("/research", "/")).toBe("/research");
  });

  it("prefixes internal links for GitHub project pages", () => {
    expect(withBase("/research", "/personal-site/")).toBe("/personal-site/research");
  });

  it("preserves external, mail, phone, and hash links", () => {
    for (const href of ["https://example.com", "mailto:hi@example.com", "tel:10086", "#main"]) {
      expect(withBase(href, "/personal-site/")).toBe(href);
    }
  });
});
```

- [ ] **Step 2: Run the test and confirm the missing module prevents the behavior from passing**

Run: `npm test -- tests/paths.test.ts`  
Expected: FAIL because `src/lib/paths.ts` does not exist.

- [ ] **Step 3: Add a minimal exported stub, rerun, and confirm the project-page assertion fails**

```ts
export function withBase(path: string): string {
  return path;
}
```

Run: `npm test -- tests/paths.test.ts`  
Expected: one failing assertion for `/personal-site/research`.

- [ ] **Step 4: Implement normalized base-path handling**

```ts
const EXTERNAL_PREFIX = /^(?:[a-z]+:|#)/i;

export function withBase(path: string, base = "/"): string {
  if (EXTERNAL_PREFIX.test(path)) return path;
  const normalizedBase = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  const normalizedPath = path === "/" ? "" : `/${path.replace(/^\/+/, "")}`;
  return `${normalizedBase}${normalizedPath}` || "/";
}
```

- [ ] **Step 5: Run the focused tests**

Run: `npm test -- tests/paths.test.ts`  
Expected: 3 passing tests, 0 failures.

### Task 2: Site identity and navigation contract

**Files:**
- Create: `tests/navigation.test.ts`
- Create: `src/data/site.ts`
- Create: `src/data/navigation.ts`

**Interfaces:**
- Consumes: no runtime input.
- Produces: `site` metadata and a typed `navigation` array with `label`, `href`, and `description`.

- [ ] **Step 1: Write tests for identity, route order, and unique destinations**

```ts
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
      "首页", "人生轨迹", "科研", "项目", "笔记", "珍宝库",
    ]);
  });

  it("does not reuse a route", () => {
    expect(new Set(navigation.map((item) => item.href)).size).toBe(navigation.length);
  });
});
```

- [ ] **Step 2: Run the focused test and confirm it fails because the data modules are absent**

Run: `npm test -- tests/navigation.test.ts`  
Expected: FAIL because the two data modules do not exist.

- [ ] **Step 3: Add the exact site metadata and six navigation records**

Use the names and paths `/`, `/journey`, `/research`, `/projects`, `/notes`, and `/treasure`. Descriptions must explain the content in plain Chinese rather than marketing language.

- [ ] **Step 4: Run the focused test**

Run: `npm test -- tests/navigation.test.ts`  
Expected: 3 passing tests, 0 failures.

### Task 3: Shared layout and visual foundation

**Files:**
- Create: `src/styles/global.css`
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/components/SiteHeader.astro`
- Create: `src/components/SiteFooter.astro`
- Create: `src/components/PageIntro.astro`
- Create: `public/favicon.svg`

**Interfaces:**
- Consumes: `title`, `description`, and the current pathname.
- Produces: a complete HTML document with metadata, skip link, persistent navigation, main landmark, and footer.

- [ ] **Step 1: Define Tailwind 4 imports and the approved color/type/spacing tokens**

Use `@import "tailwindcss"`, semantic paper/ink/quiet/line/path/memory colors, visible `:focus-visible`, balanced headings, pretty body wrapping, and a reduced-motion override. Use `min-height: 100dvh`; do not use `100vh`.

- [ ] **Step 2: Build the document layout with semantic landmarks**

`BaseLayout.astro` must set `lang="zh-CN"`, viewport metadata, canonical metadata when `Astro.site` exists, `<a href="#main-content">跳到主要内容</a>`, `<header>`, `<nav aria-label="主导航">`, `<main id="main-content">`, and `<footer>`.

- [ ] **Step 3: Use native disclosure for the mobile menu**

Use `<details>` and `<summary>菜单</summary>` so navigation is usable without JavaScript. Mark the matching destination with `aria-current="page"` and route every internal link through `withBase`.

- [ ] **Step 4: Add a path-shaped SVG favicon**

The favicon uses a circle and one curved route in the global path-blue color. It contains no text, emoji, gradient, or glow.

- [ ] **Step 5: Run Astro type checking**

Run: `npm run check`  
Expected: 0 errors.

### Task 4: Homepage route narrative and six page scaffolds

**Files:**
- Create: `tests/build-output.test.ts`
- Create: `src/components/RouteIndex.astro`
- Create: `src/components/EmptyState.astro`
- Create: `src/pages/index.astro`
- Create: `src/pages/journey/index.astro`
- Create: `src/pages/research/index.astro`
- Create: `src/pages/projects/index.astro`
- Create: `src/pages/notes/index.astro`
- Create: `src/pages/treasure/index.astro`
- Create: `src/pages/404.astro`

**Interfaces:**
- Consumes: `navigation`, `site`, and the shared layout.
- Produces: seven buildable public routes and a 404 page, each with a single `h1` and honest content placeholders.

- [ ] **Step 1: Write build-output tests for every required route**

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const pages = [
  ["index.html", "Tomphie"],
  ["journey/index.html", "人生轨迹"],
  ["research/index.html", "科研"],
  ["projects/index.html", "项目"],
  ["notes/index.html", "笔记"],
  ["treasure/index.html", "珍宝库"],
  ["404.html", "没有找到这个坐标"],
] as const;

describe("static routes", () => {
  for (const [file, heading] of pages) {
    it(`renders ${file}`, async () => {
      const html = await readFile(new URL(`../dist/${file}`, import.meta.url), "utf8");
      expect(html).toContain(heading);
      expect(html).toContain('id="main-content"');
    });
  }
});
```

- [ ] **Step 2: Run a build and the test to confirm the missing routes fail**

Run: `npm run build && npm test -- tests/build-output.test.ts`  
Expected: FAIL because the required page files do not exist.

- [ ] **Step 3: Build the homepage editorial route index**

Create one `h1`, current-position copy, one primary link to `/journey`, and a vertical path that connects all six destinations. Use a CSS `view()` animation only inside `@supports (animation-timeline: view())`; animate `transform: scaleY()` and keep the static line visible otherwise.

- [ ] **Step 4: Build honest scaffolds for the five remaining sections and the 404 page**

Each page explains its purpose and lists the exact information the user will later provide. The treasure page must state that privacy mode will be selected before personal media is added. Empty states must offer one clear next action, never fake achievements or sample memories.

- [ ] **Step 5: Build and run the route test**

Run: `npm run build && npm test -- tests/build-output.test.ts`  
Expected: 7 passing route tests, 0 failures.

### Task 5: Content handoff, CI, and full verification

**Files:**
- Create: `docs/content-input-guide.md`
- Create: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `package.json`

**Interfaces:**
- Consumes: the finished module 0 source tree.
- Produces: a repeatable contributor workflow and a single `npm run verify` quality gate.

- [ ] **Step 1: Document the content request format**

List the required identity, journey, research, project, note, contact, image-rights, and treasure-privacy fields. Mark only email, domain, social links, dates, places, copy, media, and privacy choice as user-provided inputs; do not invent values.

- [ ] **Step 2: Add CI and local verification**

CI must install with `npm ci` and run `npm run verify` on pushes and pull requests. `verify` must run unit tests, Astro Check, production build, and the build-output test in that order.

- [ ] **Step 3: Write concise local-development instructions**

README commands: `npm install`, `npm run dev`, `npm run verify`, and `npm run build`. Explain that deployment and the final `site`/`base` values wait for the GitHub username, repository, and domain in module 7.

- [ ] **Step 4: Run the complete quality gate**

Run: `npm run verify`  
Expected: all unit and build-output tests pass, Astro Check reports 0 errors, and the production build exits 0.

- [ ] **Step 5: Inspect the working tree and commit the module**

Run: `git diff --check && git status --short`  
Expected: no whitespace errors and only module 0 files listed.

Commit message: `feat: scaffold Tomphie personal website foundation`.
