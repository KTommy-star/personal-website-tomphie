import { createWorkbenchApi } from "../lib/workbench-api";
import { createDraft, publicationFingerprint, type Collection, type Draft } from "../lib/workbench-content";
import { renderWorkbenchPreview } from "../lib/workbench-preview";

const root = document.querySelector<HTMLElement>("[data-workbench]")!;
const api = createWorkbenchApi({ url: root.dataset.url ?? "", key: root.dataset.key ?? "", username: root.dataset.username ?? "", email: root.dataset.email ?? "" });
const element = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const form = element<HTMLFormElement>("draft-form");
const body = element<HTMLTextAreaElement>("body");
const collectionSelect = element<HTMLSelectElement>("collection");
const errorBox = element("workbench-error");
const status = element("save-status");
const saveButton = element<HTMLButtonElement>("save-draft");
const publishButton = element<HTMLButtonElement>("publish-draft");
const deleteButton = element<HTMLButtonElement>("delete-draft");
const draftFilter = element<HTMLSelectElement>("draft-filter");
let collection: Collection = "notes";
let drafts: Draft[] = [];
let current: Draft | null = null;
let edited = 0;
let saved = 0;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let saving: Promise<void> | undefined;
let conflict = false;
let uploading = false;
let publishing = false;
let deploying = false;
let checkingPublication = false;
let deleting = false;
let loading = false;
let navigating = false;
let previewGeneration = 0;
let publishGeneration = 0;
const assetCache = new Map<string, { url: string; expires: number }>();
const publicationWarnings = new Map<string, string>();

function message(error: unknown) {
  return error instanceof Error ? error.message : "操作未完成，请稍后重试。";
}

function updateButtons() {
  const busy = uploading || publishing || deleting || loading || navigating;
  saveButton.disabled = !current || conflict || busy;
  publishButton.disabled = !current || conflict || busy || deploying;
  publishButton.textContent = publishing ? "正在提交…" : deploying ? "部署中…" : current?.published_commit ? "更新已发布文章" : "发布到网站";
  publishButton.setAttribute("aria-busy", String(publishing || deploying));
  deleteButton.disabled = !current || busy || deploying;
  deleteButton.textContent = deleting ? "正在删除…" : "删除草稿";
  element<HTMLButtonElement>("check-publication").disabled = busy || checkingPublication;
  element<HTMLButtonElement>("new-draft").disabled = busy;
  collectionSelect.disabled = busy;
  draftFilter.disabled = busy;
  element<HTMLButtonElement>("sign-out").disabled = busy;
  element<HTMLButtonElement>("reload-draft").disabled = busy;
  form.inert = publishing || deleting || (loading && conflict);
  document.querySelectorAll<HTMLButtonElement>(".draft-item").forEach(button => { button.disabled = busy; });
}

function updateSlugLock() {
  const locked = Boolean(current?.published_slug || current?.published_commit);
  element<HTMLInputElement>("slug").readOnly = locked;
  element("slug-note").textContent = locked ? "页面地址在首次提交发布时固定，后续发布沿用原链接。" : "首次提交发布后，沿用此地址。";
}

function mergePublicationFields(result: Draft) {
  if (!current || current.id !== result.id) return;
  current = { ...current, published_commit: result.published_commit, published_url: result.published_url, published_slug: result.published_slug, published_collection: result.published_collection, published_at: result.published_at, published_revision: result.published_revision, published_fingerprint: result.published_fingerprint };
  updateSlugLock();
}

function renderDirectory() {
  const list = element("draft-list");
  list.replaceChildren();
  const visible = drafts.filter(draft => draftFilter.value === "all" || (draftFilter.value === "published" ? Boolean(draft.published_commit) : !draft.published_commit));
  element("directory-state").textContent = drafts.length ? `显示 ${visible.length} / ${drafts.length} 篇文章` : "还没有草稿。新建一篇开始写作。";
  for (const draft of visible) {
    const li = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.className = "draft-item";
    button.setAttribute("aria-current", String(current?.id === draft.id));
    const title = document.createElement("span");
    title.textContent = String(draft.metadata.title || "未命名草稿");
    const detail = document.createElement("small");
    detail.textContent = draft.published_commit ? "已提交发布 · 点击继续编辑" : draft.published_slug ? "链接已固定 · 私密草稿" : "私密草稿";
    button.append(title, detail);
    button.addEventListener("click", async () => {
      if (current?.id === draft.id || loading || uploading || publishing || deleting) return;
      if (await guardChanges()) selectDraft(draft);
    });
    li.append(button);
    list.append(li);
  }
  updateButtons();
}

