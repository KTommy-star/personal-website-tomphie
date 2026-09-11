# Personal Website Foundation Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish every content-independent foundation feature before requesting personal information.

**Architecture:** Keep public pages fully static and define typed Astro content collections for future Markdown entries. Add reusable SEO metadata and a GitHub Pages workflow that derives its default URL and base path from repository metadata, while allowing a future custom domain through repository variables.

**Tech Stack:** Astro 7.3.2, Tailwind CSS 4.3.3, TypeScript 6.0.3, Astro content collections with Zod 4, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-09-11-personal-website-content-experience-design.md`

## Global Constraints

- Do not invent personal facts, achievements, dates, locations, or memories.
- Private treasure entries default to private and must never be queried into public pages without an explicit visibility filter.
- GitHub project pages and custom-domain root deployments must both produce correct internal URLs.
- Preserve native scrolling and a complete reduced-motion state.
- Add no package unless the existing toolchain cannot provide the required behavior.

---

### Task 1: Typed future content collections

**Files:**
- Create: `src/content.config.ts`
- Create: `src/content/journey/.gitkeep`
- Create: `src/content/research/.gitkeep`
- Create: `src/content/projects/.gitkeep`
- Create: `src/content/notes/.gitkeep`
- Create: `src/content/treasure/.gitkeep`

**Interfaces:**
- Produces Astro collections named `journey`, `research`, `projects`, `notes`, and `treasure`.
- Every collection provides title, summary, dates, tags, draft state, visibility, and related-content identifiers plus its own domain fields.

- [ ] Define a shared Zod schema with strict strings, coerced dates, `public | private` visibility, empty tag and relation defaults, and `draft: true` by default.
- [ ] Extend the shared schema for journey type/place/role/coordinates, research kind/status/authors/contribution/links, project challenge/role/outcome/links, note topic/series/order, and treasure kind/place/consent.
- [ ] Configure `glob()` loaders against the five local Markdown directories with the exact pattern `**/[^_]*.{md,mdx}`.
- [ ] Run `npm run check`; expect 0 errors and 0 warnings.

### Task 2: SEO and deployment without personal placeholders

**Files:**
- Create: `src/components/SeoHead.astro`
- Create: `public/robots.txt`
- Create: `.github/workflows/deploy.yml`
- Modify: `src/layouts/BaseLayout.astro`
- Modify: `astro.config.mjs`
- Modify: `README.md`

**Interfaces:**
- `SeoHead` accepts `title`, `description`, and optional `image`, then emits title, description, canonical, Open Graph, and Twitter metadata.
- `astro.config.mjs` reads `GITHUB_REPOSITORY`, `SITE_URL`, and `BASE_PATH`; `/` means a root deployment.

- [ ] Move all reusable metadata from `BaseLayout` into `SeoHead` without adding fake profile data.
- [ ] Derive the default GitHub Pages site and project base from `GITHUB_REPOSITORY`; use `SITE_URL` and `BASE_PATH` only as explicit overrides.
- [ ] Add the official Astro Pages flow using `actions/checkout@v7`, `withastro/action@v6`, and `actions/deploy-pages@v5`.
- [ ] Document that custom domains set `SITE_URL=https://domain.example` and `BASE_PATH=/` as repository variables.
- [ ] Extend the production-output test to require description, Open Graph title, canonical only when a site exists, and `robots.txt` in the final build.

### Task 3: Visual, responsive, and fallback hardening

**Files:**
- Modify only files with an observed visual, accessibility, or runtime defect.
- Update: `docs/content-input-guide.md` if a missing user input is discovered.

**Interfaces:**
- Produces a keyboard-usable mobile/desktop shell and a readable static state when scroll-linked animation is unavailable or reduced.

- [ ] Run the local production preview and inspect homepage plus all section routes at desktop and narrow widths.
- [ ] Check navigation state, focus visibility, line length, horizontal overflow, touch targets, and reduced-motion behavior.
- [ ] Fix only observed defects; do not restyle adjacent areas speculatively.
- [ ] Run one final `npm run verify`, sync the clean source and lockfile to `/Users/kongsanjin/Desktop/个人网站-Tomphie`, and commit the independent desktop repository.
