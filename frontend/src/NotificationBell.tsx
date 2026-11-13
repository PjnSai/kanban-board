import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  getBellNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  dismissNotification,
  dismissAllNotifications,
} from "./api";
import type { AppNotification } from "./api";

const PREVIEW_COUNT = 5;

function timeAgo(iso: string) {
  const seconds = Math.max(
    0,
    Math.round((Date.now() - new Date(iso).getTime()) / 1000),
  );
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

// Where a notification should take you when you click it
function destination(n: AppNotification): string {
  const boardGoneOrOnDashboard = [
    "invited",
    "invite_cancelled",
    "removed",
    "board_deleted",
  ];
  if (n.board_id && !boardGoneOrOnDashboard.includes(n.kind)) {
    return `/boards/${n.board_id}`;
  }
  if (n.kind === "invited" || n.kind === "invite_cancelled") {
    return "/invitations";
  }
  return "/";
}

function NotificationBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [total, setTotal] = useState(0);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const container = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    getBellNotifications(PREVIEW_COUNT)
      .then((data) => {
        setItems(data.notifications);
        setUnread(data.unread);
        setTotal(data.bell_total);
        setError(null);
      })
      .catch(() => setError("Could not load notifications."));
  }, []);

  // Load on first show, and again whenever the tab becomes visible
  useEffect(() => {
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  // Close on Escape or a click outside
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (container.current && !container.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function toggle() {
    if (!open) load();
    setOpen((o) => !o);
  }

  function handleClick(n: AppNotification) {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read: true } : item)),
      );
      setUnread((count) => Math.max(0, count - 1));
    }
    setOpen(false);
    navigate(destination(n));
  }

  function handleMarkAll() {
    markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((item) => ({ ...item, read: true })));
    setUnread(0);
  }

  function handleDismiss(n: AppNotification) {
    dismissNotification(n.id)
      .then(load)
      .catch(() => setError("Could not clear that notification."));
    setItems((prev) => prev.filter((item) => item.id !== n.id));
    setTotal((count) => Math.max(0, count - 1));
    if (!n.read) setUnread((count) => Math.max(0, count - 1));
  }

  function handleClear() {
    dismissAllNotifications()
      .then(load)
      .catch(() => setError("Could not clear your notifications."));
    setItems([]);
    setTotal(0);
    setUnread(0);
  }

  return (
    <div ref={container} className="relative">
      <button
        onClick={toggle}
        aria-label={`Notifications${unread > 0 ? `, ${unread} unread` : ""}`}
        aria-expanded={open}
        className="relative p-1.5 rounded-full text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-red-600 text-white text-[10px] font-semibold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-80 max-w-[90vw] bg-white border border-slate-200 rounded-lg shadow-lg z-40">
          <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">
              Notifications
            </h3>
            <div className="flex gap-3">
              {unread > 0 && (
                <button
                  onClick={handleMarkAll}
                  className="text-xs text-blue-600 hover:underline"
                >
                  Mark all as read
                </button>
              )}
              {total > 0 && (
                <button
                  onClick={handleClear}
                  className="text-xs text-slate-500 hover:text-red-600 hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
          </div>

          {error && <p className="px-4 py-3 text-sm text-red-600">{error}</p>}

          {!error && items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-400 text-center">
              You're all caught up.
            </p>
          ) : (
            <ul>
              {items.map((n) => (
                <li
                  key={n.id}
                  className={`flex items-start border-b border-slate-50 ${
                    n.read ? "" : "bg-blue-50"
                  }`}
                >
                  <button
                    onClick={() => handleClick(n)}
                    className="flex-1 min-w-0 text-left px-4 py-3 hover:bg-slate-50 flex gap-2"
                  >
                    <span
                      className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                        n.read ? "bg-transparent" : "bg-blue-600"
                      }`}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm text-slate-700">
                        {n.message}
                      </span>
                      <span className="block text-xs text-slate-400 mt-0.5">
                        {timeAgo(n.created_at)}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => handleDismiss(n)}
                    className="px-3 py-3 text-slate-300 hover:text-red-600"
                    title="Remove from this list"
                    aria-label="Remove from this list"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="px-4 py-2 border-t border-slate-100 text-center">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-sm text-blue-600 hover:underline"
            >
              View all notifications
              {total > PREVIEW_COUNT ? ` (${total})` : ""}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationBell;
