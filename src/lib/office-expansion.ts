import { MAX_PUBLICATION_ASSET_BYTES } from "../../supabase/functions/_shared/assets";

// Verify actual inflated sizes before handing ZIP bytes to Office parsers.
// Header sizes alone are not a memory bound for a deliberately forged ZIP.
export async function verifyOfficeExpansion(bytes: Uint8Array, signal: AbortSignal) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && (view.getUint32(end, true) !== 0x06054b50 || end + 22 + view.getUint16(end + 20, true) !== bytes.length)) end--;
  if (end < Math.max(0, bytes.length - 65557)) throw new Error("Office 文件目录损坏");
  let cursor = view.getUint32(end + 16, true);
  let total = 0;
  for (let i = 0; i < view.getUint16(end + 10, true); i++) {
    signal.throwIfAborted();
    const compressed = view.getUint32(cursor + 20, true);
    const declared = view.getUint32(cursor + 24, true);
    const local = view.getUint32(cursor + 42, true);
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const method = view.getUint16(cursor + 10, true);
    if (method === 0) {
      if (compressed !== declared) throw new Error("Office 文件解压长度无效");
      total += compressed;
    } else {
      const stream = new Blob([bytes.slice(start, start + compressed)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      const reader = stream.getReader();
      let count = 0;
      try {
        while (true) {
          signal.throwIfAborted();
          const part = await reader.read();
          if (part.done) break;
          count += part.value.length;
          if (count > declared || total + count > MAX_PUBLICATION_ASSET_BYTES) throw new Error("Office 解压内容超出安全预览范围");
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (count !== declared) throw new Error("Office 文件解压长度无效");
      total += count;
    }
    if (total > MAX_PUBLICATION_ASSET_BYTES) throw new Error("Office 解压内容过大，请打开原文件");
    cursor += 46 + view.getUint16(cursor + 28, true) + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
}
