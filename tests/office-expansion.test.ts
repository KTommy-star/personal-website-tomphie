import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { verifyOfficeExpansion } from "../src/lib/office-expansion";

function archive(length = 256, declared = length, fakeComment = false) {
  const compressed = deflateRawSync(new Uint8Array(length).fill(65));
  const name = new TextEncoder().encode("word/document.xml");
  const central = 30 + name.length + compressed.length;
  const end = central + 46 + name.length;
  const bytes = new Uint8Array(end + 22 + (fakeComment ? 22 : 0));
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x04034b50, true); view.setUint16(8, 8, true);
  view.setUint32(18, compressed.length, true); view.setUint32(22, declared, true);
  view.setUint16(26, name.length, true); bytes.set(name, 30); bytes.set(compressed, 30 + name.length);
  view.setUint32(central, 0x02014b50, true); view.setUint16(central + 10, 8, true);
  view.setUint32(central + 20, compressed.length, true); view.setUint32(central + 24, declared, true);
  view.setUint16(central + 28, name.length, true); bytes.set(name, central + 46);
  view.setUint32(end, 0x06054b50, true); view.setUint16(end + 8, 1, true); view.setUint16(end + 10, 1, true);
  view.setUint32(end + 12, 46 + name.length, true); view.setUint32(end + 16, central, true);
  if (fakeComment) { view.setUint16(end + 20, 22, true); view.setUint32(end + 22, 0x06054b50, true); view.setUint16(end + 42, 1, true); }
  return bytes;
}
describe("bounded Office expansion", () => {
  it("accepts matching actual and declared deflate output", async () => {
    await expect(verifyOfficeExpansion(archive(), new AbortController().signal)).resolves.toBeUndefined();
  });
  it("rejects inflated bytes exceeding forged header sizes", async () => {
    await expect(verifyOfficeExpansion(archive(1024, 1), new AbortController().signal)).rejects.toThrow("安全预览范围");
  });
  it("does not mistake a signature inside the ZIP comment for the real directory", async () => {
    await expect(verifyOfficeExpansion(archive(1024, 1, true), new AbortController().signal)).rejects.toThrow("安全预览范围");
  });
  it("stops when the attachment dialog has been closed", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(verifyOfficeExpansion(archive(), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
