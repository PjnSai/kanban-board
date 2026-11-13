import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getAllNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  clearNotifications,
} from "./api";
import type { AppNotification } from "./api";
import { useChoose } from "./confirmContext";

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

function destination(n: AppNotification): string {
  const stayAway = ["removed", "board_deleted"];
  if (n.kind === "invited" || n.kind === "invite_cancelled")
    return "/invitations";
  if (n.board_id && !stayAway.includes(n.kind)) return `/boards/${n.board_id}`;
  return "/";
}

function NotificationsPage() {
  const navigate = useNavigate();
  const choose = useChoose();
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    getAllNotifications()
      .then((data) => {
        setItems(data.notifications);
        setUnread(data.unread);
        setError(null);
      })
      .catch(() => setError("Could not load your notifications."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  const shown = filter === "unread" ? items.filter((n) => !n.read) : items;

  function open(n: AppNotification) {
    if (!n.read) {
      markNotificationRead(n.id).catch(() => {});
      setItems((prev) =>
        prev.map((i) => (i.id === n.id ? { ...i, read: true } : i)),
      );
      setUnread((c) => Math.max(0, c - 1));
    }
    navigate(destination(n));
  }

  function markAll() {
    markAllNotificationsRead().catch(() => {});
    setItems((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnread(0);
  }

  function remove(n: AppNotification) {
    deleteNotification(n.id)
      .then(load)
      .catch(() => setError("Could not delete that notification."));
    setItems((prev) => prev.filter((i) => i.id !== n.id));
    if (!n.read) setUnread((c) => Math.max(0, c - 1));
  }

  async function clear() {
    const result = await choose({
      title: "Delete notifications?",
      message:
        "This removes them for good. You can delete only the ones you've already read, or everything.",
      confirmLabel: "Delete everything",
      secondaryLabel: "Delete read only",
      danger: true,
    });
    if (result === "cancel") return;
    clearNotifications(result === "confirm" ? "all" : "read")
      .then(load)
      .catch(() => setError("Could not delete your notifications."));
  }

  const tab = (value: "all" | "unread", label: string) => (
    <button
      onClick={() => setFilter(value)}
      className={`rounded-full px-3 py-1 text-sm transition-colors ${
        filter === value
          ? "bg-blue-600 text-white"
          : "bg-slate-200 text-slate-600 hover:bg-slate-300"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-2xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <h2 className="text-2xl font-semibold text-slate-800">Notifications</h2>
        <div className="flex gap-3 text-sm">
          {unread > 0 && (
            <button onClick={markAll} className="text-blue-600 hover:underline">
              Mark all as read
            </button>
          )}
          {items.length > 0 && (
            <button
              onClick={clear}
              className="text-slate-500 hover:text-red-600 hover:underline"
            >
              Delete all
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {tab("all", `All (${items.length})`)}
        {tab("unread", `Unread (${unread})`)}
      </div>

      <p className="text-xs text-slate-400 mb-3">
        Up to 50 notifications are kept. Older ones are removed automatically,
        and read ones are removed after 30 days.
      </p>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}
      {loading && <p className="text-slate-400 text-sm">Loading...</p>}

      {!loading && shown.length === 0 ? (
        <p className="text-slate-500 text-center py-12">
          {filter === "unread"
            ? "No unread notifications."
            : "You have no notifications."}
        </p>
      ) : (
        <ul className="bg-white rounded-xl shadow-md divide-y divide-slate-100">
          {shown.map((n) => (
            <li
              key={n.id}
              className={`flex items-start ${n.read ? "" : "bg-blue-50"}`}
            >
              <button
                onClick={() => open(n)}
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
                    {n.dismissed ? " · cleared from the bell" : ""}
                  </span>
                </span>
              </button>
              <button
                onClick={() => remove(n)}
                className="px-3 py-3 text-slate-300 hover:text-red-600"
                title="Delete this notification"
                aria-label="Delete this notification"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPage;
