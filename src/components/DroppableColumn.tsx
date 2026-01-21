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
        // ✅ FIX: Hitbox MUITO maior para facilitar drop
        padding: '16px', // Era 8px, agora 16px (2x maior)
        background: isOver
          ? 'linear-gradient(180deg, rgba(130, 87, 230, 0.1) 0%, rgba(130, 87, 230, 0.05) 100%)'
          : 'transparent',
        border: isOver ? '3px dashed var(--primary)' : '3px solid transparent',
        borderRadius: '12px',
        transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
        // ✅ FIX: minHeight MUITO maior - quase 3x
        minHeight: 400, // Era 150px, agora 400px!
        flex: 1,
        overflowY: 'auto',
        willChange: 'background, border',
        // ✅ Feedback visual mais forte
        transform: isOver ? 'scale(1.01)' : 'scale(1)',
        boxShadow: isOver ? '0 8px 24px rgba(130, 87, 230, 0.2)' : 'none',
      }}
    >
      {children}
    </div>
  );
};