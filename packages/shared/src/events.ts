/**
 * Socket.io event names. Every realtime event name in the product lives here
 * and nowhere else. Client and server both import from this file.
 */
export const SOCKET_EVENTS = {
  /** emitted by the server once a client has joined its workspace room */
  CONNECTED: 'connected',
  /** a new inbound or outbound message landed in a conversation */
  MESSAGE_CREATED: 'message.created',
  /** a delivery status moved forward on an existing message */
  MESSAGE_STATUS: 'message.status',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

/** Room helpers so room naming stays consistent across api and worker. */
export const rooms = {
  workspace: (workspaceId: string): string => `workspace:${workspaceId}`,
};

/**
 * Redis pub/sub channel the worker publishes realtime events to.
 *
 * The worker has no socket connections of its own, so it publishes here and
 * the api relays to the workspace room. Task 05 adds that relay; until then
 * the events are published and simply not consumed.
 */
export function workspaceChannel(workspaceId: string): string {
  return `ws:${workspaceId}`;
}

/** Envelope every message on a workspace channel uses. */
export interface WorkspaceEvent<T = unknown> {
  event: SocketEventName;
  workspaceId: string;
  data: T;
}
