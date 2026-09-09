import { useEffect, useState } from 'react';
import './App.css';

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

  useEffect(() => {
    fetch('http://localhost:8000/api/boards/')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => setBoards(data))
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <div>Error loading boards: {error}</div>;

  return (
    <div>
      <h1>My Boards</h1>
      {boards.map((board) => (
        <div key={board.id}>
          <h2>{board.name}</h2>
          {board.lists.map((list) => (
            <div key={list.id}>
              <h3>{list.name}</h3>
              <ul>
                {list.cards.map((card) => (
                  <li key={card.id}>{card.title}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export default App;