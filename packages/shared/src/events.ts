/**
 * Socket.io event names. Every realtime event name in the product lives here
 * and nowhere else. Client and server both import from this file.
 */
export const SOCKET_EVENTS = {
  /** emitted by the server once a client has joined its workspace room */
  CONNECTED: 'connected',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Room helpers so room naming stays consistent across api and worker. */
export const rooms = {
  workspace: (workspaceId: string): string => `workspace:${workspaceId}`,
};
