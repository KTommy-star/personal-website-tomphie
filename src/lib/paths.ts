const EXTERNAL_PREFIX = /^(?:[a-z]+:|#)/i;

export function withBase(path: string, base = "/"): string {
  if (EXTERNAL_PREFIX.test(path)) return path;

  const normalizedBase =
    base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  const normalizedPath = path === "/" ? "" : `/${path.replace(/^\/+/, "")}`;

  return `${normalizedBase}${normalizedPath}` || "/";
}
