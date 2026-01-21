import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { OSStatus } from '../types';

interface DroppableColumnProps {
  id: OSStatus;
  children: React.ReactNode;
}

export const DroppableColumn: React.FC<DroppableColumnProps> = ({ id, children }) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
  });

  return (
    <div
      ref={setNodeRef}
      className="kanban-list-scroll"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '8px',
        background: isOver
          ? 'linear-gradient(180deg, rgba(130, 87, 230, 0.05) 0%, rgba(130, 87, 230, 0.02) 100%)'
          : 'transparent',
        border: isOver ? '2px dashed var(--primary)' : '2px solid transparent',
        borderRadius: '12px',
        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        minHeight: 150,
        flex: 1,
        overflowY: 'auto',
        willChange: 'background, border',
      }}
    >
      {children}
    </div>
  );
};