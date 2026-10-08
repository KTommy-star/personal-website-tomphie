// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildMarkdownEdit, findSlashCommand, searchEditorCommands } from "../src/lib/editor-commands";
import { initMarkdownEditor } from "../src/scripts/workbench-editor";

function edited(value: string, command: string, start = 0, end = value.length, slash = false) {
  const edit = buildMarkdownEdit(command, value, start, end, slash)!;
  return { value: value.slice(0, edit.start) + edit.text + value.slice(edit.end), selected: edit.text.slice(edit.selectionStart - edit.start, edit.selectionEnd - edit.start) };
}

describe("Markdown commands", () => {
  it("finds a slash query after whitespace without replacing preceding writing", () => {
    expect(findSlashCommand("保留这句 /标题", 8)).toEqual({ start: 5, end: 8, query: "标题" });
    expect(findSlashCommand("/", 1)).toEqual({ start: 0, end: 1, query: "" });
  });
  it.each(["https://example.test/heading", "正文/heading", "` /heading", "``含有 ` /heading", "```md\n/heading", "~~~\n/heading", "    /heading"])("does not open inside URLs or code: %s", value => {
    expect(findSlashCommand(value, value.length)).toBeNull();
  });
  it("opens again after closed fences and inline code", () => {
    const value = "```md\n代码\n```\n`代码` /bold";
    expect(findSlashCommand(value, value.length)?.query).toBe("bold");
  });
  it("searches Chinese labels and English keywords", () => {
    expect(searchEditorCommands("待办").map(command => command.id)).toContain("task-list");
    expect(searchEditorCommands("heading 3").map(command => command.id)).toEqual(["heading3"]);
    expect(searchEditorCommands("display math").map(command => command.id)).toEqual(["display-math"]);
    expect(searchEditorCommands("不存在的命令")).toEqual([]);
  });
  it("wraps selected text and keeps that text selected", () => {
    expect(edited("保留原文", "bold", 2, 4)).toEqual({ value: "保留**原文**", selected: "原文" });
    expect(edited("原文", "italic")).toEqual({ value: "*原文*", selected: "原文" });
    expect(edited("原文", "strike")).toEqual({ value: "~~原文~~", selected: "原文" });
  });
  it("removes an existing inline format without deleting the selected words", () => {
    expect(edited("**原文**", "bold", 2, 4)).toEqual({ value: "原文", selected: "原文" });
  });
  it("combines bold and italic without accidentally removing an existing emphasis", () => {
    expect(edited("**原文**", "italic", 2, 4).value).toBe("***原文***");
    expect(edited("***原文***", "italic", 3, 5).value).toBe("**原文**");
  });
  it("formats an empty first line without consuming the following paragraph", () => {
    expect(edited("\n下一段", "heading2", 0, 0).value).toBe("## 标题\n下一段");
  });
  it("replaces an existing block prefix and transforms every selected line", () => {
    expect(edited("## 原文", "heading3", 3, 5).value).toBe("### 原文");
    expect(edited("- 第一项\n- 第二项", "ordered-list").value).toBe("1. 第一项\n2. 第二项");
    expect(edited("第一项\n第二项\n下一段", "task-list", 0, 8).value).toBe("- [ ] 第一项\n- [ ] 第二项\n下一段");
    expect(edited("### 原文", "paragraph").value).toBe("原文");
  });
  it("inserts block snippets on their own lines without eating nearby text", () => {
    expect(edited("前后", "code", 1, 1).value).toBe("前\n\n```\n代码\n```\n\n后");
    expect(edited("前后", "divider", 1, 1).value).toBe("前\n\n---\n\n后");
    expect(edited("", "display-math").value).toBe("$$\nx^2\n$$");
  });
  it("uses longer code delimiters when the selected code contains backticks", () => {
    expect(edited("a`b", "inline-code").value).toBe("``a`b``");
    expect(edited("```", "code").value).toBe("````\n```\n````");
  });
  it("removes the slash query before inserting the chosen command", () => {
    expect(edited("/标题", "heading2", 0, 3, true)).toEqual({ value: "## 标题", selected: "标题" });
    expect(edited("原文 /bold", "bold", 3, 8, true)).toEqual({ value: "原文 **重点**", selected: "重点" });
  });
  it("preserves link labels and provides an editable formula selection", () => {
    expect(edited("论文", "link")).toEqual({ value: "[论文](https://example.com)", selected: "论文" });
    expect(edited("", "math")).toEqual({ value: "$x^2$", selected: "x^2" });
    expect(edited("测量", "table").value).toContain("测量");
  });
  it("turns selected lines into valid table rows without losing literal pipes", () => {
    expect(edited("甲|乙\n丙", "table").value).toBe("| 列 1 | 列 2 |\n| --- | --- |\n| 甲\\|乙 | 内容 |\n| 丙 | 内容 |");
  });
  it("refuses a command that would exceed the draft size limit without truncating text", () => {
    expect(buildMarkdownEdit("bold", "文".repeat(150_000), 0, 1)).toBeNull();
  });
});

