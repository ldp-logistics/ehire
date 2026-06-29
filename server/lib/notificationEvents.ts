/**
 * Lightweight in-process event bus for notification refresh signals.
 * When any service performs a state-changing action (leave approval, CR update, etc.),
 * it calls emitRefreshAll() which pushes a refresh signal to all connected SSE clients.
 */
import { EventEmitter } from "events";

const emitter = new EventEmitter();
emitter.setMaxListeners(0); // No warning for large concurrent user counts

const REFRESH_EVENT = "notification:refresh";

/** Broadcast a refresh signal to all connected clients. */
export function emitRefreshAll(): void {
  emitter.emit(REFRESH_EVENT);
}

export const notificationEmitter = emitter;
export { REFRESH_EVENT };
