import DOMPurify from "dompurify";
import { Marked } from "marked";
import markedKatex from "marked-katex-extension";

const privateAsset = /^asset:\/\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\/[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}\.(?:webp|png|jpg)$/i;
const escapeAttribute = (value: string) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const markdown = new Marked(markedKatex({ throwOnError: false, trust: false, maxExpand: 1000, maxSize: 20 }), {
  gfm: true,
  renderer: {
    // Authored raw HTML is excluded; Markdown and generated math supply all markup.
    html() { return ""; },
    image({ href, text, title }) {
      const source = privateAsset.test(href) ? `data-private-asset="${escapeAttribute(href)}"` : `src="${escapeAttribute(href)}"`;
      return `<img ${source} alt="${escapeAttribute(text)}"${title ? ` title="${escapeAttribute(title)}"` : ""} loading="lazy">`;
    },
  },
});
const sanitizeOptions = {
  FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "svg", "video", "audio", "link", "meta"],
  ALLOW_DATA_ATTR: false,
  ADD_ATTR: ["data-private-asset", "target"],
  ADD_URI_SAFE_ATTR: ["data-private-asset"],
};

function safeURL(value: string, image = false) {
  try {
    const url = new URL(value, document.baseURI);
    return ["https:", "http:", ...(image ? [] : ["mailto:"])].includes(url.protocol);
  } catch { return false; }
}

export async function renderWorkbenchPreview(source: string, resolveAsset?: (reference: string) => Promise<string>): Promise<string> {
  const root = document.createElement("div");
  root.innerHTML = DOMPurify.sanitize(await markdown.parse(source), sanitizeOptions);
  for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (!safeURL(link.getAttribute("href")!)) link.removeAttribute("href");
    else { link.target = "_blank"; link.rel = "noopener noreferrer"; }
  }
  await Promise.all(Array.from(root.querySelectorAll<HTMLImageElement>("img")).map(async image => {
    const reference = image.getAttribute("data-private-asset");
    image.removeAttribute("data-private-asset");
    if (!reference) {
      if (!safeURL(image.getAttribute("src") ?? "", true)) image.removeAttribute("src");
      return;
    }
    try {
      if (!resolveAsset || !privateAsset.test(reference)) throw new Error("Private image unavailable");
      const url = await resolveAsset(reference);
      if (!/^https:\/\//i.test(url) || !safeURL(url, true)) throw new Error("Unsafe preview URL");
      image.src = url;
    } catch {
      image.removeAttribute("src");
      image.title = "私密图片暂时无法预览，请检查连接后重试。";
      const note = document.createElement("span");
      note.className = "quiet";
      note.textContent = `（图片暂时无法预览：${image.alt || "私密图片"}）`;
      image.after(note);
    }
  }));
  return DOMPurify.sanitize(root.innerHTML, sanitizeOptions);
}
