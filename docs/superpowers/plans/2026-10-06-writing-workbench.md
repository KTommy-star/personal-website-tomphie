# Private Writing Workbench Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent workbench UI and scoped review; the controller implements shared contracts and the publishing boundary. Steps use checkbox syntax.

**Goal:** Add one-owner password login, private synced research/project/note drafts, image uploads, preview and explicit publication to the existing static site.

**Architecture:** Supabase Auth, private Postgres rows and Storage enforce owner access; a checked Edge Function publishes an atomic commit to the existing GitHub repository. Astro remains static, with a separate admin bundle and public content collection pages.

**Tech Stack:** Existing Astro/TypeScript/Motion; pinned Supabase JS, Marked, DOMPurify and KaTeX. Native browser controls, no React.

**Spec:** `docs/superpowers/specs/2026-10-06-writing-workbench-design.md`

## Global Constraints

- Work only in `/Users/kongsanjin/Desktop/个人网站-Tomphie`; no second checkout.
- Preserve the approved landscape, theme, logo and glass architecture.
- Private drafts, original private assets, passwords and privileged keys never enter Git or static output.
- Only notes, research and projects are editable; do not fabricate real publications.
- Auth and private storage require user-owned platform configuration; report that boundary honestly.

### Task 1: Content contracts and private persistence

**Files:** `supabase/functions/_shared/content.ts`, `src/lib/workbench-content.ts`, `src/lib/workbench-api.ts`, `supabase/migrations/202610060001_workbench.sql`, `tests/workbench-content.test.ts`.

**Interfaces:** `Collection = "notes" | "research" | "projects"`; `Draft = {id, collection, slug, metadata, body, revision, updated_at?, published_commit?, published_url?}`. `createDraft(collection)` initializes an editable blank draft. `createWorkbenchApi({url,key,username,email})` exposes `configured`, `signIn(account,password,remember)`, `restoreSession()`, `signOut()`, `listDrafts(collection)`, `saveDraft(draft)`, `uploadImage(draftId,file)`, `previewAsset(reference)`, `publishDraft(draft)`, `getPublishStatus(commit)`.

- [ ] Write failing behavior tests: bad publication slugs/links rejected; missing required publication metadata rejected; private asset references collected uniquely; Markdown serialization cannot inject frontmatter.
- [ ] Run `npx vitest run tests/workbench-content.test.ts` and observe missing implementation failures.
- [ ] Implement the contracts, owner-only SQL policies and optimistic revision-saving RPC. Use JSON-encoded frontmatter scalars instead of raw concatenated YAML values.
- [ ] Implement the API with managed password authentication and owner verification. Use sessionStorage unless remember-device is selected; no password persistence.
- [ ] Rerun contract tests and TypeScript check.

### Task 2: Workbench UI

**Files:** `src/pages/admin/index.astro`, `src/styles/workbench.css`, `src/scripts/workbench.ts`, `src/lib/workbench-preview.ts`, `tests/workbench-preview.test.ts`.

**Consumes:** Task 1 API. `publishDraft` returns `{commit,url}`; `getPublishStatus` returns `{state:"pending"|"success"|"failure",url}`. `uploadImage` returns an `asset://` reference; `previewAsset` returns a short-lived preview URL.

- [ ] Test rendered preview safety before implementing: executable HTML and javascript links removed, code/Chinese text preserved, private asset URLs resolved only in the preview.
- [ ] Build the unconfigured state, labelled login, owner-only directory, editable field forms, Markdown toolbar, preview tab and image upload with native controls.
- [ ] Debounce private autosave; serialize saves; preserve dirty changes on failures and version conflicts. Require public-release confirmation.
- [ ] Check keyboard navigation and 390/1440 layouts, including failed login, unsaved changes and missing configuration.

### Task 3: Publication boundary

**Files:** `supabase/functions/_shared/publisher.ts`, `supabase/functions/publish-content/index.ts`, `supabase/config.toml`, `tests/workbench-publisher.test.ts`.

- [ ] Write failing tests exercising the real handler with external HTTP fixtures: unauthenticated/other-user rejection, stale revision rejection, atomic commit paths, private-only image downloads, upstream failure and deploy status.
- [ ] Verify a missing handler fails, then implement bearer verification using Supabase Auth and owner RPC before any privileged GitHub call.
- [ ] Load the saved draft with the user's token, validate metadata and referenced owner/draft asset paths, check image signature/size, create one Git tree and commit, then update main without force. Restrict published content paths to fixed collection directories and uploads.
- [ ] Save the submitted commit in the private database and inspect the Pages workflow by that commit; do not equate a commit with successful deployment.
- [ ] Run publisher tests.

### Task 4: Public reading pages and configuration handoff

**Files:** `src/components/content/ContentIndex.astro`, `src/components/content/ContentArticle.astro`, collection index/detail routes, `src/styles/content.css`, `.env.example`, `.gitignore`, deployment workflow, `docs/workbench-setup.md`.

- [ ] Add filtering tests proving private/draft entries stay out of lists and routes.
- [ ] Render real content collections with search, topic/tag filters, headings and readable details; retain meaningful empty states when no public entries exist.
- [ ] Configure math and sanitized Markdown; add a discreet footer workbench entry without adding a sixth main navigation item.
- [ ] Document exact platform setup: disable signups, create the sole account, install SQL, set only public site variables, keep GitHub credential server-side and deploy the function. Add ignore rules before creating any local configuration.
- [ ] Run new tests, existing unit tests, Astro check and static build; inspect only the necessary browser flows. Do not push or claim live configuration without authority/credentials.

## Execution ruling

User has explicitly requested implementation in this session, so execute without another planning approval round. Keep the sole desktop checkout and existing branch to respect project instructions; do not create a worktree. Code review is scoped to the added authentication/publishing boundary. No external project, account or paid plan is provisioned automatically.
