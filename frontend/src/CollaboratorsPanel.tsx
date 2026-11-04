import { useEffect, useState } from "react";
import {
  removeCollaborator,
  getBoardInvitations,
  sendInvitation,
  cancelInvitation,
} from "./api";
import type { Invitation } from "./api";

interface CollaboratorsPanelProps {
  boardId: number;
  collaborators: string[];
  isOwner: boolean;
  onAdded?: (username: string) => void; // unused: people now join by accepting an invitation
  onRemoved: (username: string) => void;
}

function CollaboratorsPanel({
  boardId,
  collaborators,
  isOwner,
  onRemoved,
}: CollaboratorsPanelProps) {
  const [username, setUsername] = useState("");
  const [pending, setPending] = useState<Invitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!isOwner) return;
    getBoardInvitations(boardId)
      .then(setPending)
      .catch(() => {});
  }, [boardId, isOwner, collaborators.length]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name || sending) return;
    setError(null);
    setMessage(null);
    setSending(true);
    try {
      const invitation = await sendInvitation(boardId, name);
      setPending((prev) => [...prev, invitation]);
      setUsername("");
      setMessage(`Invitation sent to ${invitation.invitee}.`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send invitation",
      );
    } finally {
      setSending(false);
    }
  }

  async function handleCancel(id: number) {
    try {
      await cancelInvitation(id);
      setPending((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to cancel invitation",
      );
    }
  }

  async function handleRemove(name: string) {
    try {
      await removeCollaborator(boardId, name);
      onRemoved(name);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove collaborator",
      );
    }
  }

  return (
    <div className="mb-4 bg-white border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500 mb-2">
        <span>Shared with:</span>
        {collaborators.length === 0 ? (
          <span className="text-slate-400">no one yet</span>
        ) : (
          collaborators.map((name) => (
            <span
              key={name}
              className="bg-slate-100 rounded-full px-2 py-0.5 text-slate-600 flex items-center gap-1"
            >
              {name}
              {isOwner && (
                <button
                  onClick={() => handleRemove(name)}
                  className="text-slate-400 hover:text-red-600"
                  title="Remove collaborator"
                >
                  ✕
                </button>
              )}
            </span>
          ))
        )}
      </div>

      {isOwner && pending.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500 mb-2">
          <span>Pending invitations:</span>
          {pending.map((invite) => (
            <span
              key={invite.id}
              className="bg-blue-50 rounded-full px-2 py-0.5 text-slate-600 flex items-center gap-1"
            >
              {invite.invitee}
              <button
                onClick={() => handleCancel(invite.id)}
                className="text-slate-400 hover:text-red-600"
                title="Cancel invitation"
              >
                ✕
              </button>
            </span>
          ))}
        </div>
      )}

      {isOwner && (
        <form onSubmit={handleInvite} className="flex gap-2">
          <input
            type="text"
            placeholder="Invite someone by username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={sending}
            className="bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-300 transition-colors disabled:opacity-60"
          >
            {sending ? "Sending..." : "Invite"}
          </button>
        </form>
      )}
      {message && <p className="text-green-600 text-sm mt-1">{message}</p>}
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}

export default CollaboratorsPanel;