function selectDraft(draft: Draft) {
  clearTimeout(saveTimer);
  deploying = false;
  checkingPublication = false;
  element("deployment-link").hidden = true;
  element("check-publication").hidden = true;
  current = structuredClone(draft);
  edited = saved = 0;
  conflict = false;
  errorBox.textContent = "";
  element("conflict-actions").hidden = true;
  element("editor-empty").hidden = true;
  form.hidden = false;
  form.reset();
  document.querySelectorAll<HTMLFieldSetElement>("[data-fields]").forEach(fields => {
    fields.hidden = fields.dataset.fields !== draft.collection;
    fields.disabled = fields.hidden;
  });
  element("links-field").hidden = draft.collection === "notes";
  element("collection-details-title").textContent = `${draft.collection === "notes" ? "笔记" : draft.collection === "research" ? "科研" : "项目"}信息`;
  element<HTMLDetailsElement>("collection-details").open = false;
  element<HTMLTextAreaElement>("links").disabled = draft.collection === "notes";
  const required = ["title", "summary", "body", ...(draft.collection === "notes" ? ["topic"] : draft.collection === "research" ? ["authors", "contribution"] : ["startedAt", "challenge", "role", "outcome"])];
  for (const input of Array.from(form.elements)) {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement)) continue;
    if (!input.name) continue;
    input.required = required.includes(input.name) || input.name === "slug";
    const value = input.name === "body" ? draft.body : input.name === "slug" ? draft.slug : draft.metadata[input.name];
    if (input.name === "links") {
      input.value = Array.isArray(value) ? value.map(link => `${link.label} | ${link.url}`).join("\n") : "";
    } else if (Array.isArray(value)) input.value = value.join(", ");
    else if (input instanceof HTMLInputElement && input.type === "date") input.value = value ? String(value).slice(0, 10) : "";
    else input.value = value == null ? "" : String(value);
  }
  updateSlugLock();
  status.textContent = draft.revision > 0 ? "私密云端已保存" : "新草稿，尚未保存";
  element("publish-status").textContent = "";
  const warning = publicationWarnings.get(draft.id);
  element("publish-warning").textContent = warning ?? "";
  element("publish-warning").hidden = !warning;
  element("published-link").hidden = true;
  publishGeneration++;
  if (draft.published_commit) {
    element("publish-status").textContent = "草稿有公开版本，正在确认最近一次发布的部署状态…";
    void pollPublication(draft.published_commit, publishGeneration, draft.published_url ?? "");
  } else if (draft.published_slug) element("publish-status").textContent = "此草稿已开始发布，链接已固定；当前发布状态尚未确认。";
  renderDirectory();
  refreshPreview();
  showView("editor");
  element<HTMLInputElement>("title").focus();
}

function readForm() {
  if (!current) return;
  const metadata = { ...current.metadata };
  for (const input of Array.from(form.elements)) {
    if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement || input instanceof HTMLSelectElement) || input.matches(":disabled") || !input.name || input.name === "body" || input.name === "slug") continue;
    const value = input.value.trim();
    if (["tags", "authors", "related"].includes(input.name)) metadata[input.name] = value.split(/[,，]/).map(item => item.trim()).filter(Boolean);
    else if (input.name === "links") metadata.links = value ? value.split("\n").filter(line => line.trim()).map(line => {
      const separator = line.indexOf("|");
      return { label: separator < 0 ? line.trim() : line.slice(0, separator).trim(), url: separator < 0 ? "" : line.slice(separator + 1).trim() };
    }) : [];
    else if (input.name === "order") { if (value) metadata.order = Number(value); else delete metadata.order; }
    else if (value || ["title", "summary", "topic", "contribution", "role", "challenge", "outcome"].includes(input.name)) metadata[input.name] = value;
    else delete metadata[input.name];
  }
  current = { ...current, slug: element<HTMLInputElement>("slug").value.trim(), metadata, body: body.value };
}

