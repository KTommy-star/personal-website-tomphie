# Life Journey Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a responsive, accessible life-journey page that presents Dongguan, Tongliang, Chengdu, grouped student work, and the Tencent Offer as an abstract geographic narrative.

**Architecture:** Keep Astro static-first. Store confirmed display data in one typed module, render one focused Astro component with semantic HTML and an inline SVG map, and progressively enhance it with native filtering and scroll-state JavaScript. Reuse the existing route-progress utility and global design tokens; add no dependency.

**Tech Stack:** Astro 7.3.2, TypeScript 6.0.3, Tailwind CSS 4.3.3, native SVG/CSS/DOM APIs, Vitest 5.0.0

**Spec:** `docs/superpowers/specs/2026-09-11-life-journey-design.md`

## Global Constraints

- Do not add React, a map SDK, a motion library, or another dependency.
- Do not publish exact coordinates, phone, birth date, grades, rankings, or the private resume path.
- Do not infer dates, responsibilities, or stories that the user has not confirmed.
- Tencent is an Offer milestone and must explicitly say the internship has not started.
- JavaScript and motion are progressive enhancement; the full narrative remains readable without either.
- Preserve existing site tokens, navigation, header, footer, base-path handling, and content collection schemas.

---

### Task 1: Typed Journey Content

**Files:**
- Create: `src/data/journey.ts`
- Create: `tests/journey-content.test.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `JourneyChapter`, `JourneyFilter`, `StudentRole`, `journeyChapters`, `journeyFilters`, and `studentRoles`.
- Consumes: no runtime dependency.

- [ ] **Step 1: Write the failing content contract test**

```ts
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
    expect(journeyChapters.find((chapter) => chapter.id === "tencent-offer")).toMatchObject({
      filter: "milestone",
      status: "future",
    });
  });
});
```

- [ ] **Step 2: Add `tests/journey-content.test.ts` to `test:unit` and run it**

Run: `npm run test:unit`  
Expected: FAIL because `src/data/journey.ts` does not exist.

- [ ] **Step 3: Implement the minimal typed data module**

```ts
export type JourneyFilter = "education" | "student-work" | "milestone";
export type JourneyStatus = "complete" | "current" | "future";

export type JourneyStep = { title: string; note: string };
export type StudentRole = { organization: string; role: string; summary: string };
export type JourneyChapter = {
  id: string;
  index: string;
  place: string;
  eyebrow: string;
  title: string;
  lines: readonly string[];
  filter: JourneyFilter;
  status: JourneyStatus;
  mapPoint: "dongguan" | "tongliang" | "chengdu" | "future";
  steps?: readonly JourneyStep[];
  studentWork?: boolean;
};
```

Populate only the facts and restrained copy approved in the spec. The four `studentRoles` summaries describe the type of participation without inventing duties; their expandable bodies state that detailed stories will be added after confirmation.

- [ ] **Step 4: Run unit tests**

Run: `npm run test:unit`  
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add package.json src/data/journey.ts tests/journey-content.test.ts
git commit -m "feat: add life journey content model"
```

### Task 2: Semantic Journey Page Structure

**Files:**
- Create: `src/components/JourneyExperience.astro`
- Modify: `src/pages/journey/index.astro`
- Modify: `tests/build-output.test.ts`

**Interfaces:**
- Consumes: `journeyChapters`, `journeyFilters`, and `studentRoles` from `src/data/journey.ts`.
- Produces: `[data-journey-map]`, `[data-journey-chapter]`, `[data-journey-filter]`, `[data-map-point]`, and `[data-journey-progress]` DOM contracts.

- [ ] **Step 1: Add a failing production-output test**

```ts
it("renders the complete life journey narrative", async () => {
  const html = await readFile(new URL("../dist/journey/index.html", import.meta.url), "utf8");
  for (const copy of [
    "广东东莞", "水霖学校", "实验一小", "巴川中学",
    "电子科技大学", "一路工作室", "创新创业中心",
    "小城大爱实践队", "软件e声摄影部", "尚未开始实习",
  ]) expect(html).toContain(copy);
  expect(html).toContain("data-journey-map");
  expect(html).toContain("data-journey-filter");
  expect(html).not.toContain("130 0231 1696");
  expect(html).not.toContain("/Users/kongsanjin");
});
```

- [ ] **Step 2: Build and verify the new assertion fails**

Run: `npm run build && npm run test:dist`  
Expected: FAIL because the page still renders `EmptyState`.

- [ ] **Step 3: Build the semantic component**

The component contains:

