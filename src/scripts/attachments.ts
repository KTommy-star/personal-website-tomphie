import { attachmentInfo, decorateAttachmentLinks } from "../lib/attachment-links";
import { isPrivateAssetReference } from "../../supabase/functions/_shared/assets";

export function initAttachmentLinks(container: HTMLElement, resolveAsset?: (reference: string) => Promise<string>) {
  decorateAttachmentLinks(container);
  container.addEventListener("click", async event => {
    const link = (event.target as Element).closest<HTMLAnchorElement>("a.attachment-card");
    if (!link || !container.contains(link) || event instanceof MouseEvent && (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    const info = attachmentInfo(link.dataset.attachmentReference ?? "", link.querySelector(".attachment-name")?.textContent ?? "");
    if (!info || link.getAttribute("aria-busy") === "true") return;
    event.preventDefault();
    link.setAttribute("aria-busy", "true");
    try {
      // Heavy document engines are absent from normal navigation and typing.
      const { openAttachment } = await import("../lib/attachment-viewer");
      await openAttachment(info, async () => {
        if (isPrivateAssetReference(info.reference)) {
          if (!resolveAsset) throw new Error("请登录工作台后再查看私密附件");
          return resolveAsset(info.reference);
        }
        return new URL(info.reference, document.baseURI).href;
      }, link);
    } catch {
      const note = document.createElement("span");
      note.className = "attachment-error quiet";
      note.setAttribute("role", "status");
      note.textContent = "预览组件暂时无法加载，可长按附件打开原文件";
      if (link.nextElementSibling?.classList.contains("attachment-error")) link.nextElementSibling.remove();
      link.after(note);
    } finally { link.removeAttribute("aria-busy"); }
  });
}

const article = document.querySelector<HTMLElement>(".article-prose");
if (article) initAttachmentLinks(article);
