import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from './apiFetch';
import { createBoard, updateBoard, deleteBoard } from './api';

interface Board {
  id: number;
  name: string;
}

function Dashboard() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState('');
  const [editingBoardId, setEditingBoardId] = useState<number | null>(null);
  const [editBoardName, setEditBoardName] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch('http://localhost:8000/api/boards/')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setBoards(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    try {
      const newBoard = await createBoard(newBoardName);
      setBoards((prev) => [...prev, newBoard]);
      setNewBoardName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    }
  }

  function startEditing(board: Board) {
    setEditingBoardId(board.id);
    setEditBoardName(board.name);
  }

  async function saveEdit(boardId: number) {
    const name = editBoardName.trim();
    setEditingBoardId(null);
    if (!name) return;
    try {
      await updateBoard(boardId, name);
      setBoards((prev) => prev.map((b) => (b.id === boardId ? { ...b, name } : b)));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update board');
    }
  }

  async function handleDelete(boardId: number) {
    if (!window.confirm('Delete this board and everything in it?')) return;
    try {
      await deleteBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete board');
    }
  }

  return (
    <div className="max-w-2xl">
      {error && (
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}

      <form onSubmit={handleCreateBoard} className="flex gap-2 mb-6">
        <input
          type="text"
          placeholder="New board name"
          value={newBoardName}
          onChange={(e) => setNewBoardName(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm flex-1 max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          className="bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          Create Board
        </button>
      </form>

      {loading && <p className="text-slate-400 text-sm">Loading your boards...</p>}

      {!loading && boards.length === 0 && (
        <p className="text-slate-500 text-center py-16">No boards yet — create your first one above.</p>
      )}

      <div className="flex flex-col gap-2">
        {boards.map((board) => (
          <div
            key={board.id}
            className="flex items-center justify-between bg-white border border-slate-200 rounded-lg px-4 py-3 hover:border-blue-300 transition-colors"
          >
            {editingBoardId === board.id ? (
              <input
                type="text"
                value={editBoardName}
                onChange={(e) => setEditBoardName(e.target.value)}
                onBlur={() => saveEdit(board.id)}
                onKeyDown={(e) => e.key === 'Enter' && saveEdit(board.id)}
                autoFocus
                className="text-slate-700 border-b border-blue-400 focus:outline-none"
              />
            ) : (
              <Link to={`/boards/${board.id}`} className="text-slate-700 hover:text-blue-600 flex-1">
                {board.name}
              </Link>
            )}
            <div className="flex items-center gap-2 ml-3">
              <button
                onClick={() => startEditing(board)}
                className="text-xs text-slate-400 hover:text-blue-600"
              >
                Rename
              </button>
              <button
                onClick={() => handleDelete(board.id)}
                className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 text-xs"
                title="Delete board"
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;