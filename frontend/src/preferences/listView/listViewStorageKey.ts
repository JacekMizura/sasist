export function buildListViewStorageKey(tenantId: number, userId: number, screenId: string): string {
  return `listView.v1:${tenantId}:${userId}:${screenId}`;
}

export function buildListViewCacheMetaKey(tenantId: number, userId: number, screenId: string): string {
  return `${buildListViewStorageKey(tenantId, userId, screenId)}:meta`;
}