function changed() {
  if (!current) return;
  readForm();
  edited++;
  errorBox.textContent = "";
  status.textContent = conflict ? "存在版本冲突，当前文字尚未保存" : "已修改，等待保存到私密云端";
  clearTimeout(saveTimer);
  if (!conflict) saveTimer = setTimeout(() => { void saveChanges(); }, 900);
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => { void refreshPreview(); }, 250);
}

async function saveChanges() {
  clearTimeout(saveTimer);
  if (saving) return saving;
  if (!current || conflict || saved === edited) return;
  saving = (async () => {
    while (current && saved !== edited && !conflict) {
      const snapshot = structuredClone(current);
      const epoch = edited;
      status.textContent = "正在保存到私密云端…";
      try {
        const result = await api.saveDraft(snapshot);
        // Only merge server bookkeeping: keystrokes made during this request stay intact.
        current = { ...current, revision: result.revision, updated_at: result.updated_at };
        mergePublicationFields(result);
        saved = epoch;
        const index = drafts.findIndex(draft => draft.id === result.id);
        if (index < 0) drafts.unshift(result); else drafts[index] = result;
        renderDirectory();
        status.textContent = saved === edited ? "私密云端已保存" : "已修改，继续保存…";
      } catch (error) {
        const typed = error as { code?: string; status?: number };
        conflict = typed.code === "conflict" || typed.status === 409 || /conflict|冲突|版本|revision/i.test(message(error));
        status.textContent = conflict ? "版本冲突，当前文字仍保留" : "保存失败，当前修改尚未保存";
        errorBox.textContent = message(error);
        element("conflict-actions").hidden = !conflict;
        break;
      }
    }
  })();
  try { await saving; } finally { saving = undefined; updateButtons(); }
}

async function guardChanges() {
  if (uploading || publishing || deleting || navigating || loading) return false;
  navigating = true;
  updateButtons();
  try {
    await saveChanges();
    if (edited === saved) return true;
    return window.confirm("当前修改尚未保存到私密云端。离开这篇草稿会丢失这些修改，确定放弃并继续吗？");
  } finally { navigating = false; updateButtons(); }
}

async function loadDirectory() {
  loading = true;
  updateButtons();
  element("directory-state").textContent = "正在读取私密草稿…";
  try {
    drafts = await api.listDrafts(collection);
    renderDirectory();
  } catch (error) {
    drafts = [];
    element("draft-list").replaceChildren();
    element("directory-state").textContent = "读取失败。重新选择栏目可重试。";
    errorBox.textContent = message(error);
  } finally { loading = false; updateButtons(); }
}

async function signedAsset(reference: string) {
  const cached = assetCache.get(reference);
  if (cached && cached.expires > Date.now()) return cached.url;
  const url = await api.previewAsset(reference);
  assetCache.set(reference, { url, expires: Date.now() + 30_000 });
  return url;
}

async function refreshPreview() {
  const generation = ++previewGeneration;
  if (!current) return;
  const snapshot = structuredClone(current);
  try {
    const cover = String(snapshot.metadata.cover || "").replace(/[<>\r\n]/g, "");
    const html = await renderWorkbenchPreview(`${cover ? `![封面](<${cover}>)\n\n` : ""}${snapshot.body}`, signedAsset);
    if (generation !== previewGeneration || current?.id !== snapshot.id) return;
    const preview = element("preview");
    const title = document.createElement("h1");
    title.textContent = String(snapshot.metadata.title || "未命名草稿");
    const summary = document.createElement("p");
    summary.className = "quiet";
    summary.textContent = String(snapshot.metadata.summary || "");
    const content = document.createElement("div");
    content.innerHTML = html;
    preview.replaceChildren(title, summary, content);
  } catch (error) {
    if (generation === previewGeneration) errorBox.textContent = `预览未更新：${message(error)}`;
  }
}

function showView(view: string) {
  document.querySelector<HTMLElement>(".workbench-grid")!.dataset.view = view;
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach(button => { if (button.tagName === "BUTTON") button.setAttribute("aria-pressed", String(button.dataset.view === view)); });
}

function insertText(before: string, after = "", placeholder = "文字") {
  const start = body.selectionStart;
  const end = body.selectionEnd;
  const text = body.value.slice(start, end) || placeholder;
  body.setRangeText(before + text + after, start, end, "end");
  body.focus();
  body.setSelectionRange(start + before.length, start + before.length + text.length);
  changed();
}