```astro
<section class="journey-hero" aria-labelledby="journey-title">...</section>
<nav class="journey-filters" aria-label="筛选人生轨迹">...</nav>
<div class="journey-layout" data-journey-root>
  <aside class="journey-map" data-journey-map aria-label="东莞、铜梁与成都的抽象路线图">...</aside>
  <ol class="journey-chapters">...</ol>
</div>
```

Use an inline SVG with named groups for Dongguan, Tongliang, Chengdu, and the future path. Render school steps in the Tongliang chapter and four native `details` elements inside the single Chengdu student-work chapter. Keep all narrative text in the DOM regardless of filtering.

- [ ] **Step 4: Replace the journey `EmptyState` with `JourneyExperience`**

Keep `BaseLayout` title and description accurate. Remove only imports made obsolete by this page.

- [ ] **Step 5: Build and run production-output tests**

Run: `npm run build && npm run test:dist`  
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/JourneyExperience.astro src/pages/journey/index.astro tests/build-output.test.ts
git commit -m "feat: render life journey narrative"
```

### Task 3: Art Direction, Filtering, and Scroll Synchronization

**Files:**
- Modify: `src/components/JourneyExperience.astro`
- Modify: `src/components/BrandWord.astro`
- Modify: `tests/brand-layout.test.ts`

**Interfaces:**
- Consumes: existing `calculateRouteProgress(top, bottom, viewportHeight): number`.
- Produces: `data-active-point` on the map root, `aria-pressed` filter state, `hidden` only on nonmatching secondary content, and `--journey-progress` CSS custom property.

- [ ] **Step 1: Extend the brand placement test and make it fail**

Add `journey` to the supported BrandWord placements and assert the source includes `.brand-word--journey`.  
Run: `npm run test:unit`  
Expected: FAIL until the new placement is implemented.

- [ ] **Step 2: Implement the journey-specific `TOMPHIE` contour**

Add `journey` to `Placement` and style it as a large rotated outline behind the hero/map. Keep opacity below the foreground route, set `pointer-events: none`, and ensure mobile offsets keep at least three recognizable letters visible.

- [ ] **Step 3: Add the visual system**

Within the component stylesheet implement:

- desktop 40/60 sticky layout at `min-width: 64rem`;
- paper grid and numbered coordinate labels;
- solid completed path, active pulse, and dashed future path;
- Tongliang school rings and Chengdu student-work branches;
- single-column mobile timeline with miniature route slices;
- 44px filter/summary targets and visible focus styles;
- no horizontal overflow at 375px;
- reduced-motion rules that reveal the final route and remove pulses/transforms.

- [ ] **Step 4: Add progressive enhancement**

Use one requestAnimationFrame-throttled scroll handler. For each chapter, compare its center to `window.innerHeight * 0.48`; update `data-active-point`, `data-active`, and `--journey-progress`. Filter buttons update `aria-pressed`; matching main place chapters remain visible, while secondary detail blocks use `hidden`. If JavaScript never runs, all content remains visible.

- [ ] **Step 5: Run checks**

Run: `npm run test:unit && npm run check && npm run build && npm run test:dist`  
Expected: all pass with zero Astro errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/JourneyExperience.astro src/components/BrandWord.astro tests/brand-layout.test.ts
git commit -m "feat: animate and filter life journey"
```

### Task 4: Responsive and Accessibility Verification

**Files:**
- Modify only files implicated by a reproduced defect.

**Interfaces:**
- Consumes: final static page and DOM contracts from Tasks 1-3.
- Produces: verified desktop, tablet, mobile, keyboard, reduced-motion, and no-JavaScript behavior.

- [ ] **Step 1: Run the complete verification command**

Run: `npm run verify`  
Expected: all unit tests pass, Astro reports zero errors, build completes, and all dist tests pass.

- [ ] **Step 2: Inspect the rendered page at representative widths**

Check 1440x900, 1024x768, 768x1024, and 375x812. Confirm the sticky map never overlaps the narrative, the brand word remains a background element, the school order is legible, all four student roles are reachable, and no horizontal scrollbar appears.

- [ ] **Step 3: Inspect interaction fallbacks**

Verify keyboard focus order, `details` expansion, `aria-pressed` changes, reduced motion, and a JavaScript-disabled render. Fix only reproducible defects and rerun the narrow relevant test before `npm run verify`.

- [ ] **Step 4: Final repository audit**

Run:

```bash
git diff --check
git status --short
rg -n "130 0231 1696|2005-03|3.93|14/89|/Users/kongsanjin" src dist
```

Expected: no whitespace errors; only intended files changed; privacy search returns no matches.

- [ ] **Step 5: Commit any verification-only fixes**

```bash
git add src tests
git commit -m "fix: refine life journey responsive behavior"
```
