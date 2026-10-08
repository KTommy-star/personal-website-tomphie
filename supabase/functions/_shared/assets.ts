export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export const MAX_PUBLICATION_ASSETS = 20;
export const MAX_PUBLICATION_ASSET_BYTES = 40 * 1024 * 1024;
export type AssetKind = "image" | "document" | "video";
const MiB = 1024 * 1024;
export const assetTypes = {
  webp: { kind: "image", mimeType: "image/webp", maxBytes: 2 * MiB },
  png: { kind: "image", mimeType: "image/png", maxBytes: 2 * MiB },
  jpg: { kind: "image", mimeType: "image/jpeg", maxBytes: 2 * MiB },
  jpeg: { kind: "image", mimeType: "image/jpeg", maxBytes: 2 * MiB },
  pdf: { kind: "document", mimeType: "application/pdf", maxBytes: 10 * MiB },
  docx: { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", maxBytes: 10 * MiB },
  xlsx: { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", maxBytes: 10 * MiB },
  xls: { kind: "document", mimeType: "application/vnd.ms-excel", maxBytes: 10 * MiB },
  pptx: { kind: "document", mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation", maxBytes: 10 * MiB },
  doc: { kind: "document", mimeType: "application/msword", maxBytes: 10 * MiB },
  ppt: { kind: "document", mimeType: "application/vnd.ms-powerpoint", maxBytes: 10 * MiB },
  csv: { kind: "document", mimeType: "text/csv", maxBytes: 10 * MiB },
  mp4: { kind: "video", mimeType: "video/mp4", maxBytes: 25 * MiB },
  webm: { kind: "video", mimeType: "video/webm", maxBytes: 25 * MiB },
  mov: { kind: "video", mimeType: "video/quicktime", maxBytes: 25 * MiB },
} as const;
export type AssetExtension = keyof typeof assetTypes;
export type AssetType = (typeof assetTypes)[AssetExtension] & { extension: AssetExtension };
const uuidSource = uuidPattern.source.slice(1, -1);
export const assetPattern = new RegExp(`^${uuidSource}/${uuidSource}/${uuidSource}\\.(?:${Object.keys(assetTypes).join("|")})$`, "i");

export function getAssetType(pathOrFilename: string): AssetType | undefined {
  const extension = pathOrFilename.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i)?.[1].toLowerCase() as AssetExtension;
  return Object.hasOwn(assetTypes, extension) ? { ...assetTypes[extension], extension } : undefined;
}
export function validateAssetFilename(filename: string): AssetType {
  const type = getAssetType(filename);
  if (!type || !filename.trim() || filename.length > 240 || /[\x00-\x1f\x7f/\\:*?#"<>|]/.test(filename)) throw new Error("附件仅支持 PDF、Word、Excel、PowerPoint、CSV、MP4、WebM、MOV 和常用图片，请检查文件名");
  return type;
}
export function isPrivateAssetReference(reference: string): boolean {
  return reference.startsWith("asset://") && assetPattern.test(reference.slice(8));
}
const ascii = (bytes: Uint8Array, start: number, end: number) => new TextDecoder().decode(bytes.subarray(start, end));
const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((value, index) => bytes[index] === value);

function officePackage(bytes: Uint8Array, extension: AssetExtension): boolean {
  if (!startsWith(bytes, [80, 75, 3, 4]) || bytes.length < 22) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let end = bytes.length - 22;
  for (; end >= Math.max(0, bytes.length - 65557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === bytes.length) break;
  }
  if (end < Math.max(0, bytes.length - 65557) || view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) return false;
  const entries = view.getUint16(end + 10, true); const centralSize = view.getUint32(end + 12, true); const centralStart = view.getUint32(end + 16, true);
  if (!entries || entries > 4096 || view.getUint16(end + 8, true) !== entries || centralStart + centralSize !== end) return false;
  const names = new Set<string>(); let cursor = centralStart; let expandedBytes = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > end || view.getUint32(cursor, true) !== 0x02014b50) return false;
    const flags = view.getUint16(cursor + 8, true); const method = view.getUint16(cursor + 10, true); const compressedSize = view.getUint32(cursor + 20, true); const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true); const extraLength = view.getUint16(cursor + 30, true); const commentLength = view.getUint16(cursor + 32, true); const local = view.getUint32(cursor + 42, true);
    const next = cursor + 46 + nameLength + extraLength + commentLength;
    if (next > end || !nameLength || flags & 1 || ![0, 8].includes(method) || view.getUint16(cursor + 34, true) || local + 30 > centralStart) return false;
    let name: string;
    try { name = new TextDecoder("utf-8", { fatal: true }).decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)); } catch { return false; }
    if (names.has(name) || /[\\\x00-\x1f]/.test(name) || name.startsWith("/") || name.split("/").some(part => part === ".." || part === ".") || /(?:vbaproject|\/activex\/|\.(?:exe|js|html?|mhtml|xhtml)$)/i.test(name)) return false;
    if (view.getUint32(local, true) !== 0x04034b50 || view.getUint16(local + 6, true) !== flags || view.getUint16(local + 8, true) !== method || view.getUint16(local + 26, true) !== nameLength) return false;
    const dataStart = local + 30 + nameLength + view.getUint16(local + 28, true);
    if (dataStart + compressedSize > centralStart || ascii(bytes, local + 30, local + 30 + nameLength) !== name) return false;
    if (!(flags & 8) && (view.getUint32(local + 18, true) !== compressedSize || view.getUint32(local + 22, true) !== size)) return false;
    expandedBytes += size;
    if (expandedBytes > MAX_PUBLICATION_ASSET_BYTES) return false;
    names.add(name); cursor = next;
  }
  const mainPart = extension === "docx" ? "word/document.xml" : extension === "xlsx" ? "xl/workbook.xml" : "ppt/presentation.xml";
  return cursor === end && names.has("[Content_Types].xml") && names.has(mainPart);
}
function legacyOffice(bytes: Uint8Array, extension: AssetExtension): boolean {
  if (bytes.length < 512 || !startsWith(bytes, [208, 207, 17, 224, 161, 177, 26, 225])) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint16(28, true) !== 0xfffe || ![9, 12].includes(view.getUint16(30, true))) return false;
  const streams = new TextDecoder("utf-16le").decode(bytes);
  return extension === "doc" ? streams.includes("WordDocument\0") : extension === "xls" ? /(?:Workbook|Book)\0/.test(streams) : streams.includes("PowerPoint Document\0");
}
function videoContainer(bytes: Uint8Array, extension: AssetExtension): boolean {
  if (extension === "webm") return startsWith(bytes, [26, 69, 223, 163]) && ascii(bytes, 0, Math.min(bytes.length, 4096)).includes("webm");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 0;
  for (let count = 0; count < 32 && offset + 8 <= bytes.length; count++) {
    const length = view.getUint32(offset); const atom = ascii(bytes, offset + 4, offset + 8);
    if (length < 8 || offset + length > bytes.length) return false;
    if (atom === "ftyp" && length >= 16) {
      const brands = [ascii(bytes, offset + 8, offset + 12)];
      for (let i = offset + 16; i + 4 <= offset + length; i += 4) brands.push(ascii(bytes, i, i + 4));
      return extension === "mov" ? brands.includes("qt  ") : brands.some(brand => /^(?:isom|iso[2-9]|mp4[12]|avc1|M4V |MSNV|dash)$/.test(brand));
    }
    if (extension === "mov" && ["moov", "mdat"].includes(atom)) return true;
    offset += length;
  }
  return false;
}

