import { animate } from "motion";

export function initWorkbenchChrome(root: HTMLElement) {
  const workspace = document.getElementById("workspace")!;
  const slot = document.querySelector<HTMLElement>(".workspace-controls-slot")!;
  const controls = slot.querySelector<HTMLElement>(".workspace-controls")!;
  const header = document.querySelector<HTMLElement>(".workbench-header")!;
  const heading = controls.querySelector<HTMLElement>("h1")!;
  const details = document.getElementById("workspace-details")!;
  const more = document.getElementById("workbench-more")!;
  const deletion = document.getElementById("delete-draft")!;
  const publication = document.getElementById("publish-status")!;
  const compactPublication = document.getElementById("compact-publication")!;
  let compact = false;
  let expanded = false;
  let fullHeight = 0;
  let frame = 0;
  let animation: ReturnType<typeof animate> | undefined;

  const update = () => {
    frame = 0;
    if (!root.isConnected) return;
    // Measure the unchanged flow slot, never the shrinking floating toolbar.
    if (!compact) fullHeight = controls.offsetHeight;
    const boundary = slot.getBoundingClientRect().top + scrollY + fullHeight - 88;
    const next = !workspace.hidden && (compact ? scrollY > boundary - 24 : scrollY > boundary + 12);
    const changed = next !== compact;
    compact = next;
    if (!compact) expanded = false;
    const focused = document.activeElement;
    let focusedSecondary = header.contains(focused) || details.contains(focused) || focused === deletion;
    if (compact && !expanded && focusedSecondary && !(focused instanceof Element && focused.matches(":focus-visible"))) {
      more.hidden = false;
      more.focus({ preventScroll: true });
      focusedSecondary = false;
    }
    const open = compact && (expanded || focusedSecondary);
    const publicationState = publication.textContent ? publication.dataset.state ?? "" : "";
    const attention = Boolean(document.getElementById("workbench-error")!.textContent) ||
      !document.getElementById("conflict-actions")!.hidden || !document.getElementById("publish-warning")!.hidden ||
      publicationState === "failure" || publicationState === "unknown";
    controls.dataset.compact = String(compact);
    controls.dataset.expanded = String(open);
    controls.dataset.attention = String(attention);
    header.hidden = compact && !open;
    heading.hidden = compact && !open;
    deletion.hidden = compact && !open;
    details.hidden = compact && !open && !attention;
    more.hidden = !compact;
    more.setAttribute("aria-expanded", String(open));
    const label = open ? "收起" : "更多";
    if (more.textContent !== label) more.textContent = label;
    const withdrawal = publication.dataset.operation === "unpublish";
    const publicationLabel = ({ success: withdrawal ? "公开文章已撤下" : "公开版本已上线", pending: "网站部署中", failure: "部署失败", unknown: "部署待确认" } as Record<string, string>)[publicationState] ?? "";
    compactPublication.hidden = !compact || open || !publicationLabel;
    if (compactPublication.textContent !== publicationLabel) compactPublication.textContent = publicationLabel;
    if (!compact) {
      fullHeight = controls.offsetHeight;
      const height = `${fullHeight}px`;
      if (slot.style.minHeight !== height) slot.style.minHeight = height;
      if (focused === more) heading.focus({ preventScroll: true });
    }
    if (compact) {
      const available = `${Math.max(56, (window.visualViewport?.height ?? innerHeight) - controls.getBoundingClientRect().top - 16)}px`;
      if (controls.style.getPropertyValue("--chrome-available-height") !== available) controls.style.setProperty("--chrome-available-height", available);
    }
    const offset = `${Math.ceil(Math.max(controls.getBoundingClientRect().bottom, header.hidden ? 0 : header.getBoundingClientRect().bottom) + 16)}px`;
    if (root.style.getPropertyValue("--workspace-offset") !== offset) root.style.setProperty("--workspace-offset", offset);
    if (changed) {
      const bar = controls.querySelector<HTMLElement>(".workspace-bar")!;
      if (window.matchMedia?.("(prefers-reduced-motion: no-preference)").matches) {
        const moving = bar.getAnimations().some(item => item.playState === "running");
        const style = moving ? getComputedStyle(bar) : null;
        animation?.stop();
        animation = animate(bar, { opacity: [style ? Number(style.opacity) : .8, 1], transform: [style?.transform ?? "translateY(-3px)", "translateY(0px)"] }, { duration: .18, ease: [.22, 1, .36, 1] });
      } else {
        animation?.stop();
        bar.style.opacity = "";
        bar.style.transform = "";
      }
    }
  };
  const requestUpdate = () => { if (!frame) frame = requestAnimationFrame(update); };
  more.addEventListener("click", () => {
    expanded = more.getAttribute("aria-expanded") !== "true";
    // Keep focus on the disclosure, so collapsing cannot hide an active link.
    more.focus({ preventScroll: true });
    update();
  });
  document.addEventListener("keydown", event => {
    if (event.key !== "Escape" || !compact || more.getAttribute("aria-expanded") !== "true") return;
    expanded = false;
    more.focus({ preventScroll: true });
    update();
  });
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });
  window.addEventListener("pageshow", requestUpdate);
  document.addEventListener("focusin", requestUpdate);
  document.addEventListener("focusout", requestUpdate);
  window.visualViewport?.addEventListener("resize", requestUpdate, { passive: true });
  if (typeof ResizeObserver !== "undefined") {
    const sizes = new ResizeObserver(requestUpdate);
    sizes.observe(controls);
    sizes.observe(header);
  }
  const state = new MutationObserver(requestUpdate);
  state.observe(workspace, { attributes: true, attributeFilter: ["hidden"] });
  for (const id of ["publish-status", "publish-warning", "workbench-error", "conflict-actions"]) {
    state.observe(document.getElementById(id)!, { childList: true, subtree: true, attributes: true, attributeFilter: ["hidden", "data-state"] });
  }
  requestUpdate();
}