async function encodeImage(file: File): Promise<Blob> {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("请选择 JPG、PNG 或 WebP 图片。");
  if (file.size > 15 * 1024 * 1024) throw new Error("原图片超过 15 MB，请先缩小后上传。");
  const bitmap = await createImageBitmap(file);
  try {
    if (bitmap.width * bitmap.height > 50_000_000) throw new Error("图片尺寸过大，请先缩小后上传。");
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法处理图片，请换一个浏览器重试。");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.84, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", quality));
      if (!blob || blob.type !== "image/webp") throw new Error("浏览器不支持 WebP 转换，请换一个浏览器上传。");
      if (blob.size <= 1024 * 1024) return blob;
    }
    throw new Error("图片压缩后仍超过 1 MB，请先缩小图片。");
  } finally { bitmap.close(); }
}

let imageTarget: "body" | "cover" = "body";
let imageSelection = { start: 0, end: 0 };
let bodyBeforeUpload = "";
function chooseImage(target: "body" | "cover") {
  if (!current || uploading || publishing || deleting) return;
  imageTarget = target;
  imageSelection = { start: body.selectionStart, end: body.selectionEnd };
  bodyBeforeUpload = body.value;
  element<HTMLInputElement>("image-file").click();
}

element<HTMLInputElement>("image-file").addEventListener("change", async event => {
  const input = event.currentTarget as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file || !current || deleting || publishing) return;
  const id = current.id;
  const target = imageTarget;
  const selection = imageSelection;
  const originalBody = bodyBeforeUpload;
  uploading = true;
  if (target === "cover") element<HTMLInputElement>("cover").readOnly = true;
  updateButtons();
  errorBox.textContent = "";
  status.textContent = "正在处理图片…";
  try {
    const blob = await encodeImage(file);
    // Persist the draft first so the private image belongs to an existing draft.
    if (!current.revision && edited === saved) edited++;
    await saveChanges();
    if (edited !== saved || conflict) throw new Error("草稿尚未保存成功，图片没有上传。请先处理保存错误。");
    status.textContent = "正在上传私密图片…";
    const reference = await api.uploadImage(id, blob);
    if (current?.id !== id) return;
    if (target === "cover") element<HTMLInputElement>("cover").value = reference;
    else if (body.value === originalBody) body.setRangeText(`\n![图片说明](${reference})\n`, selection.start, selection.end, "end");
    else body.value += `\n![图片说明](${reference})\n`;
    changed();
    if (target === "body") body.focus();
  } catch (error) { errorBox.textContent = message(error); status.textContent = edited === saved ? "图片上传失败，草稿已保存" : "图片上传失败，修改尚未保存"; }
  finally { uploading = false; element<HTMLInputElement>("cover").readOnly = false; updateButtons(); }
});

element<HTMLButtonElement>("upload-body").addEventListener("click", () => chooseImage("body"));
element<HTMLButtonElement>("upload-cover").addEventListener("click", () => chooseImage("cover"));
document.querySelectorAll<HTMLButtonElement>("[data-format]").forEach(button => button.addEventListener("click", () => {
  const formats: Record<string, [string, string, string]> = { heading: ["\n## ", "\n", "标题"], bold: ["**", "**", "重点"], list: ["\n- ", "\n", "列表项"], quote: ["\n> ", "\n", "引用"], code: ["\n```\n", "\n```\n", "代码"], link: ["[", "](https://example.com)", "链接文字"], math: ["$", "$", "x^2"] };
  insertText(...formats[button.dataset.format!]);
}));
document.querySelectorAll<HTMLButtonElement>(".mobile-tabs button").forEach(button => button.addEventListener("click", () => showView(button.dataset.view!)));
form.addEventListener("input", changed);
form.addEventListener("submit", event => { event.preventDefault(); void saveChanges(); });
saveButton.addEventListener("click", () => { void saveChanges(); });
element<HTMLButtonElement>("new-draft").addEventListener("click", async () => {
  if (!(await guardChanges())) return;
  const draft = createDraft(collection);
  drafts.unshift(draft);
  selectDraft(draft);
  edited++;
  status.textContent = "新草稿，等待保存到私密云端";
  saveTimer = setTimeout(() => { void saveChanges(); }, 900);
});
collectionSelect.addEventListener("change", async () => {
  const next = collectionSelect.value as Collection;
  if (!(await guardChanges())) { collectionSelect.value = collection; return; }
  collection = next;
  current = null;
  edited = saved = 0;
  conflict = false;
  clearTimeout(saveTimer);
  form.hidden = true;
  element("editor-empty").hidden = false;
  element("conflict-actions").hidden = true;
  element("preview").replaceChildren();
  previewGeneration++;
  publishGeneration++;
  deploying = false;
  checkingPublication = false;
  element("deployment-link").hidden = true;
  element("check-publication").hidden = true;
  element("publish-status").textContent = "";
  element("publish-warning").hidden = true;
  element("published-link").hidden = true;
  status.textContent = "选择或新建一篇草稿";
  errorBox.textContent = "";
  await loadDirectory();
});
draftFilter.addEventListener("change", renderDirectory);

