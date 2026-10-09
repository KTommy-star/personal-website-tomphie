import type { Draft, PublicArticle } from "./workbench-content";

export interface DirectoryEntry { key: string; draft?: Draft; article?: PublicArticle; published: boolean }
export function draftIdentity(draft: Draft) {
  return `${draft.published_collection || draft.collection}/${draft.published_slug || draft.slug}`;
}
export function mergeDirectory(drafts: Draft[], articles: PublicArticle[], catalogReady: boolean): DirectoryEntry[] {
  const remaining = new Map(articles.map(article => [`${article.collection}/${article.slug}`, article]));
  const entries: DirectoryEntry[] = drafts.map(draft => {
    const key = draftIdentity(draft);
    const article = remaining.get(key);
    remaining.delete(key);
    return { key, draft, article, published: Boolean(article || (!catalogReady && draft.published_commit)) };
  });
  return [...entries, ...Array.from(remaining, ([key, article]) => ({ key, article, published: true }))];
}
export function filterDirectory(entries: DirectoryEntry[], filter: string) {
  return entries.filter(entry => filter === "all" || (filter === "published" ? entry.published : !entry.published));
}
