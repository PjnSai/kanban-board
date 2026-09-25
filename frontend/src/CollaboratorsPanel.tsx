import { useState } from 'react';
import { addCollaborator } from './api';

interface CollaboratorsPanelProps {
  boardId: number;
  collaborators: string[];
  onAdded: (username: string) => void;
}

function CollaboratorsPanel({ boardId, collaborators, onAdded }: CollaboratorsPanelProps) {
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = username.trim();
    if (!name) return;
    setError(null);
    try {
      await addCollaborator(boardId, name);
      onAdded(name);
      setUsername('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add collaborator');
    }
  }

  return (
    <div className="mb-4">
      <div className="flex items-center gap-2 flex-wrap text-sm text-slate-500 mb-2">
        <span>Shared with:</span>
        {collaborators.length === 0 ? (
          <span className="text-slate-400">no one yet</span>
        ) : (
          collaborators.map((name) => (
            <span key={name} className="bg-slate-100 rounded-full px-2 py-0.5 text-slate-600">
              {name}
            </span>
          ))
        )}
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          placeholder="Add collaborator by username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-slate-200 text-slate-700 rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-slate-300 transition-colors"
        >
          Add
        </button>
      </form>
      {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
    </div>
  );
}

export default CollaboratorsPanel;