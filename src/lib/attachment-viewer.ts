import DOMPurify from "dompurify";
import type { attachmentInfo } from "./attachment-links";
import { validateAssetBytes } from "../../supabase/functions/_shared/assets";
import { verifyOfficeExpansion } from "./office-expansion";

type Attachment = NonNullable<ReturnType<typeof attachmentInfo>>;
let closeCurrent: (() => void) | undefined;

async function fetchBounded(url: string, maxBytes: number, signal: AbortSignal) {
  const response = await fetch(url, { signal, credentials: "omit", referrerPolicy: "no-referrer" });
  if (!response.ok) throw new Error("附件暂时无法读取，请重新打开或检查连接");
  if (Number(response.headers.get("content-length")) > maxBytes) throw new Error("附件超出预览大小限制");
  const reader = response.body?.getReader();
  if (!reader) throw new Error("此浏览器不支持文件流，请打开原文件");
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.length;
      if (length > maxBytes) throw new Error("附件超出预览大小限制");
      chunks.push(part.value);
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}

export async function openAttachment(info: Attachment, resolveUrl: () => Promise<string>, trigger: HTMLElement) {
  closeCurrent?.();
  const abort = new AbortController();
  const releases: (() => void)[] = [];
  const dialog = document.createElement("dialog");
  dialog.className = "attachment-dialog";
  dialog.setAttribute("aria-labelledby", "attachment-title");
  dialog.innerHTML = '<header class="attachment-header"><h2 id="attachment-title"></h2><a data-open target="_blank" rel="noopener noreferrer" hidden>打开原文件 ↗</a><a data-download hidden>下载</a><button type="button" aria-label="关闭附件预览">关闭</button></header><p class="attachment-progress" role="status">正在读取附件…</p><div class="attachment-controls" hidden></div><div class="attachment-content"></div>';
  dialog.querySelector("h2")!.textContent = info.name;
  const content = dialog.querySelector<HTMLElement>(".attachment-content")!;
  const progress = dialog.querySelector<HTMLElement>(".attachment-progress")!;
  const controls = dialog.querySelector<HTMLElement>(".attachment-controls")!;
  const originalOverflow = document.documentElement.style.overflow;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    abort.abort();
    releases.forEach(release => release());
    document.documentElement.style.overflow = originalOverflow;
    dialog.remove();
    if (closeCurrent === close) closeCurrent = undefined;
    if (trigger.isConnected) trigger.focus({ preventScroll: true });
  };
  // Native close events are queued: clean up synchronously before opening
  // another file so the previous dialog cannot unlock the new one's scroll.
  const close = () => { if (dialog.open) dialog.close(); cleanup(); };
  closeCurrent = close;
  dialog.addEventListener("close", cleanup, { once: true });
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  dialog.querySelector("button")!.addEventListener("click", close);
  document.body.append(dialog);
  dialog.showModal();
  document.documentElement.style.overflow = "hidden";

  async function pages(count: number, draw: (index: number, canvas: HTMLCanvasElement) => Promise<void>, unit = "页") {
    if (!count || count > 2000) throw new Error("文件页数超出在线预览范围，请打开原文件");
    controls.hidden = false;
    const previous = document.createElement("button"); previous.type = "button"; previous.textContent = `上一${unit}`;
    const next = document.createElement("button"); next.type = "button"; next.textContent = `下一${unit}`;
    const position = document.createElement("span"); position.setAttribute("aria-live", "polite");
    const canvas = document.createElement("canvas"); canvas.setAttribute("role", "img");
    controls.replaceChildren(previous, position, next);
    content.replaceChildren(canvas);
    let index = 0;
    const render = async () => {
      previous.disabled = next.disabled = true;
      try {
        await draw(index, canvas);
        if (abort.signal.aborted) return;
        canvas.setAttribute("aria-label", `${info.name}，第 ${index + 1} ${unit}，共 ${count} ${unit}`);
        position.textContent = `${index + 1} / ${count}`;
        content.scrollTop = 0;
      } catch (error) {
        if (!abort.signal.aborted) progress.textContent = error instanceof Error ? error.message : "此页无法预览，可打开原文件";
      } finally { previous.disabled = index === 0; next.disabled = index === count - 1; }
    };
    previous.addEventListener("click", () => { index--; void render(); });
    next.addEventListener("click", () => { index++; void render(); });
    await render();
  }

  try {
    const url = new URL(await resolveUrl(), document.baseURI);
    abort.signal.throwIfAborted();
    if (url.protocol !== "https:" && !(url.protocol === "http:" && url.origin === location.origin)) throw new Error("附件预览地址不安全");
    const open = dialog.querySelector<HTMLAnchorElement>("[data-open]")!;
    open.href = url.href; open.hidden = false;
    const download = dialog.querySelector<HTMLAnchorElement>("[data-download]")!;
    const downloadUrl = new URL(url);
    // Cross-origin signed Storage URLs need Content-Disposition from the server;
    // the anchor's download attribute alone is ignored by mobile browsers.
    if (info.reference.startsWith("asset://")) downloadUrl.searchParams.set("download", info.name);
    download.href = downloadUrl.href; download.download = info.name; download.hidden = false;
    if (info.kind === "video") {
      const video = document.createElement("video");
      video.controls = true; video.playsInline = true; video.preload = "metadata"; video.src = url.href;
      video.addEventListener("error", () => { progress.textContent = "此视频编码不受当前浏览器支持，请打开或下载原文件"; });
      releases.push(() => { video.pause(); video.removeAttribute("src"); video.load(); });
      content.append(video);
      progress.textContent = "视频按需播放；不会自动下载或播放整段视频";
      return;
    }
    if (info.kind === "image") {
      const image = document.createElement("img"); image.src = url.href; image.alt = info.name;
      content.append(image); progress.textContent = "原图预览"; return;
    }
    if (["doc", "ppt"].includes(info.extension)) {
      progress.textContent = "旧版 Office 文件已保存，可打开原文件；另存为 DOCX / PPTX 后可在线预览";
      return;
    }
    progress.textContent = "正在准备预览，首次打开会加载对应文档组件…";
    const bytes = await fetchBounded(url.href, info.maxBytes, abort.signal);
    validateAssetBytes(bytes, info.reference);
    if (["docx", "xlsx", "pptx"].includes(info.extension)) await verifyOfficeExpansion(bytes, abort.signal);
    abort.signal.throwIfAborted();
    if (info.extension === "pdf") {
      const [pdf, { default: workerUrl }] = await Promise.all([import("pdfjs-dist"), import("pdfjs-dist/build/pdf.worker.min.mjs?url")]);
      abort.signal.throwIfAborted();
      pdf.GlobalWorkerOptions.workerSrc = workerUrl;
      const task = pdf.getDocument({ data: bytes, enableXfa: false, useSystemFonts: true });
      releases.push(() => { void task.destroy().catch(() => {}); });
      const file = await task.promise;
      abort.signal.throwIfAborted();
      progress.textContent = "PDF 分页预览；可随时打开原文件阅读或打印";
      await pages(file.numPages, async (index, canvas) => {
        const page = await file.getPage(index + 1);
        const original = page.getViewport({ scale: 1 });
        const width = Math.min(1440, Math.max(640, content.clientWidth * Math.min(devicePixelRatio, 2)));
        const viewport = page.getViewport({ scale: Math.min(width / original.width, Math.sqrt(4_000_000 / (original.width * original.height))) });
        canvas.width = Math.ceil(viewport.width); canvas.height = Math.ceil(viewport.height);
        const rendering = page.render({ canvas, viewport });
        const cancel = () => rendering.cancel();
        abort.signal.addEventListener("abort", cancel, { once: true });
        try { await rendering.promise; } finally { abort.signal.removeEventListener("abort", cancel); page.cleanup(); }
      });
    } else if (info.extension === "docx") {
      const docx = await import("docx-preview");
      abort.signal.throwIfAborted();
      const body = document.createElement("div");
      const styles = document.createElement("div");
      await docx.renderAsync(bytes, body, styles, { useBase64URL: true, ignoreFonts: true, ignoreWidth: true, ignoreHeight: true, renderAltChunks: false, renderComments: false });
      abort.signal.throwIfAborted();
      if (body.innerHTML.length > 4_000_000) throw new Error("此 Word 文档内容较多，请打开原文件阅读");
      const frame = document.createElement("iframe");
      frame.title = `${info.name} 的 Word 预览`; frame.setAttribute("sandbox", "");
      const html = DOMPurify.sanitize(body.innerHTML, { FORBID_TAGS: ["script", "iframe", "object", "embed", "style", "link", "form", "svg"] });
      const css = Array.from(styles.querySelectorAll("style"), style => style.textContent).join("\n").replace(/<\/style/gi, "<\\/style");
      frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>body{margin:0;line-height:1.65;color:#222;background:white}img{max-width:100%}table{max-width:100%}${css}</style></head><body>${html}</body></html>`;
      content.append(frame);
      progress.textContent = "Word 网页预览；复杂排版以原文件为准";
    } else if (info.extension === "pptx") {
      const { PptxRenderer } = await import("pptx-browser");
      abort.signal.throwIfAborted();
      const renderer = new PptxRenderer();
      releases.push(() => renderer.destroy());
      await renderer.load(bytes);
      if (abort.signal.aborted) { renderer.destroy(); return; }
      const ratio = renderer.slideSize.cy / renderer.slideSize.cx;
      if (!Number.isFinite(ratio) || ratio < .1 || ratio > 10) throw new Error("幻灯片尺寸超出安全预览范围");
      progress.textContent = "幻灯片分页预览；复杂图表、字体与动画以原文件为准";
      await pages(renderer.slideCount, async (index, canvas) => {
        await renderer.renderSlide(index, canvas, Math.min(1440, Math.sqrt(4_000_000 / ratio), Math.max(640, content.clientWidth * Math.min(devicePixelRatio, 2))));
        if (abort.signal.aborted) renderer.destroy();
      }, "张");
    } else {
      const sheet = await import("xlsx");
      abort.signal.throwIfAborted();
      const workbook = sheet.read(bytes, { type: "array", cellFormula: false, cellHTML: false, bookVBA: false, sheetRows: 2000, dense: true });
      if (!workbook.SheetNames.length || workbook.SheetNames.length > 100) throw new Error("工作表数量超出预览范围，请打开原文件");
      const picker = document.createElement("select"); picker.setAttribute("aria-label", "选择工作表");
      for (const name of workbook.SheetNames) { const option = document.createElement("option"); option.value = name; option.textContent = name; picker.append(option); }
      const previous = document.createElement("button"); previous.type = "button"; previous.textContent = "上一页";
      const next = document.createElement("button"); next.type = "button"; next.textContent = "下一页";
      const position = document.createElement("span"); position.setAttribute("aria-live", "polite");
      controls.replaceChildren(picker, previous, position, next); controls.hidden = false;
      let offset = 0;
      const render = () => {
        const worksheet = workbook.Sheets[picker.value];
        const range = sheet.utils.decode_range(worksheet["!ref"] ?? "A1");
        const first = range.s.r + offset;
        const last = Math.min(range.e.r, first + 199);
        const table = document.createElement("table");
        const header = document.createElement("tr");
        const corner = document.createElement("th"); corner.textContent = "行"; header.append(corner);
        for (let col = range.s.c; col <= Math.min(range.e.c, range.s.c + 49); col++) { const cell = document.createElement("th"); cell.scope = "col"; cell.textContent = sheet.utils.encode_col(col); header.append(cell); }
        table.append(header);
        for (let row = first; row <= last; row++) {
          const tr = document.createElement("tr");
          const label = document.createElement("th"); label.scope = "row"; label.textContent = String(row + 1); tr.append(label);
          for (let col = range.s.c; col <= Math.min(range.e.c, range.s.c + 49); col++) {
            const td = document.createElement("td");
            const value = worksheet["!data"]?.[row]?.[col];
            td.textContent = value ? sheet.utils.format_cell(value) : "";
            tr.append(td);
          }
          table.append(tr);
        }
        content.replaceChildren(table); content.scrollTop = 0;
        previous.disabled = offset === 0; next.disabled = last >= range.e.r;
        position.textContent = `${first + 1}–${last + 1} 行`;
      };
      picker.addEventListener("change", () => { offset = 0; render(); });
      previous.addEventListener("click", () => { offset -= 200; render(); });
      next.addEventListener("click", () => { offset += 200; render(); });
      render();
      progress.textContent = "工作表预览（最多2000行、50列），公式只显示已有结果，不运行宏；完整数据可下载查看";
    }
  } catch (error) {
    if (!abort.signal.aborted) {
      progress.textContent = error instanceof Error ? `预览未完成：${error.message}。可打开原文件。` : "此文件暂时无法预览，可打开原文件";
    }
  }
}
