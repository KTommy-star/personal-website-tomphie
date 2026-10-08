import { buildMarkdownEdit, editorCommands, findSlashCommand, searchEditorCommands, type EditorCommand, type MarkdownEdit, type SlashCommand } from "../lib/editor-commands";

interface MarkdownEditorOptions {
  textarea: HTMLTextAreaElement;
  toolbar: HTMLElement;
  onImage: () => void;
  onAttachment: (kind: "file" | "video") => void;
}

let editorCount = 0;

export function initMarkdownEditor({ textarea, toolbar, onImage, onAttachment }: MarkdownEditorOptions) {
  const id = `editor-commands-${++editorCount}`;
  const controller = new window.AbortController();
  const signal = controller.signal;
  const popup = document.createElement("div");
  popup.className = "editor-command-menu";
  popup.hidden = true;
  const header = document.createElement("div");
  header.className = "editor-command-header";
  const search = document.createElement("input");
  search.className = "editor-command-search";
  search.type = "search";
  search.placeholder = "搜索格式或内容…";
  search.setAttribute("aria-label", "搜索插入命令");
  search.setAttribute("role", "combobox");
  search.setAttribute("aria-autocomplete", "list");
  search.setAttribute("aria-expanded", "false");
  const title = document.createElement("span");
  title.textContent = "插入内容";
  const list = document.createElement("div");
  list.id = id;
  list.className = "editor-command-list";
  list.setAttribute("role", "listbox");
  list.setAttribute("aria-label", "格式与插入命令");
  const footer = document.createElement("div");
  footer.className = "editor-command-footer";
  footer.textContent = "↑ ↓ 选择　Enter 插入　Esc 关闭";
  popup.append(header, list, footer);
  document.body.append(popup);
  const status = document.createElement("p");
  status.className = "editor-command-status";
  status.setAttribute("role", "status");
  toolbar.after(status);

  let mode: "slash" | "toolbar" | null = null;
  let slash: SlashCommand | null = null;
  let results: EditorCommand[] = [];
  let active = 0;
  let composing = false;
  let selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  let mirror: HTMLDivElement | undefined;
  let frame = 0;

  function rememberSelection() { selection = { start: textarea.selectionStart, end: textarea.selectionEnd }; }
  function owner() { return mode === "toolbar" ? search : textarea; }
  function close() {
    popup.hidden = true;
    for (const field of [textarea, search]) {
      field.removeAttribute("aria-expanded");
      field.removeAttribute("aria-activedescendant");
      field.removeAttribute("aria-controls");
      field.removeAttribute("aria-haspopup");
    }
    search.setAttribute("aria-expanded", "false");
    more.setAttribute("aria-expanded", "false");
    mirror?.remove(); mirror = undefined;
    mode = null; slash = null;
  }
  function focusActive() {
    list.querySelectorAll<HTMLElement>('[role="option"]').forEach((option, index) => option.setAttribute("aria-selected", String(index === active)));
    const option = list.querySelector<HTMLElement>('[aria-selected="true"]');
    if (option) {
      owner().setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView?.({ block: "nearest" });
    } else owner().removeAttribute("aria-activedescendant");
  }
  function render(query: string) {
    results = searchEditorCommands(query);
    active = 0;
    list.replaceChildren();
    let group = "";
    results.forEach(command => {
      if (group !== command.group) {
        group = command.group;
        const label = document.createElement("div");
        label.className = "editor-command-group";
        label.setAttribute("role", "presentation");
        label.textContent = group;
        list.append(label);
      }
      const option = document.createElement("div");
      option.id = `${id}-${command.id}`;
      option.className = "editor-command-option";
      option.setAttribute("role", "option");
      option.dataset.editorCommand = command.id;
      const icon = document.createElement("span");
      icon.className = "editor-command-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = command.icon;
      const text = document.createElement("span");
      const label = document.createElement("span");
      label.className = "editor-command-label";
      label.textContent = command.label;
      const detail = document.createElement("small");
      detail.textContent = command.description;
      text.append(label, detail); option.append(icon, text);
      list.append(option);
    });
    if (!results.length) {
      const empty = document.createElement("p");
      empty.className = "editor-command-empty";
      empty.textContent = "没有匹配的命令，试试“标题”或“公式”。";
      list.append(empty);
    }
    focusActive(); position();
  }
  function caretRect() {
    const rect = textarea.getBoundingClientRect();
    if (!mirror) {
      mirror = document.createElement("div");
      mirror.className = "editor-caret-mirror";
      mirror.setAttribute("aria-hidden", "true");
      document.body.append(mirror);
    }
    const computed = getComputedStyle(textarea);
    for (const key of ["boxSizing", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing", "wordSpacing", "textIndent", "textAlign", "direction", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "tabSize"] as const) mirror.style[key] = computed[key];
    mirror.style.left = `${rect.left}px`; mirror.style.top = `${rect.top}px`;
    const scrollbar = textarea.offsetWidth - textarea.clientWidth - parseFloat(computed.borderLeftWidth) - parseFloat(computed.borderRightWidth);
    mirror.style.width = `${rect.width - Math.max(0, scrollbar)}px`; mirror.style.height = `${rect.height}px`;
    const caret = document.createElement("span"); caret.textContent = "\u200b";
    mirror.replaceChildren(document.createTextNode(textarea.value.slice(0, textarea.selectionStart)), caret);
    mirror.scrollTop = textarea.scrollTop; mirror.scrollLeft = textarea.scrollLeft;
    const point = caret.getBoundingClientRect();
    return { left: Math.max(rect.left, Math.min(point.left, rect.right)), top: Math.max(rect.top, Math.min(point.top, rect.bottom)), bottom: Math.max(rect.top, Math.min(point.bottom, rect.bottom)) };
  }
  function position() {
    if (!mode || popup.hidden) return;
    const viewport = window.visualViewport;
    const leftEdge = (viewport?.offsetLeft ?? 0) + 8;
    const topEdge = (viewport?.offsetTop ?? 0) + 8;
    const rightEdge = leftEdge + (viewport?.width ?? window.innerWidth) - 16;
    const bottomEdge = topEdge + (viewport?.height ?? window.innerHeight) - 16;
    const anchor = mode === "slash" ? caretRect() : more.getBoundingClientRect();
    const width = Math.min(320, rightEdge - leftEdge);
    const below = Math.max(0, bottomEdge - anchor.bottom - 6);
    const above = Math.max(0, anchor.top - topEdge - 6);
    const upwards = below < Math.min(192, above);
    const height = Math.min(360, (bottomEdge - topEdge) * .6, Math.max(80, upwards ? above : below));
    popup.style.width = `${width}px`;
    popup.style.maxHeight = `${height}px`;
    popup.dataset.compact = String(height < 200);
    popup.style.left = `${Math.max(leftEdge, Math.min(anchor.left, rightEdge - width))}px`;
    popup.style.top = `${Math.max(topEdge, Math.min(upwards ? anchor.top - popup.offsetHeight - 6 : anchor.bottom + 6, bottomEdge - popup.offsetHeight))}px`;
  }
  function reposition() {
    if (!mode || frame) return;
    if (!window.requestAnimationFrame) { position(); return; }
    frame = window.requestAnimationFrame(() => { frame = 0; position(); });
  }
  function replace(edit: MarkdownEdit): boolean {
    const maximum = textarea.maxLength < 0 ? 150_000 : Math.min(150_000, textarea.maxLength);
    if (textarea.value.length - edit.end + edit.start + edit.text.length > maximum) {
      status.textContent = "正文已达到长度上限，未插入格式。"; return false;
    }
    const scroll = { top: textarea.scrollTop, left: textarea.scrollLeft };
    const original = textarea.value;
    const expected = original.slice(0, edit.start) + edit.text + original.slice(edit.end);
    let receivedInput = false;
    const trackInput = () => { receivedInput = true; };
    textarea.addEventListener("input", trackInput);
    textarea.focus({ preventScroll: true });
    textarea.setSelectionRange(edit.start, edit.end);
    // insertText keeps the browser's undo history where supported; setRangeText is the native fallback.
    if (typeof document.execCommand === "function") document.execCommand("insertText", false, edit.text);
    if (textarea.value !== expected) {
      textarea.value = original;
      textarea.setRangeText(edit.text, edit.start, edit.end, "end");
    }
    textarea.setSelectionRange(edit.selectionStart, edit.selectionEnd);
    textarea.scrollTop = scroll.top; textarea.scrollLeft = scroll.left;
    textarea.removeEventListener("input", trackInput);
    rememberSelection(); status.textContent = "";
    if (!receivedInput) textarea.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  function choose(command: EditorCommand) {
    if (textarea.disabled || textarea.readOnly || textarea.closest("[inert]") || composing) { close(); return; }
    if (!mode) rememberSelection();
    const token = mode === "slash" ? slash : null;
    const start = token?.start ?? selection.start;
    const end = token?.end ?? selection.end;
    close();
    if (command.media) {
      if (token && !replace({ start, end, text: "", selectionStart: start, selectionEnd: start })) return;
      textarea.focus({ preventScroll: true }); textarea.setSelectionRange(start, token ? start : end);
      if (command.media === "image") onImage(); else onAttachment(command.media);
      return;
    }
    const edit = buildMarkdownEdit(command.id, textarea.value, start, end, Boolean(token));
    if (edit) replace(edit); else status.textContent = "正文已达到长度上限，未插入格式。";
  }
  function refreshSlash() {
    rememberSelection();
    if (composing || textarea.readOnly || textarea.disabled || textarea.closest("[inert]") || selection.start !== selection.end) { close(); return; }
    const token = findSlashCommand(textarea.value, selection.start);
    if (!token) { close(); return; }
    mode = "slash"; slash = token;
    header.replaceChildren(title); title.textContent = token.query ? `插入内容 / ${token.query}` : "插入内容 · 输入关键词搜索";
    popup.hidden = false;
    more.setAttribute("aria-expanded", "true");
    textarea.setAttribute("aria-controls", id); textarea.setAttribute("aria-haspopup", "listbox");
    render(token.query);
  }
  function keyboard(event: KeyboardEvent) {
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (mode) {
      if (event.key === "Escape") { event.preventDefault(); const restore = mode === "toolbar"; close(); if (restore) more.focus({ preventScroll: true }); return; }
      if (event.key === "Tab") { close(); return; }
      if ((event.key === "ArrowDown" || event.key === "ArrowUp") && results.length) {
        event.preventDefault(); active = (active + (event.key === "ArrowDown" ? 1 : -1) + results.length) % results.length; focusActive(); return;
      }
      if (event.key === "Enter" && results.length) { event.preventDefault(); choose(results[active]); return; }
    }
    if (event.currentTarget === textarea && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && ["b", "i"].includes(event.key.toLowerCase()) && !textarea.readOnly && !textarea.disabled) {
      event.preventDefault(); rememberSelection(); choose(editorCommands.find(command => command.id === (event.key.toLowerCase() === "b" ? "bold" : "italic"))!);
    }
  }

  toolbar.replaceChildren(); toolbar.setAttribute("role", "group"); toolbar.setAttribute("aria-label", "Markdown 格式与插入");
  const formatLabel = document.createElement("label"); formatLabel.className = "editor-format-label";
  const labelText = document.createElement("span"); labelText.className = "editor-sr-only"; labelText.textContent = "段落格式";
  const format = document.createElement("select"); format.className = "editor-format-select";
  editorCommands.filter(command => command.id === "paragraph" || command.id.startsWith("heading")).forEach(command => {
    const option = document.createElement("option"); option.value = command.id; option.textContent = command.label; format.append(option);
  });
  format.addEventListener("input", event => event.stopPropagation(), { signal });
  format.addEventListener("change", () => { choose(editorCommands.find(command => command.id === format.value)!); format.value = "paragraph"; }, { signal });
  formatLabel.append(labelText, format); toolbar.append(formatLabel);
  for (const id of ["bold", "italic", "strike", "inline-code", "bullet-list", "ordered-list", "task-list", "quote", "link"]) {
    const command = editorCommands.find(command => command.id === id)!;
    const button = document.createElement("button"); button.type = "button"; button.className = "editor-tool";
    button.dataset.editorCommand = command.id; button.textContent = command.icon;
    button.setAttribute("aria-label", command.label); button.title = command.label + (command.shortcut ? `（${command.shortcut}）` : "");
    button.addEventListener("click", () => choose(command), { signal }); toolbar.append(button);
  }
  const more = document.createElement("button"); more.type = "button"; more.className = "editor-tool editor-tool-more";
  more.dataset.editorMenu = ""; more.textContent = "+ 插入"; more.setAttribute("aria-haspopup", "listbox"); more.setAttribute("aria-expanded", "false"); more.setAttribute("aria-controls", id);
  more.addEventListener("click", () => {
    if (mode === "toolbar") { close(); return; }
    if (textarea.readOnly || textarea.disabled || textarea.closest("[inert]") || composing) return;
    rememberSelection(); close(); mode = "toolbar"; header.replaceChildren(search); search.value = "";
    popup.hidden = false; more.setAttribute("aria-expanded", "true");
    search.setAttribute("aria-expanded", "true"); search.setAttribute("aria-controls", id); search.setAttribute("aria-haspopup", "listbox");
    render(""); search.focus({ preventScroll: true });
  }, { signal }); toolbar.append(more);
  toolbar.addEventListener("pointerdown", event => {
    if (document.activeElement === textarea) rememberSelection();
    if (event.pointerType === "mouse" && (event.target as Element).closest("button")) event.preventDefault();
  }, { signal });
  list.addEventListener("pointerdown", event => { if (event.pointerType === "mouse") event.preventDefault(); }, { signal });
  list.addEventListener("pointermove", event => {
    if (event.pointerType !== "mouse") return;
    const option = (event.target as Element).closest<HTMLElement>('[data-editor-command]');
    const index = results.findIndex(command => command.id === option?.dataset.editorCommand);
    if (index >= 0 && index !== active) { active = index; focusActive(); }
  }, { signal });
  list.addEventListener("click", event => {
    const option = (event.target as Element).closest<HTMLElement>('[data-editor-command]');
    const command = editorCommands.find(command => command.id === option?.dataset.editorCommand);
    if (command) { event.preventDefault(); choose(command); }
  }, { signal });
  search.addEventListener("input", () => render(search.value), { signal });
  search.addEventListener("keydown", keyboard, { signal });
  textarea.addEventListener("keydown", keyboard, { signal });
  textarea.addEventListener("input", () => { status.textContent = ""; refreshSlash(); }, { signal });
  textarea.addEventListener("select", () => {
    rememberSelection();
    if (mode === "slash") refreshSlash();
  }, { signal });
  textarea.addEventListener("pointerup", rememberSelection, { signal });
  textarea.addEventListener("keyup", rememberSelection, { signal });
  textarea.addEventListener("compositionstart", () => { composing = true; close(); }, { signal });
  textarea.addEventListener("compositionend", () => { composing = false; refreshSlash(); }, { signal });
  document.addEventListener("pointerdown", event => { if (event.target !== textarea && !toolbar.contains(event.target as Node) && !popup.contains(event.target as Node)) close(); }, { signal });
  document.addEventListener("focusin", event => { if (event.target !== textarea && !toolbar.contains(event.target as Node) && !popup.contains(event.target as Node)) close(); }, { signal });
  textarea.addEventListener("scroll", reposition, { passive: true, signal });
  window.addEventListener("scroll", reposition, { capture: true, passive: true, signal });
  window.addEventListener("resize", reposition, { passive: true, signal });
  window.visualViewport?.addEventListener("resize", reposition, { passive: true, signal });
  window.visualViewport?.addEventListener("scroll", reposition, { passive: true, signal });
  return { close, destroy() { close(); controller.abort(); if (frame) window.cancelAnimationFrame(frame); popup.remove(); status.remove(); } };
}
