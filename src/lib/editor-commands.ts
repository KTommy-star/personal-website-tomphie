export interface EditorCommand {
  id: string;
  label: string;
  group: string;
  icon: string;
  description: string;
  keywords: string;
  shortcut?: string;
  media?: "image" | "file" | "video";
}

export const editorCommands: readonly EditorCommand[] = [
  { id: "paragraph", label: "正文", group: "文本", icon: "¶", description: "普通段落", keywords: "paragraph text 段落 文本" },
  { id: "heading1", label: "一级标题", group: "文本", icon: "H1", description: "章节标题", keywords: "heading 1 h1 标题 大标题" },
  { id: "heading2", label: "二级标题", group: "文本", icon: "H2", description: "小节标题", keywords: "heading 2 h2 标题" },
  { id: "heading3", label: "三级标题", group: "文本", icon: "H3", description: "小节内的标题", keywords: "heading 3 h3 标题" },
  { id: "heading4", label: "四级标题", group: "文本", icon: "H4", description: "细分标题", keywords: "heading 4 h4 标题" },
  { id: "bold", label: "粗体", group: "文字样式", icon: "B", description: "强调选中的文字", keywords: "bold strong 加粗 重点", shortcut: "⌘ / Ctrl B" },
  { id: "italic", label: "斜体", group: "文字样式", icon: "I", description: "倾斜选中的文字", keywords: "italic emphasis 斜体", shortcut: "⌘ / Ctrl I" },
  { id: "strike", label: "删除线", group: "文字样式", icon: "S", description: "划去选中的文字", keywords: "strike strikethrough 删除线" },
  { id: "inline-code", label: "行内代码", group: "文字样式", icon: "‹›", description: "短代码或变量名", keywords: "inline code 行内代码 变量" },
  { id: "bullet-list", label: "无序列表", group: "列表与结构", icon: "•", description: "用圆点列出项目", keywords: "bullet unordered list 无序 列表" },
  { id: "ordered-list", label: "有序列表", group: "列表与结构", icon: "1.", description: "按顺序列出步骤", keywords: "ordered numbered list 有序 编号 步骤" },
  { id: "task-list", label: "待办列表", group: "列表与结构", icon: "☑", description: "可勾选的任务", keywords: "task todo checklist 待办 任务 清单" },
  { id: "quote", label: "引用", group: "列表与结构", icon: "❞", description: "突出一段引用", keywords: "quote blockquote 引用" },
  { id: "divider", label: "分隔线", group: "列表与结构", icon: "—", description: "分隔两段内容", keywords: "divider horizontal rule hr 分隔线" },
  { id: "code", label: "代码块", group: "内容", icon: "{ }", description: "多行代码", keywords: "code fenced codeblock 代码块" },
  { id: "table", label: "表格", group: "内容", icon: "▦", description: "两列 Markdown 表格", keywords: "table 表格" },
  { id: "link", label: "链接", group: "内容", icon: "↗", description: "文字与网页地址", keywords: "link url hyperlink 链接 网址" },
  { id: "math", label: "行内公式", group: "内容", icon: "x²", description: "正文中的数学表达式", keywords: "inline math formula equation latex 行内 公式 数学" },
  { id: "display-math", label: "独立公式", group: "内容", icon: "∑", description: "单独一行的数学表达式", keywords: "display math block formula equation latex 独立 块 公式 数学" },
  { id: "image", label: "图片", group: "媒体与附件", icon: "▧", description: "上传并插入图片", keywords: "image photo picture 图片 照片 上传", media: "image" },
  { id: "file", label: "文件附件", group: "媒体与附件", icon: "⌁", description: "上传并插入文件链接", keywords: "file attachment document 文件 附件 文档 上传", media: "file" },
  { id: "video", label: "视频", group: "媒体与附件", icon: "▷", description: "上传并插入视频", keywords: "video movie 视频 上传", media: "video" },
];

export function searchEditorCommands(query: string): EditorCommand[] {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return editorCommands.filter(command => {
    const haystack = `${command.label} ${command.keywords}`.toLocaleLowerCase();
    return terms.every(term => haystack.includes(term));
  });
}

export interface SlashCommand { start: number; end: number; query: string }

