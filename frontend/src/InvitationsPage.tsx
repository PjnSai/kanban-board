import { useCallback, useEffect, useState } from "react";
import {
  getMyInvitations,
  getSentInvitations,
  getInvitationLimits,
  getBlocks,
  acceptInvitation,
  declineInvitation,
  cancelInvitation,
  unblockUser,
  ApiError,
} from "./api";
import type { Invitation, InvitationLimits } from "./api";

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function InvitationsPage() {
  const [received, setReceived] = useState<Invitation[]>([]);
  const [sent, setSent] = useState<Invitation[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [limits, setLimits] = useState<InvitationLimits | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      getMyInvitations(),
      getSentInvitations(),
      getBlocks(),
      getInvitationLimits(),
    ])
      .then(([r, s, b, l]) => {
        setReceived(r);
        setSent(s);
        setBlocked(b);
        setLimits(l);
      })
      .catch((err) => setError(errMsg(err)));
  }, []);

  useEffect(() => {
    load();
    function onVisible() {
      if (document.visibilityState === "visible") load();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("That invitation is no longer available.");
      } else {
        setError(errMsg(err));
      }
    } finally {
      setBusy(false);
      load();
    }
  }

  const card = "bg-white rounded-xl shadow-md p-6";
  const small =
    "rounded-lg px-3 py-1 text-sm transition-colors disabled:opacity-60";

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-6">
      <h2 className="text-2xl font-semibold text-slate-800">Invitations</h2>
      {error && <p className="text-red-600 text-sm">{error}</p>}

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">
          Received ({received.length})
        </h3>
        {received.length === 0 ? (
          <p className="text-sm text-slate-400">No pending invitations.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {received.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
              >
                <span className="flex-1 min-w-48">
                  <strong>{i.inviter}</strong> invited you to{" "}
                  <strong>{i.board_name}</strong> as {i.role}
                </span>
                <button
                  disabled={busy}
                  onClick={() => act(() => acceptInvitation(i.id))}
                  className={`${small} bg-blue-600 text-white hover:bg-blue-700`}
                >
                  Accept
                </button>
                <button
                  disabled={busy}
                  onClick={() => act(() => declineInvitation(i.id))}
                  className={`${small} bg-slate-200 text-slate-700 hover:bg-slate-300`}
                >
                  Decline
                </button>
                <button
                  disabled={busy}
                  onClick={() => act(() => declineInvitation(i.id, true))}
                  className={`${small} text-slate-500 hover:text-red-600`}
                >
                  Decline and block
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-800 mb-3">
          Sent ({sent.length})
        </h3>
        {sent.length === 0 ? (
          <p className="text-sm text-slate-400">
            You have no pending invitations out.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {sent.map((i) => (
              <li
                key={i.id}
                className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
              >
                <span className="flex-1 min-w-48">
                  <strong>{i.invitee}</strong> to{" "}
                  <strong>{i.board_name}</strong> as {i.role}
                </span>
                <button
                  disabled={busy}
                  onClick={() => act(() => cancelInvitation(i.id))}
                  className={`${small} bg-slate-200 text-slate-700 hover:bg-slate-300`}
                >
                  Cancel
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={card}>
        <h3 className="text-lg font-semibold text-slate-800 mb-1">
          Blocked users ({blocked.length})
        </h3>
        <p className="text-sm text-slate-600 mb-3">
          People you block can't invite you.
        </p>
        {blocked.length === 0 ? (
          <p className="text-sm text-slate-400">You haven't blocked anyone.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {blocked.map((name) => (
              <li
                key={name}
                className="flex items-center justify-between text-sm text-slate-700"
              >
                <span>{name}</span>
                <button
                  disabled={busy}
                  onClick={() => act(() => unblockUser(name))}
                  className="text-blue-600 hover:underline disabled:opacity-60"
                >
                  Unblock
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {limits && (
        <section className={card}>
          <h3 className="text-lg font-semibold text-slate-800 mb-3">
            Your limits
          </h3>
          <ul className="text-sm text-slate-600 flex flex-col gap-1">
            <li>
              Pending invitations you've sent: {limits.pending_sent} of{" "}
              {limits.max_pending_sent}
            </li>
            <li>
              Pending invitations you've received: {limits.pending_received} of{" "}
              {limits.max_pending_received}
            </li>
            <li>
              People you've blocked: {limits.blocked} of {limits.max_blocks}
            </li>
            <li>
              Members per board (not counting the owner):{" "}
              {limits.max_members_per_board}
            </li>
            <li>
              Pending invitations per board: {limits.max_pending_per_board}
            </li>
            <li>
              Invitations you can send per hour: {limits.invites_per_hour}
            </li>
          </ul>
        </section>
      )}
    </div>
  );
}

export default InvitationsPage;
