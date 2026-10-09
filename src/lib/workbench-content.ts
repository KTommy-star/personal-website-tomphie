export { collections, createDraft, validatePublication, publicationFingerprint } from "../../supabase/functions/_shared/content";
export type { Collection, Draft, PublicArticle } from "../../supabase/functions/_shared/content";

export function assertPublicWorkbenchKey(key: string): void {
  let privileged = /^(sb_secret_|github_pat_|gh[pousr]_)/.test(key.trim());
  const payload = key.split(".")[1];
  if (payload) {
    try {
      const role = JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/"))).role;
      if (role && role !== "anon") privileged = true;
    } catch { /* The provider validates malformed public keys on connection. */ }
  }
  if (privileged) throw new Error("请只配置公开连接密钥；后台权限密钥和 GitHub Token 不能进入网页");
}
