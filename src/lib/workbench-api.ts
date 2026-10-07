import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Collection, Draft } from "./workbench-content";

interface Config { url: string; key: string; username: string; email: string }
export function createWorkbenchApi(config: Config) {
  const configured = Boolean(config.url && config.key && config.email && config.username);
  let ownerId = "";
  let remember = false;
  const key = "tomphie-workbench-session";
  const storage = {
    getItem(name: string) { return localStorage.getItem(name) ?? sessionStorage.getItem(name); },
    setItem(name: string, value: string) { (remember ? localStorage : sessionStorage).setItem(name, value); (remember ? sessionStorage : localStorage).removeItem(name); },
    removeItem(name: string) { localStorage.removeItem(name); sessionStorage.removeItem(name); },
  };
  let client: SupabaseClient | undefined;
  const connection = () => {
    if (!configured) throw new Error("工作台尚未连接私密服务，请先完成部署配置");
    remember = Boolean(localStorage.getItem(key));
    client ??= createClient(config.url, config.key, { auth: { storage, storageKey: key, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
    return client;
  };
  const verifyOwner = async () => {
    const api = connection();
    const { data, error } = await api.auth.getUser();
    if (error || !data.user) throw new Error("登录已失效，请重新登录");
    const result = await api.rpc("is_workbench_owner");
    if (result.error || result.data !== true) {
      await api.auth.signOut({ scope: "local" });
      throw new Error("该账号没有工作台权限");
    }
    ownerId = data.user.id;
  };
  const invoke = async (body: Record<string, unknown>) => {
    const result = await connection().functions.invoke("publish-content", { body });
    if (result.error) {
      let message = "发布服务暂时不可用，请稍后重试";
      if (result.error.context instanceof Response) {
        const detail = await result.error.context.json().catch(() => null);
        if (typeof detail?.error === "string") message = detail.error;
      }
      throw new Error(message);
    }
    return result.data;
  };
  return {
    configured,
    async signIn(account: string, password: string, keep: boolean) {
      if (account.trim() !== config.username && account.trim().toLowerCase() !== config.email.toLowerCase()) throw new Error("账号或密码不正确");
      const api = connection(); remember = keep;
      const { error } = await api.auth.signInWithPassword({ email: config.email, password });
      if (error) throw new Error("登录失败，请检查账号密码，或稍后重试");
      await verifyOwner();
    },
    async restoreSession() {
      if (!configured) return false;
      const { data } = await connection().auth.getSession();
      if (!data.session) return false;
      await verifyOwner(); return true;
    },
    async signOut() {
      const { error } = await connection().auth.signOut({ scope: "local" });
      if (error) throw new Error("退出失败，请稍后重试");
      storage.removeItem(key); ownerId = "";
    },
    async listDrafts(collection: Collection): Promise<Draft[]> {
      const result = await connection().from("workbench_drafts").select("*").eq("collection", collection).order("updated_at", { ascending: false });
      if (result.error) throw new Error("无法读取私密草稿，请检查连接或重新登录");
      return result.data as Draft[];
    },
    async saveDraft(draft: Draft): Promise<Draft> {
      const result = await connection().rpc("save_workbench_draft", { draft_id: draft.id, draft_collection: draft.collection, draft_slug: draft.slug, draft_metadata: draft.metadata, draft_body: draft.body, expected_revision: draft.revision }).single();
      if (result.error) throw new Error(result.error.code === "40001" ? "版本冲突：另一台设备已修改，本机内容已保留，请先导出或复制后重新载入" : result.error.code === "23505" ? "该链接已存在，请换一个链接标识" : result.error.message);
      return result.data as Draft;
    },
    async deleteDraft(draft: Draft): Promise<void> {
      const result = await connection().rpc("delete_workbench_draft", { draft_id: draft.id, expected_revision: draft.revision });
      if (result.error) throw new Error(result.error.code === "40001" ? "其他设备已更新这篇草稿，未删除。请重新载入后再确认。" : result.error.code === "PGRST202" ? "删除权限尚未启用，请先执行工作台升级 SQL。" : "草稿删除失败，内容仍保留。请检查连接与管理员权限。");
    },
    async uploadImage(draftId: string, file: Blob) {
      if (!ownerId) await verifyOwner();
      const suffix = file.type === "image/webp" ? "webp" : file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : "";
      if (!suffix || file.size > 2 * 1024 * 1024) throw new Error("图片只支持 WebP、PNG、JPEG，最大 2 MB");
      const path = `${ownerId}/${draftId}/${crypto.randomUUID()}.${suffix}`;
      const { error } = await connection().storage.from("workbench-private").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error("图片上传失败，请检查连接与私密存储配置");
      return `asset://${path}`;
    },
    async previewAsset(reference: string) {
      if (!reference.startsWith("asset://")) throw new Error("不是私密图片引用");
      const { data, error } = await connection().storage.from("workbench-private").createSignedUrl(reference.slice(8), 600);
      if (error || !data) throw new Error("私密图片预览暂时不可用");
      return data.signedUrl;
    },
    async publishDraft(draft: Draft): Promise<{ commit: string; url: string; warning?: string; duplicate?: boolean; fingerprint?: string }> {
      return invoke({ action: "publish", draftId: draft.id, revision: draft.revision });
    },
    async getPublishStatus(commit: string): Promise<{ state: "pending" | "success" | "failure"; url: string }> {
      return invoke({ action: "status", commit });
    },
  };
}
