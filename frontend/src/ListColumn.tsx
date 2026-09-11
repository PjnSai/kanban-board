import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import CardItem from './CardItem';

interface CardType {
  id: number;
  title: string;
}

interface ListColumnProps {
  id: number;
  name: string;
  cards: CardType[];
}

function ListColumn({ id, name, cards }: ListColumnProps) {
  const { setNodeRef } = useDroppable({ id: `list-${id}` });

  return (
    <div className="list-column">
      <h3>{name}</h3>
      <div className="card-stack" ref={setNodeRef}>
        <SortableContext items={cards.map((c) => c.id)} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <CardItem key={card.id} id={card.id} title={card.title} />
          ))}
        </SortableContext>
      </div>
    </div>
  );
}

export default ListColumn;