export function validateAssetBytes(bytes: Uint8Array, pathOrFilename: string, mimeType = ""): AssetType {
  const type = getAssetType(pathOrFilename);
  if (!type) throw new Error("不支持此附件格式");
  if (!bytes.length || bytes.length > type.maxBytes) throw new Error(`附件大小需在 0 至 ${type.maxBytes / MiB} MB 之间`);
  const mime = mimeType.split(";")[0].trim().toLowerCase();
  const aliases = type.extension === "csv" ? ["text/plain", "application/csv", "application/vnd.ms-excel"] : [];
  if (mime && mime !== "application/octet-stream" && mime !== type.mimeType && !aliases.includes(mime)) throw new Error("附件声明类型与文件格式不一致");
  let valid = false;
  if (type.extension === "webp") valid = ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP";
  else if (type.extension === "png") valid = startsWith(bytes, [137, 80, 78, 71, 13, 10, 26, 10]);
  else if (["jpg", "jpeg"].includes(type.extension)) valid = startsWith(bytes, [255, 216, 255]);
  else if (type.extension === "pdf") valid = /^%PDF-(?:1\.[0-9]|2\.0)/.test(ascii(bytes, 0, 9));
  else if (["docx", "xlsx", "pptx"].includes(type.extension)) valid = officePackage(bytes, type.extension);
  else if (["doc", "xls", "ppt"].includes(type.extension)) valid = legacyOffice(bytes, type.extension);
  else if (type.kind === "video") valid = videoContainer(bytes, type.extension);
  else if (type.extension === "csv") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      valid = !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text) && !/^\s*</.test(text) && Boolean(text.trim());
    } catch { valid = false; }
  }
  if (!valid) throw new Error("附件内容与格式不符、文档含不支持的活动内容，或文件已损坏，请重新选择");
  return type;
}
