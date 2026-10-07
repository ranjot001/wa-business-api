/**
 * Where one workspace's media lives in R2. Shared because the api writes
 * uploads and the worker writes inbound downloads into the same layout.
 */
export function mediaKey(workspaceId: string, mediaId: string): string {
  return `ws/${workspaceId}/media/${mediaId}`;
}
