import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  DndContext, closestCenter, useSensor, useSensors, PointerSensor, DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { apiFetch } from './apiFetch';
import {
  createList, createCard, updateList, updateCardTitle, deleteList, deleteCard, updateCard,
} from './api';
import { clientId } from './api';
import ListColumn from './ListColumn';

interface Card {
  id: number;
  title: string;
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

function BoardView() {
  const { id } = useParams();
  const boardId = Number(id);

  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newListName, setNewListName] = useState('');
  const [newCardTitle, setNewCardTitle] = useState<{ [listId: number]: string }>({});

  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editListName, setEditListName] = useState('');

  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editCardTitle, setEditCardTitle] = useState('');

  const [activeCard, setActiveCard] = useState<Card | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  // Fetch this board
  useEffect(() => {
    setLoading(true);
    apiFetch(`http://localhost:8000/api/boards/${boardId}/`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setBoard(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [boardId]);

  // WebSocket, scoped to this board
  useEffect(() => {
    if (!boardId) return;
    const ws = new WebSocket(`ws://localhost:8000/ws/boards/${boardId}/`);

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.origin === clientId) return;

      if (data.event === 'card_moved') {
        setBoard((prev) => {
          if (!prev) return prev;
          const newLists = prev.lists.map((l) => ({ ...l, cards: [...l.cards] }));
          let movedCard: Card | undefined;
          newLists.forEach((list) => {
            const idx = list.cards.findIndex((c) => c.id === data.card_id);
            if (idx !== -1) [movedCard] = list.cards.splice(idx, 1);
          });
          if (movedCard) {
            const destList = newLists.find((l) => l.id === data.list_id);
            destList?.cards.splice(data.position, 0, movedCard);
          }
          return { ...prev, lists: newLists };
        });
      }
    };

    return () => ws.close();
  }, [boardId]);

  function handleDragStart(event: DragStartEvent) {
    const cardId = event.active.id as number;
    for (const list of board?.lists ?? []) {
      const found = list.cards.find((c) => c.id === cardId);
      if (found) {
        setActiveCard(found);
        return;
      }
    }
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over || !board) return;

    const activeCardId = active.id as number;
    const overId = over.id;

    let sourceListIndex = -1;
    let sourceCardIndex = -1;
    board.lists.forEach((list, li) => {
      const ci = list.cards.findIndex((c) => c.id === activeCardId);
      if (ci !== -1) {
        sourceListIndex = li;
        sourceCardIndex = ci;
      }
    });
    if (sourceListIndex === -1) return;

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
    if (destListIndex === -1) return;

    const newLists = board.lists.map((l) => ({ ...l, cards: [...l.cards] }));
    const [movedCard] = newLists[sourceListIndex].cards.splice(sourceCardIndex, 1);
    newLists[destListIndex].cards.splice(destCardIndex, 0, movedCard);

    setBoard({ ...board, lists: newLists });

    newLists[sourceListIndex].cards.forEach((card, index) => {
      updateCard(card.id, newLists[sourceListIndex].id, index).catch(console.error);
    });
    if (destListIndex !== sourceListIndex) {
      newLists[destListIndex].cards.forEach((card, index) => {
        updateCard(card.id, newLists[destListIndex].id, index).catch(console.error);
      });
    }
  }

  async function handleCreateList(e: React.FormEvent) {
    e.preventDefault();
    const name = newListName.trim();
    if (!name || !board) return;
    try {
      const position = board.lists.length;
      const newList = await createList(boardId, name, position);
      setBoard({ ...board, lists: [...board.lists, { ...newList, cards: [] }] });
      setNewListName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create list');
    }
  }

  async function handleCreateCard(listId: number, e: React.FormEvent) {
    e.preventDefault();
    const title = newCardTitle[listId]?.trim();
    if (!title || !board) return;
    try {
      const list = board.lists.find((l) => l.id === listId);
      const position = list ? list.cards.length : 0;
      const newCard = await createCard(listId, title, position);
      setBoard({
        ...board,
        lists: board.lists.map((l) =>
          l.id === listId ? { ...l, cards: [...l.cards, newCard] } : l
        ),
      });
      setNewCardTitle((prev) => ({ ...prev, [listId]: '' }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create card');
    }
  }

  function startEditingList(list: List) {
    setEditingListId(list.id);
    setEditListName(list.name);
  }

  async function saveEditList(listId: number) {
    const name = editListName.trim();
    setEditingListId(null);
    if (!name || !board) return;
    try {
      await updateList(listId, name);
      setBoard({
        ...board,
        lists: board.lists.map((l) => (l.id === listId ? { ...l, name } : l)),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update list');
    }
  }

  function startEditingCard(card: Card) {
    setEditingCardId(card.id);
    setEditCardTitle(card.title);
  }

  async function saveEditCard(cardId: number) {
    const title = editCardTitle.trim();
    setEditingCardId(null);
    if (!title || !board) return;
    try {
      await updateCardTitle(cardId, title);
      setBoard({
        ...board,
        lists: board.lists.map((l) => ({
          ...l,
          cards: l.cards.map((c) => (c.id === cardId ? { ...c, title } : c)),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update card');
    }
  }

  async function handleDeleteList(listId: number) {
    if (!window.confirm('Delete this list and its cards?') || !board) return;
    try {
      await deleteList(listId);
      setBoard({ ...board, lists: board.lists.filter((l) => l.id !== listId) });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete list');
    }
  }

  async function handleDeleteCard(cardId: number) {
    if (!board) return;
    try {
      await deleteCard(cardId);
      setBoard({
        ...board,
        lists: board.lists.map((l) => ({
          ...l,
          cards: l.cards.filter((c) => c.id !== cardId),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete card');
    }
  }

  if (loading) return <p className="text-slate-400 text-sm">Loading board...</p>;
  if (error) return <p className="text-red-600">{error}</p>;
  if (!board) return null;

  return (
    <div>
      <h2 className="text-lg font-medium text-slate-700 mb-4">{board.name}</h2>
      <div className="flex items-start gap-4 overflow-x-auto pb-2">
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
      <form onSubmit={handleCreateList} className="flex gap-2 mt-4">
        <input
          type="text"
          placeholder="New list name"
          value={newListName}
          onChange={(e) => setNewListName(e.target.value)}
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
  );
}

export default BoardView;