import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  getMembers,
  setMemberRole,
  removeMember,
  leaveBoard,
  getBoardInvitations,
  sendInvitation,
  cancelInvitation,
} from "./api";
import type { Member, Invitation } from "./api";

interface MembersPanelProps {
  boardId: number;
  myRole: string | null;
  memberCount: number;
  onRemoved: (username: string) => void;
}

const LABELS: Record<string, string> = {
  owner: "Owner",
  manager: "Manager",
  editor: "Editor",
  viewer: "Viewer",
};

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : "Something went wrong";
}

function MembersPanel({
  boardId,
  myRole,
  memberCount,
  onRemoved,
}: MembersPanelProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [pending, setPending] = useState<Invitation[]>([]);
  const [username, setUsername] = useState("");
  const [inviteRole, setInviteRole] = useState("editor");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);

  const isOwner = myRole === "owner";
  const canInvite = isOwner || myRole === "manager";
  const inviteRoles = isOwner
    ? ["viewer", "editor", "manager"]
    : ["viewer", "editor"];

  useEffect(() => {
    if (!open) return;
    getMembers(boardId)
      .then(setMembers)
      .catch((err) => setError(errMsg(err)));
    if (canInvite) {
      getBoardInvitations(boardId)
        .then(setPending)
        .catch(() => {});
    }
  }, [open, boardId, canInvite, memberCount, version]);

  async function run(action: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  function canRemove(member: Member) {
    if (member.role === "owner") return false;
    if (isOwner) return true;
    return (
      myRole === "manager" &&
      (member.role === "editor" || member.role === "viewer")
    );
  }

  function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    run(async () => {
      const invitation = await sendInvitation(boardId, name, inviteRole);
      setUsername("");
      setMessage(`Invitation sent to ${invitation.invitee}.`);
    });
  }

  function handleRemove(name: string) {
    if (!window.confirm(`Remove ${name} from this board?`)) return;
    run(async () => {
      await removeMember(boardId, name);
      onRemoved(name);
    });
  }

  function handleRole(name: string, role: string) {
    run(async () => {
      await setMemberRole(boardId, name, role);
      setMessage(`${name} is now a ${LABELS[role].toLowerCase()}.`);
    });
  }

  function handleCancel(id: number) {
    run(() => cancelInvitation(id));
  }

  function handleLeave() {
    if (!window.confirm("Leave this board? You will lose access to it."))
      return;
    run(async () => {
      await leaveBoard(boardId);
      navigate("/");
    });
  }

  const small =
    "text-sm rounded-lg px-3 py-1.5 transition-colors disabled:opacity-60";

  return (
    <div className="mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`${small} bg-slate-200 text-slate-700 hover:bg-slate-300`}
      >
        Members ({memberCount + 1}) {open ? "▲" : "▼"}
      </button>

      {open && (
        <div className="mt-2 bg-white border border-slate-200 rounded-lg p-4 max-w-xl">
          <p className="text-xs text-slate-400 mb-3">
            Your role: {myRole ? LABELS[myRole] : "none"}
          </p>

          <ul className="flex flex-col gap-2 mb-4">
            {members.map((member) => (
              <li
                key={member.username}
                className="flex items-center gap-2 text-sm text-slate-700"
              >
                <span className="flex-1">{member.username}</span>
                {isOwner && member.role !== "owner" ? (
                  <select
                    value={member.role}
                    disabled={busy}
                    onChange={(e) =>
                      handleRole(member.username, e.target.value)
                    }
                    className="border border-slate-300 rounded px-2 py-1 text-sm"
                  >
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="manager">Manager</option>
                  </select>
                ) : (
                  <span className="bg-slate-100 rounded-full px-2 py-0.5 text-slate-600">
                    {LABELS[member.role]}
                  </span>
                )}
                {canRemove(member) && (
                  <button
                    disabled={busy}
                    onClick={() => handleRemove(member.username)}
                    className="text-slate-400 hover:text-red-600 disabled:opacity-60"
                    title="Remove from board"
                  >
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>

          {canInvite && pending.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-slate-600 mb-1">
                Pending invitations
              </h4>
              <ul className="flex flex-col gap-1">
                {pending.map((invite) => (
                  <li
                    key={invite.id}
                    className="flex items-center gap-2 text-sm text-slate-600"
                  >
                    <span className="flex-1">
                      {invite.invitee} as {invite.role}, invited by{" "}
                      {invite.inviter}
                    </span>
                    <button
                      disabled={busy}
                      onClick={() => handleCancel(invite.id)}
                      className="text-slate-400 hover:text-red-600 disabled:opacity-60"
                      title="Cancel invitation"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {canInvite && (
            <form onSubmit={handleInvite} className="flex flex-wrap gap-2 mb-2">
              <input
                type="text"
                placeholder="Invite someone by username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-40 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm"
              >
                {inviteRoles.map((role) => (
                  <option key={role} value={role}>
                    {LABELS[role]}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busy}
                className={`${small} bg-blue-600 text-white hover:bg-blue-700`}
              >
                Invite
              </button>
            </form>
          )}

          {message && <p className="text-green-600 text-sm mt-1">{message}</p>}
          {error && <p className="text-red-600 text-sm mt-1">{error}</p>}

          {myRole && !isOwner && (
            <button
              disabled={busy}
              onClick={handleLeave}
              className="mt-3 text-sm text-slate-500 hover:text-red-600 disabled:opacity-60"
            >
              Leave this board
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default MembersPanel;
