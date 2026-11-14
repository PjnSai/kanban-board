import { useState, useEffect } from "react";
import { Routes, Route, Link } from "react-router-dom";
import AuthForm from "./AuthForm";
import { isLoggedIn, logout } from "./auth";
import Dashboard from "./Dashboard";
import BoardView from "./BoardView";
import ResetPasswordPage from "./ResetPasswordPage";
import ProfilePage from "./ProfilePage";
import { ConfirmProvider } from "./ConfirmDialog";
import PageMessage from "./PageMessage";
import NotificationBell from "./NotificationBell";
import NotificationsPage from "./NotificationsPage";
import InvitationsPage from "./InvitationsPage";
import { getMyInvitations, getUserWsTicket } from "./api";
import { openLiveSocket } from "./liveSocket";
import { emitLiveEvent, onLiveEvent } from "./liveEvents";
import ServiceNotice from "./ServiceNotice";

function App() {
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [pendingInvites, setPendingInvites] = useState(0);

  useEffect(() => {
    if (!loggedIn) return;
    const load = () =>
      getMyInvitations()
        .then((list) => setPendingInvites(list.length))
        .catch(() => {});
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    const stopListening = onLiveEvent((message) => {
      if (message.event === "notification" || message.event === "resync") {
        load();
      }
    });
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      stopListening();
    };
  }, [loggedIn]);

  useEffect(() => {
    if (!loggedIn) return;
    const base = import.meta.env.VITE_WS_BASE;
    const connection = openLiveSocket({
      getUrl: async () =>
        `${base}/me/?ticket=${encodeURIComponent(await getUserWsTicket())}`,
      onMessage: (event) => {
        try {
          emitLiveEvent(JSON.parse(event.data));
        } catch {
          // ignore a malformed message
        }
      },
      onResync: () => emitLiveEvent({ event: "resync" }),
    });
    return () => connection.close();
  }, [loggedIn]);

  if (!loggedIn) {
    return (
      <Routes>
        <Route
          path="/reset-password/:uid/:token"
          element={<ResetPasswordPage />}
        />
        <Route
          path="*"
          element={<AuthForm onSuccess={() => setLoggedIn(true)} />}
        />
      </Routes>
    );
  }

  return (
    <ConfirmProvider>
      <div className="min-h-screen bg-slate-50">
        <ServiceNotice />
        <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <Link
            to="/"
            className="text-xl font-semibold text-slate-800 hover:text-blue-600"
          >
            My Boards
          </Link>
          <div className="flex items-center gap-4">
            <NotificationBell />
            <Link
              to="/invitations"
              className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
            >
              Invitations
              {pendingInvites > 0 && (
                <span className="ml-1 rounded-full bg-red-600 text-white text-[10px] font-semibold px-1.5 py-0.5">
                  {pendingInvites}
                </span>
              )}
            </Link>
            <Link
              to="/profile"
              className="text-sm text-slate-500 hover:text-blue-600 transition-colors"
            >
              Profile
            </Link>
            <button
              onClick={async () => {
                await logout();
                setLoggedIn(false);
              }}
              className="text-sm text-slate-500 hover:text-red-600 transition-colors"
            >
              Logout
            </button>
          </div>
        </header>
        <main className="p-6">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/boards/:id" element={<BoardView />} />
            <Route
              path="/profile"
              element={<ProfilePage onLoggedOut={() => setLoggedIn(false)} />}
            />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/invitations" element={<InvitationsPage />} />
            <Route
              path="*"
              element={
                <PageMessage
                  title="Page not found"
                  message="That page doesn't exist."
                />
              }
            />
          </Routes>
        </main>
      </div>
    </ConfirmProvider>
  );
}

export default App;
