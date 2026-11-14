import { useEffect, useState } from "react";

function ServiceNotice() {
  const [status, setStatus] = useState<number | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function onNotice(e: Event) {
      setStatus((e as CustomEvent<{ status: number }>).detail.status);
      clearTimeout(timer);
      timer = setTimeout(() => setStatus(null), 8000);
    }
    window.addEventListener("app:service-notice", onNotice);
    return () => {
      window.removeEventListener("app:service-notice", onNotice);
      clearTimeout(timer);
    };
  }, []);

  if (status === null) return null;

  const message =
    status === 429
      ? "You're doing that a bit too quickly. Please wait a moment and try again."
      : "The service is busy or waking up. Please try again in a few seconds.";

  return (
    <div
      role="status"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-50 max-w-sm w-[90vw] bg-amber-50 border border-amber-200 text-slate-700 text-sm rounded-lg px-4 py-3 shadow-lg flex items-start gap-3"
    >
      <span className="flex-1">{message}</span>
      <button
        onClick={() => setStatus(null)}
        className="text-slate-400 hover:text-slate-700"
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

export default ServiceNotice;
