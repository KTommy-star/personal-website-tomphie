interface Entry { id: string; data: { visibility: string; draft: boolean; publishedAt?: Date; updatedAt?: Date } }
export function publicEntries<T extends Entry>(entries: T[]): T[] {
  return entries.filter(entry => entry.data.visibility === "public" && entry.data.draft === false)
    .sort((a, b) => (b.data.publishedAt?.getTime() ?? 0) - (a.data.publishedAt?.getTime() ?? 0));
}
export function matchingEntry(text: string, search: string, filter: string, topic: string): boolean {
  return text.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()) && (!filter || filter === topic);
}
