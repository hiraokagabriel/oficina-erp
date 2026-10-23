import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { OSStatus } from '../types';

interface DroppableColumnProps {
  id: OSStatus;
  children: React.ReactNode;
}

/** Área de soltar da coluna. O visual (área grande, realce ao arrastar por cima) fica em styles-kanban.css. */
export const DroppableColumn: React.FC<DroppableColumnProps> = ({ id, children }) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className={isOver ? 'kanban-list-scroll kanban-drop is-over' : 'kanban-list-scroll kanban-drop'}
    >
      {children}
    </div>
  );
};