deleteButton.addEventListener("click", async () => {
  if (!current || deleting || publishing || deploying || uploading || loading || navigating) return;
  const published = Boolean(current.published_commit || current.published_slug);
  const warning = published ? "已经公开的文章和图片不会被撤下；删除这份私密草稿后，将无法再从工作台编辑该文章。" : "这份私密草稿将永久删除，尚未保存的修改也会丢失。";
  if (!window.confirm(`删除「${String(current.metadata.title || "未命名草稿")}」？\n${warning}\n此操作不可撤销。`)) return;
  deleting = true;
  clearTimeout(saveTimer);
  updateButtons();
  errorBox.textContent = "";
  status.textContent = "正在删除私密草稿…";
  try {
    if (saving) await saving;
    const snapshot = structuredClone(current);
    if (snapshot.revision > 0) await api.deleteDraft(snapshot);
    drafts = drafts.filter(draft => draft.id !== snapshot.id);
    publicationWarnings.delete(snapshot.id);
    current = null;
    edited = saved = 0;
    conflict = false;
    publishGeneration++;
    previewGeneration++;
    clearTimeout(previewTimer);
    form.reset();
    form.hidden = true;
    element("editor-empty").hidden = false;
    element("conflict-actions").hidden = true;
    element("publish-status").textContent = "";
    element("publish-warning").hidden = true;
    element("published-link").hidden = true;
    element("deployment-link").hidden = true;
    element("check-publication").hidden = true;
    element("preview").replaceChildren();
    status.textContent = published ? "私密草稿已删除，公开文章仍保留" : "私密草稿已删除";
    renderDirectory();
  } catch (error) {
    errorBox.textContent = message(error);
    status.textContent = "删除未完成，草稿仍保留";
  } finally { deleting = false; updateButtons(); }
});

