import { useEffect, useState } from "react";
import { getMyInvitations, acceptInvitation, declineInvitation } from "./api";
import type { Invitation } from "./api";

function InvitesBox({ onAccepted }: { onAccepted: () => void }) {
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  useEffect(() => {
    getMyInvitations()
      .then(setInvites)
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load invitations",
        ),
      );
  }, []);

  async function respond(id: number, action: "accept" | "decline" | "block") {
    if (busyId !== null) return;
    setBusyId(id);
    setError(null);
    try {
      if (action === "accept") {
        await acceptInvitation(id);
        onAccepted();
      } else {
        await declineInvitation(id, action === "block");
      }
      setInvites((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusyId(null);
    }
  }

  if (invites.length === 0 && !error) return null;

  const button =
    "rounded-lg px-3 py-1 text-sm transition-colors disabled:opacity-60";

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <h3 className="text-sm font-semibold text-slate-700 mb-2">Invitations</h3>
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}
      <ul className="flex flex-col gap-2">
        {invites.map((invite) => (
          <li
            key={invite.id}
            className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
          >
            <span className="flex-1">
              <strong>{invite.inviter}</strong> invited you to{" "}
              <strong>{invite.board_name}</strong>
            </span>
            <button
              disabled={busyId !== null}
              onClick={() => respond(invite.id, "accept")}
              className={`${button} bg-blue-600 text-white hover:bg-blue-700`}
            >
              Accept
            </button>
            <button
              disabled={busyId !== null}
              onClick={() => respond(invite.id, "decline")}
              className={`${button} bg-slate-200 text-slate-700 hover:bg-slate-300`}
            >
              Decline
            </button>
            <button
              disabled={busyId !== null}
              onClick={() => respond(invite.id, "block")}
              className={`${button} text-slate-500 hover:text-red-600`}
            >
              Decline and block
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default InvitesBox;
