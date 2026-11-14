import { ApiError } from "./api";

export interface LiveSocketOptions {
  // Returns the full WebSocket address, including a fresh ticket
  getUrl: () => Promise<string>;
  onMessage: (event: MessageEvent) => void;
  // Called after a reconnect and when the tab becomes visible again, to catch up on missed events
  onResync?: () => void;
  // Called when we stop for good: the connection cap was hit, or access was lost
  onGiveUp?: (reason: "cap" | "no-access") => void;
}

const BASE_DELAY = 2000;
const MAX_DELAY = 30000;
// 4401: signed out, 4403: no access, 4409: too many connections. Never reconnect after these.
const NO_RECONNECT = new Set([4401, 4403, 4409]);

export function openLiveSocket(options: LiveSocketOptions) {
  let socket: WebSocket | undefined;
  let stopped = false;
  let connecting = false;
  let hasConnectedBefore = false;
  let delay = BASE_DELAY;
  let timer: ReturnType<typeof setTimeout> | undefined;

  function schedule() {
    if (stopped) return;
    clearTimeout(timer);
    const wait = delay + Math.random() * 1000;
    delay = Math.min(delay * 2, MAX_DELAY);
    timer = setTimeout(connect, wait);
  }

  function stop() {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
    socket?.close();
    socket = undefined;
  }

  async function connect() {
    if (stopped || connecting) return;
    connecting = true;
    let url: string;
    try {
      url = await options.getUrl();
    } catch (err) {
      connecting = false;
      const status = err instanceof ApiError ? err.status : undefined;
      if (status === 401 || status === 403 || status === 404) {
        stop();
        options.onGiveUp?.("no-access");
        return;
      }
      schedule();
      return;
    }
    connecting = false;
    if (stopped) return;

    const ws = new WebSocket(url);
    socket = ws;
    ws.onopen = () => {
      delay = BASE_DELAY;
      if (hasConnectedBefore) options.onResync?.();
      hasConnectedBefore = true;
    };
    ws.onmessage = options.onMessage;
    ws.onclose = (event) => {
      if (socket === ws) socket = undefined;
      if (stopped) return;
      if (NO_RECONNECT.has(event.code)) {
        stop();
        options.onGiveUp?.(event.code === 4409 ? "cap" : "no-access");
        return;
      }
      schedule();
    };
  }

  function onVisible() {
    if (document.visibilityState !== "visible" || stopped) return;
    options.onResync?.();
    if (!socket && !connecting) {
      delay = BASE_DELAY;
      clearTimeout(timer);
      connect();
    }
  }

  document.addEventListener("visibilitychange", onVisible);
  connect();

  return { close: stop };
}
