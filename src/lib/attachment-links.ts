import { getAssetType, isPrivateAssetReference } from "../../supabase/functions/_shared/assets";

export function attachmentInfo(reference: string, name: string) {
  const type = getAssetType(reference);
  if (!type) return;
  if (!isPrivateAssetReference(reference)) {
    try {
      const url = new URL(reference, document.baseURI);
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || !url.pathname.includes("/uploads/")) return;
    } catch { return; }
  }
  return { ...type, reference, name: name.trim().slice(0, 240) || `附件.${type.extension}` };
}

export function attachmentMarkdown(name: string, reference: string) {
  if (!isPrivateAssetReference(reference)) throw new Error("附件引用无效");
  return `[${name.replace(/[\\[\]]/g, "\\$&").replace(/[\r\n]/g, " ")}](${reference})`;
}

export function decorateAttachmentLinks(container: HTMLElement) {
  for (const link of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (link.classList.contains("attachment-card")) continue;
    const reference = link.dataset.attachmentReference || link.getAttribute("href")!;
    const info = attachmentInfo(reference, link.textContent ?? "");
    if (!info) continue;
    link.classList.add("attachment-card");
    link.dataset.attachmentReference = reference;
    link.setAttribute("aria-label", `预览 ${info.name}，也可打开原文件`);
    const icon = document.createElement("span");
    icon.className = "attachment-kind";
    icon.textContent = info.extension.toUpperCase();
    const name = document.createElement("span");
    name.className = "attachment-name";
    name.textContent = info.name;
    const action = document.createElement("span");
    action.className = "attachment-action";
    action.textContent = info.kind === "video" ? "播放 ↗" : "预览 ↗";
    link.replaceChildren(icon, name, action);
  }
}
