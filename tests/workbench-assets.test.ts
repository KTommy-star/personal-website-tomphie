import { describe, expect, it } from "vitest";
import { getAssetType, isPrivateAssetReference, validateAssetBytes, validateAssetFilename } from "../supabase/functions/_shared/assets";

const encoder = new TextEncoder();
function officeZip(names: string[]): Uint8Array {
  const parts: Uint8Array[] = []; const central: Uint8Array[] = []; let offset = 0;
  for (const name of names) {
    const filename = encoder.encode(name); const local = new Uint8Array(30 + filename.length); const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(26, filename.length, true); local.set(filename, 30);
    const entry = new Uint8Array(46 + filename.length); const directory = new DataView(entry.buffer);
    directory.setUint32(0, 0x02014b50, true); directory.setUint16(6, 20, true); directory.setUint16(28, filename.length, true); directory.setUint32(42, offset, true); entry.set(filename, 46);
    parts.push(local); central.push(entry); offset += local.length;
  }
  const directoryLength = central.reduce((total, entry) => total + entry.length, 0); const end = new Uint8Array(22); const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, names.length, true); endView.setUint16(10, names.length, true); endView.setUint32(12, directoryLength, true); endView.setUint32(16, offset, true);
  const bytes = new Uint8Array(offset + directoryLength + end.length); let cursor = 0;
  for (const part of [...parts, ...central, end]) { bytes.set(part, cursor); cursor += part.length; }
  return bytes;
}

describe("approved private attachment validation", () => {
  it("accepts known types and normalizes an uploaded extension without retaining its filename", () => {
    expect(validateAssetFilename("研究计划.DOCX")).toMatchObject({ extension: "docx", kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
    expect(getAssetType("report.pdf")?.kind).toBe("document");
    expect(getAssetType("clip.mov")?.kind).toBe("video");
    expect(() => validateAssetFilename("../report.pdf")).toThrow();
    expect(() => validateAssetFilename("page.html")).toThrow();
    expect(() => validateAssetFilename("image.svg")).toThrow();
    expect(() => validateAssetFilename("pdf")).toThrow();
    expect(() => validateAssetFilename("report.pdf#unsafe.js")).toThrow();
  });
  it("accepts only strict owner/draft/file UUID references", () => {
    const path = "asset://11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333.pdf";
    expect(isPrivateAssetReference(path)).toBe(true);
    expect(isPrivateAssetReference(path.replace(".pdf", ".js"))).toBe(false);
    expect(isPrivateAssetReference(path.replace("11111111", "zzzzzzzz"))).toBe(false);
    expect(isPrivateAssetReference(`${path}?download=1`)).toBe(false);
  });
  it("rejects an incompatible MIME type and disguised executable text", () => {
    const pdf = encoder.encode("%PDF-1.7\nfixture\n%%EOF");
    expect(() => validateAssetBytes(pdf, "report.pdf", "application/pdf")).not.toThrow();
    expect(() => validateAssetBytes(pdf, "report.pdf", "text/html")).toThrow();
    expect(() => validateAssetBytes(encoder.encode("<script>alert(1)</script>"), "report.pdf")).toThrow();
    expect(() => validateAssetBytes(encoder.encode("<svg onload='alert(1)'>"), "report.csv")).toThrow();
    expect(() => validateAssetBytes(encoder.encode("姓名,数值\n示例,42"), "report.csv", "text/plain")).not.toThrow();
  });
  it("distinguishes OOXML packages from arbitrary ZIPs and renamed Office formats", () => {
    const word = officeZip(["[Content_Types].xml", "_rels/.rels", "word/document.xml"]);
    expect(() => validateAssetBytes(word, "report.docx")).not.toThrow();
    expect(() => validateAssetBytes(word, "table.xlsx")).toThrow();
    expect(() => validateAssetBytes(officeZip(["readme.txt"]), "report.docx")).toThrow();
    expect(() => validateAssetBytes(word.subarray(0, word.length - 4), "report.docx")).toThrow();
    expect(() => validateAssetBytes(officeZip(["[Content_Types].xml", "xl/workbook.xml"]), "table.xlsx")).not.toThrow();
    expect(() => validateAssetBytes(officeZip(["[Content_Types].xml", "ppt/presentation.xml"]), "slides.pptx")).not.toThrow();
  });
  it("rejects an Office package whose expanded files exceed the preview budget", () => {
    const bytes = officeZip(["[Content_Types].xml", "word/document.xml"]); const view = new DataView(bytes.buffer);
    view.setUint16(8, 8, true); view.setUint32(22, 41 * 1024 * 1024, true);
    const end = bytes.length - 22; const central = view.getUint32(end + 16, true);
    view.setUint16(central + 10, 8, true); view.setUint32(central + 24, 41 * 1024 * 1024, true);
    expect(() => validateAssetBytes(bytes, "report.docx")).toThrow();
  });
  it("distinguishes legacy Word, Excel and PowerPoint compound files", () => {
    for (const [extension, stream] of [["doc", "WordDocument"], ["xls", "Workbook"], ["ppt", "PowerPoint Document"]]) {
      const bytes = new Uint8Array(512); bytes.set([208, 207, 17, 224, 161, 177, 26, 225]);
      const view = new DataView(bytes.buffer); view.setUint16(28, 0xfffe, true); view.setUint16(30, 9, true);
      for (let i = 0; i < stream.length; i++) view.setUint16(128 + i * 2, stream.charCodeAt(i), true);
      expect(() => validateAssetBytes(bytes, `legacy.${extension}`)).not.toThrow();
      expect(() => validateAssetBytes(bytes, extension === "doc" ? "legacy.xls" : "legacy.doc")).toThrow();
    }
  });
  it("blocks encrypted, active or traversal members in an OOXML archive", () => {
    for (const member of ["word/vbaProject.bin", "word/activeX/activeX1.xml", "../unsafe.html"]) {
      expect(() => validateAssetBytes(officeZip(["[Content_Types].xml", "word/document.xml", member]), "report.docx")).toThrow();
    }
    const encrypted = officeZip(["[Content_Types].xml", "word/document.xml"]); new DataView(encrypted.buffer).setUint16(6, 1, true);
    expect(() => validateAssetBytes(encrypted, "report.docx")).toThrow();
  });
  it("validates video containers and enforces each file's size budget", () => {
    const mp4 = new Uint8Array([0, 0, 0, 20, 102, 116, 121, 112, 105, 115, 111, 109, 0, 0, 0, 0, 109, 112, 52, 50]);
    expect(() => validateAssetBytes(mp4, "clip.mp4", "video/mp4")).not.toThrow();
    expect(() => validateAssetBytes(mp4, "clip.webm")).toThrow();
    const mov = new Uint8Array([0, 0, 0, 16, 102, 116, 121, 112, 113, 116, 32, 32, 0, 0, 0, 0]);
    expect(() => validateAssetBytes(mov, "clip.mov", "video/quicktime")).not.toThrow();
    expect(() => validateAssetBytes(new Uint8Array([26, 69, 223, 163, 66, 130, 132, 119, 101, 98, 109]), "clip.webm", "video/webm")).not.toThrow();
    expect(() => validateAssetBytes(new Uint8Array(10 * 1024 * 1024 + 1), "report.pdf")).toThrow("10");
    expect(() => validateAssetBytes(new Uint8Array(25 * 1024 * 1024 + 1), "clip.mp4")).toThrow("25");
  });
});
