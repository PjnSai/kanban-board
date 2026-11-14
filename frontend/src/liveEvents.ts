export interface LiveMessage {
  event: string;
  [key: string]: unknown;
}

const EVENT_NAME = "app:live";

// Pass a live message on to everything in the page that is listening
export function emitLiveEvent(message: LiveMessage) {
  window.dispatchEvent(
    new CustomEvent<LiveMessage>(EVENT_NAME, { detail: message }),
  );
}

// Listen for live messages. Returns a function that stops listening.
export function onLiveEvent(handler: (message: LiveMessage) => void) {
  function listener(e: Event) {
    handler((e as CustomEvent<LiveMessage>).detail);
  }
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