function inCode(text: string): boolean {
  let fence: { marker: string; length: number } | undefined;
  let inline = 0;
  for (const line of text.split("\n")) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence.marker && marker[1].length >= fence.length && !marker[2].trim()) fence = undefined;
      continue;
    }
    if (marker && !inline) { fence = { marker: marker[1][0], length: marker[1].length }; continue; }
    if (!line.trim()) inline = 0;
    for (const match of line.matchAll(/(?<!\\)`+/g)) {
      if (!inline) inline = match[0].length;
      else if (inline === match[0].length) inline = 0;
    }
  }
  return Boolean(fence || inline || /^(?: {4}|\t)/.test(text.slice(text.lastIndexOf("\n") + 1)));
}

export function findSlashCommand(value: string, caret: number): SlashCommand | null {
  const before = value.slice(0, caret);
  const start = before.lastIndexOf("/");
  if (start < 0 || (start > 0 && !/\s/.test(value[start - 1]))) return null;
  const query = before.slice(start + 1);
  if (!/^[\p{L}\p{N} _-]{0,40}$/u.test(query) || inCode(before.slice(0, start))) return null;
  return { start, end: caret, query };
}

export interface MarkdownEdit { start: number; end: number; text: string; selectionStart: number; selectionEnd: number }

function edit(start: number, end: number, text: string, selectedStart = 0, selectedLength = text.length): MarkdownEdit {
  return { start, end, text, selectionStart: start + selectedStart, selectionEnd: start + selectedStart + selectedLength };
}

function surround(value: string, start: number, end: number, before: string, after: string, placeholder: string): MarkdownEdit {
  const selected = value.slice(start, end) || placeholder;
  const starsBefore = before === "*" ? /\*+$/.exec(value.slice(0, start))?.[0].length || 0 : 0;
  const starsAfter = after === "*" ? /^\*+/.exec(value.slice(end))?.[0].length || 0 : 0;
  const removable = before !== "*" || (starsBefore % 2 === 1 && starsAfter % 2 === 1);
  if (removable && start >= before.length && value.slice(start - before.length, start) === before && value.slice(end, end + after.length) === after) {
    return edit(start - before.length, end + after.length, selected);
  }
  return edit(start, end, before + selected + after, before.length, selected.length);
}

function block(value: string, start: number, end: number, text: string, selectedStart: number, selectedLength: number): MarkdownEdit {
  const before = value.slice(0, start);
  const after = value.slice(end);
  const prefix = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
  const suffix = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
  return edit(start, end, prefix + text + suffix, prefix.length + selectedStart, selectedLength);
}

function formatLines(id: string, value: string, start: number, end: number): MarkdownEdit {
  const lineStart = start > 0 ? value.lastIndexOf("\n", start - 1) + 1 : 0;
  const last = end > start && value[end - 1] === "\n" ? end - 1 : end;
  const next = value.indexOf("\n", last);
  const lineEnd = next < 0 ? value.length : next;
  const lines = value.slice(lineStart, lineEnd).split("\n");
  let firstPrefix = "";
  const text = lines.map((line, index) => {
    const clean = line.replace(/^ {0,3}(?:#{1,6}\s+|>\s?|[-+*]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, "");
    const prefix = id.startsWith("heading") ? `${"#".repeat(Number(id.slice(-1)))} ` : id === "quote" ? "> " : id === "ordered-list" ? `${index + 1}. ` : id === "task-list" ? "- [ ] " : id === "bullet-list" ? "- " : "";
    if (!index) firstPrefix = prefix;
    return prefix + (clean || (id.startsWith("heading") ? "标题" : id === "paragraph" ? "正文" : id === "quote" ? "引用" : "列表项"));
  }).join("\n");
  return edit(lineStart, lineEnd, text, firstPrefix.length, text.length - firstPrefix.length);
}

export function buildMarkdownEdit(id: string, value: string, start: number, end: number, slash = false): MarkdownEdit | null {
  if (slash) {
    const clean = value.slice(0, start) + value.slice(end);
    const result = buildMarkdownEdit(id, clean, start, start);
    return result ? { ...result, end: result.end + end - start } : null;
  }
  if (!editorCommands.some(command => command.id === id && !command.media)) return null;
  let result: MarkdownEdit;
  const selected = value.slice(start, end);
  if (id === "paragraph" || id.startsWith("heading") || ["bullet-list", "ordered-list", "task-list", "quote"].includes(id)) {
    result = formatLines(id, value, start, end);
  } else if (id === "bold" || id === "italic" || id === "strike" || id === "math") {
    const marker = id === "bold" ? "**" : id === "italic" ? "*" : id === "strike" ? "~~" : "$";
    result = surround(value, start, end, marker, marker, id === "math" ? "x^2" : id === "bold" ? "重点" : "文字");
  } else if (id === "inline-code") {
    const text = selected || "代码";
    const longest = Math.max(0, ...Array.from(text.matchAll(/`+/g), match => match[0].length));
    const marker = "`".repeat(longest + 1);
    const pad = text.startsWith("`") || text.endsWith("`") ? " " : "";
    result = surround(value, start, end, marker + pad, pad + marker, "代码");
  } else if (id === "link") {
    result = surround(value, start, end, "[", "](https://example.com)", "链接文字");
  } else if (id === "code" || id === "display-math") {
    const text = selected || (id === "code" ? "代码" : "x^2");
    const longest = Math.max(2, ...Array.from(text.matchAll(/`+/g), match => match[0].length));
    const marker = id === "code" ? "`".repeat(longest + 1) : "$$";
    result = block(value, start, end, `${marker}\n${text}\n${marker}`, marker.length + 1, text.length);
  } else if (id === "table") {
    const text = selected || "内容";
    const prefix = "| 列 1 | 列 2 |\n| --- | --- |\n";
    const rows = text.split("\n").map(line => `| ${line.replace(/\|/g, "\\|")} | 内容 |`).join("\n");
    result = block(value, start, end, prefix + rows, prefix.length + 2, rows.length - 9);
  } else {
    result = block(value, start, end, selected ? `${selected}\n\n---` : "---", 0, selected.length);
  }
  return value.length - (result.end - result.start) + result.text.length > 150_000 ? null : result;
}
