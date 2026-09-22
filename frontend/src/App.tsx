import { useEffect, useState } from 'react';
import './App.css';
import { DndContext, closestCenter } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import ListColumn from './ListColumn';
import { updateCard } from './api';
import AuthForm from './AuthForm';
import { isLoggedIn, clearTokens } from './auth';
import { clientId } from './api';
import { apiFetch } from './apiFetch';

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

  useEffect(() => {
    if (!loggedIn) return;
    apiFetch('http://localhost:8000/api/boards/')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setBoards(data))
      .catch((err) => setError(err.message));
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


  function handleDragEnd(event: DragEndEvent) {
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
    <div className="app">
      <div className="app-header">
        <h1>My Boards</h1>
        <button onClick={() => { clearTokens(); setLoggedIn(false); }}>
          Logout
        </button>
      </div>
      {error && <p className="auth-error">Error loading boards: {error}</p>}
      {!error && boards.map((board) => (
        <div key={board.id} className="board">
          <h2>{board.name}</h2>
          <div className="board-columns">
            <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              {board.lists.map((list) => (
                <ListColumn key={list.id} id={list.id} name={list.name} cards={list.cards} />
              ))}
            </DndContext>
          </div>
        </div>
      ))}
    </div>
  );
}

export default App;