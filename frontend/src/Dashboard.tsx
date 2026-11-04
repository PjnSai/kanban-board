import { useState, useEffect } from "react";
import { apiFetch } from "./apiFetch";
import { createBoard, updateBoard, deleteBoard } from "./api";
import SortableBoardRow from "./SortableBoardRow";
import InvitesBox from "./InvitesBox";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { updateBoardPosition } from "./api";
import { leaveBoard } from "./api";

const API_BASE = import.meta.env.VITE_API_BASE;

interface Board {
  id: number;
  name: string;
  position: number;
  is_owner: boolean;
}

type View = "all" | "mine" | "shared" | "split";

function Dashboard() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newBoardName, setNewBoardName] = useState("");
  const [editingBoardId, setEditingBoardId] = useState<number | null>(null);
  const [editBoardName, setEditBoardName] = useState("");
  const [view, setView] = useState<View>("all");
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const ownedBoards = boards.filter((b) => b.is_owner);
  const sharedBoards = boards.filter((b) => !b.is_owner);
  const visibleBoards =
    view === "mine" ? ownedBoards : view === "shared" ? sharedBoards : boards;

  useEffect(() => {
    apiFetch(`${API_BASE}/boards/`)
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
      setBoards((prev) => [...prev, { ...newBoard, is_owner: true }]);
      if (view === "shared") setView("all");
      setNewBoardName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create board");
    }
  }

  function startEditing(board: Board) {
    setEditingBoardId(board.id);
    setEditBoardName(board.name);
  }

  function reloadBoards() {
    apiFetch(`${API_BASE}/boards/`)
      .then((res) =>
        res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)),
      )
      .then((data) => setBoards(data))
      .catch((err) => setError(err.message));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = boards.findIndex((b) => b.id === active.id);
    const newIndex = boards.findIndex((b) => b.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    // In side-by-side mode, only reorder within the same column
    if (
      view === "split" &&
      boards[oldIndex].is_owner !== boards[newIndex].is_owner
    )
      return;

    const reordered = arrayMove(boards, oldIndex, newIndex);
    setBoards(reordered);

    reordered.forEach((board, index) => {
      if (board.is_owner) {
        updateBoardPosition(board.id, index).catch(console.error);
      }
    });
  }

  async function saveEdit(boardId: number) {
    const name = editBoardName.trim();
    setEditingBoardId(null);
    if (!name) return;
    try {
      await updateBoard(boardId, name);
      setBoards((prev) =>
        prev.map((b) => (b.id === boardId ? { ...b, name } : b)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update board");
    }
  }

  async function handleDelete(boardId: number) {
    if (!window.confirm("Delete this board and everything in it?")) return;
    try {
      await deleteBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete board");
    }
  }

  async function handleLeave(boardId: number) {
    if (!window.confirm("Leave this board? You will lose access to it."))
      return;
    try {
      await leaveBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave board");
    }
  }

  function renderRows(list: Board[]) {
    return (
      <SortableContext
        items={list.map((b) => b.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex flex-col gap-2">
          {list.map((board) => (
            <SortableBoardRow
              key={board.id}
              board={board}
              isEditing={editingBoardId === board.id}
              editValue={editBoardName}
              onStartEdit={() => startEditing(board)}
              onEditChange={setEditBoardName}
              onSaveEdit={() => saveEdit(board.id)}
              onDelete={() => handleDelete(board.id)}
              onLeave={() => handleLeave(board.id)}
            />
          ))}
        </div>
      </SortableContext>
    );
  }

  return (
    <div className={view === "split" ? "max-w-5xl" : "max-w-2xl"}>
      {error && (
        <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
          {error}
        </p>
      )}
      <InvitesBox onAccepted={reloadBoards} />
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

      <div className="flex flex-wrap gap-2 mb-4">
        {(
          [
            ["all", `All (${boards.length})`],
            ["mine", `Created by me (${ownedBoards.length})`],
            ["shared", `Shared with me (${sharedBoards.length})`],
            ["split", "Side by side"],
          ] as [View, string][]
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setView(value)}
            className={`rounded-full px-3 py-1 text-sm transition-colors ${
              view === value
                ? "bg-blue-600 text-white"
                : "bg-slate-200 text-slate-600 hover:bg-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-slate-400 text-sm">Loading your boards...</p>
      )}

      {!loading && view !== "split" && visibleBoards.length === 0 && (
        <p className="text-slate-500 text-center py-16">
          {boards.length === 0
            ? "No boards yet — create your first one above."
            : view === "shared"
              ? "No boards have been shared with you yet."
              : "You haven't created any boards yet."}
        </p>
      )}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        {view === "split" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <section>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">
                Created by me ({ownedBoards.length})
              </h3>
              {ownedBoards.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  You haven't created any boards yet.
                </p>
              ) : (
                renderRows(ownedBoards)
              )}
            </section>
            <section>
              <h3 className="text-sm font-semibold text-slate-600 mb-2">
                Shared with me ({sharedBoards.length})
              </h3>
              {sharedBoards.length === 0 ? (
                <p className="text-slate-400 text-sm">
                  No boards have been shared with you yet.
                </p>
              ) : (
                renderRows(sharedBoards)
              )}
            </section>
          </div>
        ) : (
          renderRows(visibleBoards)
        )}
      </DndContext>
    </div>
  );
}

export default Dashboard;