const cleanup: (() => void)[] = [];
afterEach(() => { cleanup.splice(0).forEach(close => close()); document.body.replaceChildren(); vi.restoreAllMocks(); });
function editor() {
  document.body.innerHTML = '<form><div class="markdown-toolbar"></div><label for="body">正文</label><textarea id="body" maxlength="150000"></textarea></form>';
  const textarea = document.querySelector("textarea")!;
  const toolbar = document.querySelector<HTMLElement>(".markdown-toolbar")!;
  const uploads: string[] = [];
  const result = initMarkdownEditor({ textarea, toolbar, onImage: () => uploads.push("image"), onAttachment: kind => uploads.push(kind) });
  cleanup.push(result.destroy);
  return { textarea, toolbar, uploads };
}
function type(textarea: HTMLTextAreaElement, value: string) {
  textarea.focus(); textarea.value = value; textarea.setSelectionRange(value.length, value.length);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}
function key(target: HTMLElement, value: string, options: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...options });
  target.dispatchEvent(event); return event;
}

describe("native Markdown editor interaction", () => {
  it("uses the slash search, keyboard choice, and one bubbling autosave input", () => {
    const { textarea } = editor(); type(textarea, "/heading 3");
    const events: string[] = []; textarea.closest("form")!.addEventListener("input", () => events.push(textarea.value));
    expect(document.querySelector('[role="listbox"] [aria-selected="true"]')?.textContent).toContain("三级标题");
    expect(textarea.hasAttribute("aria-expanded")).toBe(false);
    expect(document.querySelector('[data-editor-menu]')?.getAttribute("aria-expanded")).toBe("true");
    expect(key(textarea, "Enter").defaultPrevented).toBe(true);
    expect(textarea.value).toBe("### 标题"); expect(events).toEqual(["### 标题"]);
    expect(textarea.getAttribute("aria-activedescendant")).toBeNull();
  });
  it("lets Escape cancel without changing the slash or consuming the next Enter", () => {
    const { textarea } = editor(); type(textarea, "/bold"); key(textarea, "Escape");
    expect(textarea.value).toBe("/bold"); expect(key(textarea, "Enter").defaultPrevented).toBe(false);
  });
  it("does not choose a command while an IME composition is in progress", () => {
    const { textarea } = editor(); type(textarea, "/");
    textarea.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
    expect(key(textarea, "Enter", { isComposing: true }).defaultPrevented).toBe(false);
    expect(textarea.value).toBe("/");
    textarea.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    type(textarea, "/粗体"); key(textarea, "Enter"); expect(textarea.value).toBe("**重点**");
  });
  it("keeps the toolbar selection and does not submit the form", () => {
    const { textarea, toolbar } = editor(); type(textarea, "保留原文"); textarea.setSelectionRange(2, 4);
    textarea.dispatchEvent(new Event("select"));
    let submitted = false; textarea.closest("form")!.addEventListener("submit", event => { event.preventDefault(); submitted = true; });
    toolbar.querySelector<HTMLButtonElement>('[data-editor-command="bold"]')!.click();
    expect(textarea.value).toBe("保留**原文**"); expect(submitted).toBe(false);
    expect(textarea.value.slice(textarea.selectionStart, textarea.selectionEnd)).toBe("原文");
  });
  it("emits only the final Markdown edit when the native format select changes", () => {
    const { textarea, toolbar } = editor(); type(textarea, "原文");
    const events: string[] = []; textarea.closest("form")!.addEventListener("input", () => events.push(textarea.value));
    const format = toolbar.querySelector("select")!; format.value = "heading2";
    format.dispatchEvent(new Event("input", { bubbles: true })); format.dispatchEvent(new Event("change", { bubbles: true }));
    expect(events).toEqual(["## 原文"]);
  });
  it("uses the same searchable command menu from the toolbar", () => {
    const { textarea, toolbar } = editor(); type(textarea, "原文"); textarea.setSelectionRange(0, 2); textarea.dispatchEvent(new Event("select"));
    toolbar.querySelector<HTMLButtonElement>('[data-editor-menu]')!.click();
    const search = document.querySelector<HTMLInputElement>('.editor-command-search')!;
    search.value = "strike"; search.dispatchEvent(new Event("input", { bubbles: true })); key(search, "Enter");
    expect(textarea.value).toBe("~~原文~~");
  });
  it("uses the current native selection after a draft changes programmatically", () => {
    const { textarea, toolbar } = editor(); type(textarea, "较长的上一篇草稿");
    textarea.value = "新稿"; textarea.setSelectionRange(0, 2);
    toolbar.querySelector<HTMLButtonElement>('[data-editor-command="bold"]')!.click();
    expect(textarea.value).toBe("**新稿**");
  });
  it("updates the slash query when the caret moves within the command", () => {
    const { textarea } = editor(); type(textarea, "/heading 3");
    textarea.setSelectionRange(9, 9); textarea.dispatchEvent(new Event("select"));
    key(textarea, "Enter"); expect(textarea.value).toBe("# 3");
  });
  it("leaves keyboard text editing alone in URLs, code, and noncollapsed selections", () => {
    const { textarea } = editor(); type(textarea, "https://example.test/bold");
    expect(textarea.hasAttribute("aria-expanded")).toBe(false); expect(key(textarea, "Enter").defaultPrevented).toBe(false);
    type(textarea, "/bold"); textarea.setSelectionRange(1, 5); textarea.dispatchEvent(new Event("select"));
    expect(key(textarea, "Enter").defaultPrevented).toBe(false);
  });
  it("routes media choices with a clean insertion selection", () => {
    const { textarea, uploads } = editor(); type(textarea, "原文 /video"); key(textarea, "Enter");
    expect(uploads).toEqual(["video"]); expect(textarea.value).toBe("原文 "); expect(textarea.selectionStart).toBe(3);
  });
  it("ignores empty search results and allows the author to keep typing", () => {
    const { textarea } = editor(); type(textarea, "/未知格式");
    expect(document.querySelector('.editor-command-empty')?.textContent).toContain("没有匹配");
    expect(key(textarea, "Enter").defaultPrevented).toBe(false); expect(textarea.value).toBe("/未知格式");
  });
  it("supports the standard bold and italic shortcuts without running during composition", () => {
    const { textarea } = editor(); type(textarea, "原文"); textarea.setSelectionRange(0, 2);
    key(textarea, "b", { ctrlKey: true }); expect(textarea.value).toBe("**原文**");
    key(textarea, "i", { metaKey: true, isComposing: true }); expect(textarea.value).toBe("**原文**");
  });
  it("does not change a read-only draft or exceed a textarea maximum", () => {
    const { textarea, toolbar } = editor(); type(textarea, "原文"); textarea.readOnly = true;
    toolbar.querySelector<HTMLButtonElement>('[data-editor-command="bold"]')!.click(); expect(textarea.value).toBe("原文");
    textarea.readOnly = false; textarea.maxLength = 3;
    toolbar.querySelector<HTMLButtonElement>('[data-editor-command="bold"]')!.click(); expect(textarea.value).toBe("原文");
  });
  it("cannot edit an inert form through a popup mounted outside that form", () => {
    const { textarea } = editor(); type(textarea, "/bold"); textarea.closest("form")!.setAttribute("inert", "");
    document.querySelector<HTMLElement>('[role="option"][data-editor-command="bold"]')!.click();
    expect(textarea.value).toBe("/bold");
  });
});
