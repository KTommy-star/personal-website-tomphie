import { matchingEntry } from "./public-content";

function bindSearch(root: HTMLElement) {
  const search = root.querySelector<HTMLInputElement>("[data-content-search]");
  const filter = root.querySelector<HTMLSelectElement>("[data-content-filter]");
  if (!search || !filter) return;
  const records = [...root.querySelectorAll<HTMLElement>("[data-content-record]")];
  const update = () => {
    let count = 0;
    for (const record of records) {
      record.hidden = !matchingEntry(record.dataset.search ?? "", search.value, filter.value, record.dataset.topic ?? "");
      if (!record.hidden) count++;
    }
    const total = root.querySelector("[data-content-count]"); if (total) total.textContent = `${count} 篇公开记录`;
    const empty = root.querySelector<HTMLElement>("[data-content-no-results]"); if (empty) empty.hidden = count !== 0;
  };
  search.addEventListener("input", update); filter.addEventListener("change", update);
}

export async function initContentLibrary(root: HTMLElement): Promise<void> {
  bindSearch(root);
  let refreshing = false;
  const refresh = async () => {
    if (refreshing) return;
    refreshing = true;
    const button = root.querySelector<HTMLButtonElement>("[data-content-refresh]");
    const status = root.querySelector<HTMLElement>("[data-content-refresh-status]");
    if (button) button.disabled = true;
    if (status) status.textContent = "正在读取最新公开内容…";
    try {
      const url = new URL(window.location.href);
      url.hash = ""; url.searchParams.set("_content", String(Date.now()));
      const response = await fetch(url.href, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("无法刷新");
      const fresh = new DOMParser().parseFromString(await response.text(), "text/html").querySelector<HTMLElement>("[data-content-library]");
      if (!fresh) throw new Error("列表暂未更新");
      if (fresh.dataset.contentVersion !== root.dataset.contentVersion) {
        const search = root.querySelector<HTMLInputElement>("[data-content-search]")?.value ?? "";
        const filter = root.querySelector<HTMLSelectElement>("[data-content-filter]")?.value ?? "";
        root.replaceChildren(...fresh.childNodes);
        root.dataset.contentVersion = fresh.dataset.contentVersion;
        const nextSearch = root.querySelector<HTMLInputElement>("[data-content-search]");
        const nextFilter = root.querySelector<HTMLSelectElement>("[data-content-filter]");
        if (nextSearch) nextSearch.value = search;
        if (nextFilter) nextFilter.value = filter;
        bindSearch(root); nextSearch?.dispatchEvent(new Event("input"));
      }
      const state = root.querySelector<HTMLElement>("[data-content-refresh-status]");
      if (state) state.textContent = "已显示最新公开内容";
    } catch {
      if (status) status.textContent = "刷新暂时失败，当前内容仍可阅读；点击刷新重试";
    } finally {
      refreshing = false;
      const nextButton = root.querySelector<HTMLButtonElement>("[data-content-refresh]");
      if (nextButton) nextButton.disabled = false;
    }
  };
  root.addEventListener("click", event => {
    if ((event.target as Element).closest("[data-content-refresh]")) void refresh();
  });
  window.addEventListener("pageshow", event => { if (event.persisted) void refresh(); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") void refresh(); });
  await refresh();
}
