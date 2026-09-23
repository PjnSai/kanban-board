import { useEffect, useState } from 'react';
import ListColumn from './ListColumn';
import { updateCard } from './api';
import AuthForm from './AuthForm';
import { isLoggedIn, clearTokens } from './auth';
import { clientId } from './api';
import { apiFetch } from './apiFetch';
import { createBoard } from './api';
import { createList } from './api';
import { createCard } from './api';
import { updateBoard } from './api';
import { updateList } from './api';
import { updateCardTitle } from './api';
import { deleteBoard, deleteList, deleteCard } from './api';
import { DndContext, closestCenter, useSensor, useSensors, PointerSensor, DragOverlay } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

interface Card {
  id: number;
  title: string;
  description: string;
  position: number;
}

interface List {
  id: number;
  name: string;
  position: number;
  cards: Card[];
}

interface Board {
  id: number;
  name: string;
  lists: List[];
}

function App() {
  const [boards, setBoards] = useState<Board[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(isLoggedIn());
  const [loading, setLoading] = useState(true);
  const [newBoardName, setNewBoardName] = useState('');
  const [newListName, setNewListName] = useState<{ [boardId: number]: string }>({});
  const [newCardTitle, setNewCardTitle] = useState<{ [listId: number]: string }>({});
  const [editingBoardId, setEditingBoardId] = useState<number | null>(null);
  const [editBoardName, setEditBoardName] = useState('');
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editListName, setEditListName] = useState('');
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editCardTitle, setEditCardTitle] = useState('');
  const [activeCard, setActiveCard] = useState<Card | null>(null);

  


  useEffect(() => {
      if (!loggedIn) return;
      setLoading(true);
      apiFetch('http://localhost:8000/api/boards/')
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data) => setBoards(data))
        .catch((err) => setError(err.message))
        .finally(() => setLoading(false));
    }, [loggedIn]);

  useEffect(() => {
  if (!loggedIn || boards.length === 0) return;

  const boardId = boards[0].id; // for now, assuming one board - we'll generalize later
  const ws = new WebSocket(`ws://localhost:8000/ws/boards/${boardId}/`);

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.origin === clientId) return; // ignore our own echoed change

    if (data.event === 'card_moved') {
      setBoards((prevBoards) =>
        prevBoards.map((board) => {
          const newLists = board.lists.map((l) => ({ ...l, cards: [...l.cards] }));
          let movedCard: Card | undefined;

          newLists.forEach((list) => {
            const idx = list.cards.findIndex((c) => c.id === data.card_id);
            if (idx !== -1) {
              [movedCard] = list.cards.splice(idx, 1);
            }
          });

          if (movedCard) {
            const destList = newLists.find((l) => l.id === data.list_id);
            destList?.cards.splice(data.position, 0, movedCard);
          }

          return { ...board, lists: newLists };
        })
      );
    }
  };

    return () => ws.close();
  }, [loggedIn, boards.length]);

  async function handleCreateBoard(e: React.FormEvent) {
    e.preventDefault();
    if (!newBoardName.trim()) return;
    try {
      const newBoard = await createBoard(newBoardName);
      setBoards((prev) => [...prev, { ...newBoard, lists: [] }]);
      setNewBoardName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create board');
    }
  }

  async function handleCreateList(boardId: number, e: React.FormEvent) {
    e.preventDefault();
    const name = newListName[boardId]?.trim();
    if (!name) return;
    try {
      const newList = await createList(boardId, name);
      setBoards((prev) =>
        prev.map((b) =>
          b.id === boardId ? { ...b, lists: [...b.lists, { ...newList, cards: [] }] } : b
        )
      );
      setNewListName((prev) => ({ ...prev, [boardId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
    }
  }

  async function handleCreateCard(listId: number, e: React.FormEvent) {
    e.preventDefault();
    const title = newCardTitle[listId]?.trim();
    if (!title) return;
    try {
      const newCard = await createCard(listId, title);
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          lists: board.lists.map((list) =>
            list.id === listId ? { ...list, cards: [...list.cards, newCard] } : list
          ),
        }))
      );
      setNewCardTitle((prev) => ({ ...prev, [listId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create card');
    }
  }
  function startEditingBoard(board: Board) {
    setEditingBoardId(board.id);
    setEditBoardName(board.name);
  }

  async function saveEditBoard(boardId: number) {
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

  function startEditingList(list: { id: number; name: string }) {
    setEditingListId(list.id);
    setEditListName(list.name);
  }

  async function saveEditList(listId: number) {
    const name = editListName.trim();
    setEditingListId(null);
    if (!name) return;
    try {
      await updateList(listId, name);
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          lists: board.lists.map((l) => (l.id === listId ? { ...l, name } : l)),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update list');
    }
  }

  function startEditingCard(card: { id: number; title: string }) {
    setEditingCardId(card.id);
    setEditCardTitle(card.title);
  }

  async function saveEditCard(cardId: number) {
    const title = editCardTitle.trim();
    setEditingCardId(null);
    if (!title) return;
    try {
      await updateCardTitle(cardId, title);
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          lists: board.lists.map((list) => ({
            ...list,
            cards: list.cards.map((c) => (c.id === cardId ? { ...c, title } : c)),
          })),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update card');
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

  async function handleDeleteBoard(boardId: number) {
    if (!window.confirm('Delete this board and everything in it?')) return;
    try {
      await deleteBoard(boardId);
      setBoards((prev) => prev.filter((b) => b.id !== boardId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete board');
    }
  }

  async function handleDeleteList(listId: number) {
    if (!window.confirm('Delete this list and its cards?')) return;
    try {
      await deleteList(listId);
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          lists: board.lists.filter((l) => l.id !== listId),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list');
    }
  }

  async function handleDeleteCard(cardId: number) {
    try {
      await deleteCard(cardId);
      setBoards((prev) =>
        prev.map((board) => ({
          ...board,
          lists: board.lists.map((list) => ({
            ...list,
            cards: list.cards.filter((c) => c.id !== cardId),
          })),
        }))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete card');
    }
  }

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as number;
    for (const board of boards) {
      for (const list of board.lists) {
        const found = list.cards.find((c) => c.id === cardId);
        if (found) {
          setActiveCard(found);
          return;
        }
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeCardId = active.id as number;
    const overId = over.id;

    setBoards((prevBoards) =>
      prevBoards.map((board) => {
        let sourceListIndex = -1;
        let sourceCardIndex = -1;
        board.lists.forEach((list, li) => {
          const ci = list.cards.findIndex((c) => c.id === activeCardId);
          if (ci !== -1) {
            sourceListIndex = li;
            sourceCardIndex = ci;
          }
        });
        if (sourceListIndex === -1) return board;

        let destListIndex = -1;
        let destCardIndex = -1;

        if (typeof overId === 'string' && overId.startsWith('list-')) {
          const destListId = parseInt(overId.replace('list-', ''), 10);
          destListIndex = board.lists.findIndex((l) => l.id === destListId);
          destCardIndex = board.lists[destListIndex]?.cards.length ?? 0;
        } else {
          board.lists.forEach((list, li) => {
            const ci = list.cards.findIndex((c) => c.id === overId);
            if (ci !== -1) {
              destListIndex = li;
              destCardIndex = ci;
            }
          });
        }
        if (destListIndex === -1) return board;

        const newLists = board.lists.map((l) => ({ ...l, cards: [...l.cards] }));
        const [movedCard] = newLists[sourceListIndex].cards.splice(sourceCardIndex, 1);
        newLists[destListIndex].cards.splice(destCardIndex, 0, movedCard);

        // Persist: re-sync positions for every card in both affected lists
        newLists[sourceListIndex].cards.forEach((card, index) => {
          updateCard(card.id, newLists[sourceListIndex].id, index).catch(console.error);
        });
        if (destListIndex !== sourceListIndex) {
          newLists[destListIndex].cards.forEach((card, index) => {
            updateCard(card.id, newLists[destListIndex].id, index).catch(console.error);
          });
        }

        return { ...board, lists: newLists };
      })
    );
  }

  if (!loggedIn) {
    return <AuthForm onSuccess={() => setLoggedIn(true)} />;
  }

    return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-800">My Boards</h1>
        <button
          onClick={() => { clearTokens(); setLoggedIn(false); }}
          className="text-sm text-slate-500 hover:text-red-600 transition-colors"
        >
          Logout
        </button>
      </header>
      <main className="p-6">
        {error && (
          <p className="text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-3 mb-4">
            Error loading boards: {error}
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

        {!error && loading && (
          <p className="text-slate-400 text-sm">Loading your boards...</p>
        )}

        {!error && !loading && boards.length === 0 && (
          <div className="text-center py-16">
            <p className="text-slate-500">No boards yet — create your first one above.</p>
          </div>
        )}

        {!error && !loading && boards.map((board) => (
        <div key={board.id} className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            {editingBoardId === board.id ? (
              <input
                type="text"
                value={editBoardName}
                onChange={(e) => setEditBoardName(e.target.value)}
                onBlur={() => saveEditBoard(board.id)}
                onKeyDown={(e) => e.key === 'Enter' && saveEditBoard(board.id)}
                autoFocus
                className="text-lg font-medium text-slate-700 border-b border-blue-400 focus:outline-none"
              />
            ) : (
              <h2
                onClick={() => startEditingBoard(board)}
                className="text-lg font-medium text-slate-700 cursor-pointer hover:text-blue-600"
              >
                {board.name}
              </h2>
            )}
            <button
              onClick={() => handleDeleteBoard(board.id)}
              className="w-5 h-5 flex items-center justify-center rounded-full bg-slate-100 text-slate-400 hover:bg-red-100 hover:text-red-600 text-xs ml-2 flex-shrink-0"
              title="Delete board"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-4 overflow-x-auto pb-2">
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              onDragCancel={() => setActiveCard(null)}
            >
              {board.lists.map((list) => (
                <ListColumn
                  key={list.id}
                  id={list.id}
                  name={list.name}
                  cards={list.cards}
                  newCardValue={newCardTitle[list.id] || ''}
                  onNewCardChange={(value) => setNewCardTitle((prev) => ({ ...prev, [list.id]: value }))}
                  onCreateCard={(e) => handleCreateCard(list.id, e)}
                  isEditing={editingListId === list.id}
                  editValue={editListName}
                  onStartEdit={() => startEditingList(list)}
                  onEditChange={setEditListName}
                  onSaveEdit={() => saveEditList(list.id)}
                  editingCardId={editingCardId}
                  editCardTitle={editCardTitle}
                  onStartEditCard={startEditingCard}
                  onEditCardChange={setEditCardTitle}
                  onSaveEditCard={saveEditCard}
                  onDeleteList={() => handleDeleteList(list.id)}
                  onDeleteCard={handleDeleteCard}
                />
              ))}
              <DragOverlay>
                {activeCard ? (
                  <div className="bg-white rounded-lg px-3 py-2 shadow-lg border border-blue-300 text-sm text-slate-700 rotate-2">
                    {activeCard.title}
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>

          <form onSubmit={(e) => handleCreateList(board.id, e)} className="flex gap-2 mt-3">
            <input
              type="text"
              placeholder="New list name"
              value={newListName[board.id] || ''}
              onChange={(e) => setNewListName((prev) => ({ ...prev, [board.id]: e.target.value }))}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="bg-slate-200 text-slate-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-slate-300 transition-colors"
            >
              Add List
            </button>
          </form>
        </div>
              ))}
      </main>
    </div>
  );
}

export default App;