import { useState, useEffect } from 'react';
import { apiFetch } from './apiFetch';
import {
  createList, createCard, updateList, updateCardTitle,
  deleteList, deleteCard, clientId,
} from './api';

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
  collaborators: string[];
  is_owner: boolean;
}

const API_BASE = import.meta.env.VITE_API_BASE;
const WS_BASE = import.meta.env.VITE_WS_BASE;

export function useBoard(boardId: number) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newListName, setNewListName] = useState('');
  const [newCardTitle, setNewCardTitle] = useState<{ [listId: number]: string }>({});
  const [editingListId, setEditingListId] = useState<number | null>(null);
  const [editListName, setEditListName] = useState('');
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [editCardTitle, setEditCardTitle] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch(`${API_BASE}/boards/${boardId}/`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setBoard(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [boardId]);

  useEffect(() => {
    if (!boardId) return;
    const ws = new WebSocket(`${WS_BASE}/boards/${boardId}/`);

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

      if (data.event === 'list_moved') {
        setBoard((prev) => {
          if (!prev) return prev;
          const list = prev.lists.find((l) => l.id === data.list_id);
          if (!list) return prev;
          const others = prev.lists.filter((l) => l.id !== data.list_id);
          const newLists = [...others];
          newLists.splice(data.position, 0, list);
          return { ...prev, lists: newLists };
        });
      }
    };

    return () => ws.close();
  }, [boardId]);

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

  return {
    board, setBoard, loading, error, setError,
    newListName, setNewListName, newCardTitle, setNewCardTitle,
    editingListId, editListName, setEditListName,
    editingCardId, editCardTitle, setEditCardTitle,
    handleCreateList, handleCreateCard,
    startEditingList, saveEditList,
    startEditingCard, saveEditCard,
    handleDeleteList, handleDeleteCard,
  };
}