element<HTMLButtonElement>("download-draft").addEventListener("click", () => {
  if (!current) return;
  const blob = new Blob([JSON.stringify(current, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${current.slug || "private-draft"}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
element<HTMLButtonElement>("reload-draft").addEventListener("click", async () => {
  if (!current || loading || navigating || uploading || publishing || deleting || !window.confirm("重新载入会替换编辑区的当前修改。确认已经保留需要的文字？")) return;
  const id = current.id;
  await loadDirectory();
  const latest = drafts.find(draft => draft.id === id);
  if (latest) selectDraft(latest);
});

async function pollPublication(commit: string, generation: number, articleUrl: string) {
  deploying = true;
  checkingPublication = true;
  element("check-publication").hidden = false;
  let terminal = false;
  updateButtons();
  try {
  for (let attempt = 0; attempt < 30; attempt++) {
    if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 10_000));
    if (generation !== publishGeneration) return;
    try {
      const result = await api.getPublishStatus(commit);
      if (generation !== publishGeneration) return;
      if (/^https?:\/\//i.test(result.url)) {
        const link = element<HTMLAnchorElement>("deployment-link");
        link.href = result.url;
        link.hidden = false;
      }
      if (result.state === "success") {
        terminal = true;
        element("publish-status").textContent = "该次发布部署成功，公开版本已上线。";
        if (articleUrl && /^https?:\/\//i.test(articleUrl)) {
          const link = element<HTMLAnchorElement>("published-link");
          const freshUrl = new URL(articleUrl);
          freshUrl.searchParams.set("published", commit.slice(0, 12));
          link.href = freshUrl.href;
          link.hidden = false;
        }
        return;
      }
      if (result.state === "failure") { terminal = true; element("publish-status").textContent = "部署失败，私密草稿已保留。请打开部署记录，修复原因后在 GitHub 重新运行该任务；无需重复提交相同内容。"; return; }
      element("publish-status").textContent = "发布提交已创建，网站正在部署。完成后会在这里显示公开页面链接。";
    } catch (error) {
      element("publish-status").textContent = "发布提交已创建，暂时无法读取部署进度，正在重试…";
      if (attempt === 29) { element("publish-status").textContent = `发布提交已创建，但无法确认部署状态：${message(error)}`; return; }
    }
  }
  if (generation === publishGeneration) element("publish-status").textContent = "发布提交已创建，暂时无法确认部署完成。请点击「重新检查进度」或查看部署记录，尚未解除重复发布保护。";
  } finally {
    if (generation === publishGeneration) { deploying = !terminal; checkingPublication = false; updateButtons(); }
  }
}
element<HTMLButtonElement>("check-publication").addEventListener("click", () => {
  if (!current?.published_commit || checkingPublication || publishing || deleting || loading || navigating) return;
  element("publish-status").textContent = "正在重新确认部署进度…";
  void pollPublication(current.published_commit, ++publishGeneration, current.published_url ?? "");
});

publishButton.addEventListener("click", async () => {
  if (!current || publishing || deploying || deleting || conflict || uploading || loading || navigating) return;
  readForm();
  showView("editor");
  element<HTMLDetailsElement>("collection-details").open = true;
  if (!form.reportValidity()) return;
  const links = current.metadata.links as { label: string; url: string }[] | undefined;
  if (links?.some(link => !link.label || !/^https?:\/\//i.test(link.url))) { errorBox.textContent = "请检查相关链接，每行填写：名称 | https://地址。"; showView("editor"); return; }
  if (!window.confirm("发布会把这篇正文、填写的信息及引用图片公开到网站和公开仓库。确认这些内容都可以公开？")) return;
  publishing = true;
  publishGeneration++;
  updateButtons();
  errorBox.textContent = "";
  element("publish-warning").hidden = true;
  element("publish-status").textContent = "正在保存草稿并提交发布…";
  let publishRequested = false;
  const previousCommit = current.published_commit;
  try {
    await saveChanges();
    if (edited !== saved || conflict) throw new Error("草稿尚未保存成功，未提交发布。请先处理保存错误。");
    const unchanged = current.published_commit && (current.published_fingerprint
      ? current.published_fingerprint === await publicationFingerprint(current)
      : current.published_revision === current.revision);
    if (unchanged) {
      element("publish-warning").textContent = "内容未变化，已经提交过这份公开版本，无需重复发布。修改后再更新即可；若部署失败，请在部署记录中重新运行任务。";
      element("publish-warning").hidden = false;
      element("publish-status").textContent = "没有创建重复发布提交，原公开链接保持不变。";
      return;
    }
    element("publish-status").textContent = "正在提交发布…";
    publishRequested = true;
    const result = await api.publishDraft(structuredClone(current));
    if (result.warning) publicationWarnings.set(current.id, result.warning); else publicationWarnings.delete(current.id);
    element("publish-warning").textContent = result.warning ?? (result.duplicate ? "内容未变化，沿用已有发布，没有创建重复文章。" : "");
    element("publish-warning").hidden = !result.warning && !result.duplicate;
    current = { ...current, published_commit: result.commit, published_url: result.url, published_slug: current.slug, published_collection: current.collection, published_revision: current.revision, published_fingerprint: result.fingerprint };
    const listed = drafts.find(draft => draft.id === current?.id);
    if (listed) { listed.published_commit = result.commit; listed.published_url = result.url; listed.published_slug = current.slug; listed.published_collection = current.collection; listed.published_revision = current.revision; listed.published_fingerprint = result.fingerprint; }
    updateSlugLock();
    element("publish-status").textContent = "发布提交已创建，等待网站部署。尚未确认上线。";
    element("published-link").hidden = true;
    renderDirectory();
    void pollPublication(result.commit, ++publishGeneration, result.url);
  } catch (error) {
    errorBox.textContent = message(error);
    element("publish-status").textContent = publishRequested ? "发布状态未确认，请查看部署记录；私密草稿已保留。" : "未提交发布，请先处理保存错误；私密草稿已保留。";
    if (publishRequested && current) {
      try {
        const latest = (await api.listDrafts(current.collection)).find(draft => draft.id === current?.id);
        if (latest) {
          // A publication reservation can succeed before the response fails.
          // Refresh publication bookkeeping only, keeping body, metadata and
          // revision intact so a peer's newer revision still causes a conflict.
          mergePublicationFields(latest);
          const index = drafts.findIndex(draft => draft.id === latest.id);
          if (index >= 0) drafts[index] = { ...drafts[index], published_commit: latest.published_commit, published_url: latest.published_url, published_slug: latest.published_slug, published_collection: latest.published_collection, published_at: latest.published_at, published_revision: latest.published_revision, published_fingerprint: latest.published_fingerprint };
          renderDirectory();
          if (latest.published_commit && latest.published_commit !== previousCommit) void pollPublication(latest.published_commit, ++publishGeneration, latest.published_url ?? "");
        }
      } catch { /* The original error stays visible and the local draft remains. */ }
      const warning = publicationWarnings.get(current.id);
      element("publish-warning").textContent = warning ?? "";
      element("publish-warning").hidden = !warning;
    }
  }
  finally { publishing = false; updateButtons(); }
});

async function enterWorkspace() {
  element("login-panel").hidden = true;
  element("workspace").hidden = false;
  element("sign-out").hidden = false;
  element<HTMLInputElement>("password").value = "";
  await loadDirectory();
  collectionSelect.focus();
}
element<HTMLFormElement>("login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const loginForm = event.currentTarget as HTMLFormElement;
  const button = loginForm.querySelector<HTMLButtonElement>("button")!;
  const loginError = element("login-error");
  loginError.textContent = "";
  button.disabled = true;
  button.textContent = "正在登录…";
  loginForm.setAttribute("aria-busy", "true");
  try {
    await api.signIn(element<HTMLInputElement>("account").value.trim(), element<HTMLInputElement>("password").value, element<HTMLInputElement>("remember").checked);
    await enterWorkspace();
  } catch (error) { loginError.textContent = message(error); element<HTMLInputElement>("password").value = ""; element<HTMLInputElement>("password").focus(); }
  finally { button.disabled = false; button.textContent = "登录工作台"; loginForm.setAttribute("aria-busy", "false"); }
});
element<HTMLButtonElement>("sign-out").addEventListener("click", async () => {
  if (!(await guardChanges())) return;
  try {
    await api.signOut();
    current = null;
    drafts = [];
    saved = edited = 0;
    conflict = false;
    deploying = false;
    checkingPublication = false;
    element("deployment-link").hidden = true;
    element("check-publication").hidden = true;
    errorBox.textContent = "";
    status.textContent = "选择或新建一篇草稿";
    element("editor-empty").hidden = false;
    element("conflict-actions").hidden = true;
    element("publish-status").textContent = "";
    element("publish-warning").hidden = true;
    element("published-link").hidden = true;
    assetCache.clear();
    publicationWarnings.clear();
    previewGeneration++;
    publishGeneration++;
    clearTimeout(saveTimer);
    clearTimeout(previewTimer);
    form.reset();
    form.hidden = true;
    element("draft-list").replaceChildren();
    element("preview").replaceChildren();
    element("workspace").hidden = true;
    element("sign-out").hidden = true;
    element("login-panel").hidden = false;
    element<HTMLInputElement>("account").focus();
  } catch (error) { errorBox.textContent = message(error); }
});
window.addEventListener("beforeunload", event => {
  if (edited !== saved || uploading || publishing || deleting) event.preventDefault();
});

if (api.configured) {
  const loginForm = element<HTMLFormElement>("login-form");
  const button = loginForm.querySelector<HTMLButtonElement>("button")!;
  button.disabled = true;
  button.textContent = "正在检查登录状态…";
  void api.restoreSession().then(async restored => { if (restored) await enterWorkspace(); }).catch(error => { element("login-error").textContent = message(error); }).finally(() => { button.disabled = false; button.textContent = "登录工作台"; });
}
