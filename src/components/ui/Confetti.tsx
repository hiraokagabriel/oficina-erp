import React from 'react';

export const Confetti: React.FC = () => {
  // Cria 50 pedacinhos de confete
  const pieces = Array.from({ length: 50 });
  
  return (
    <div className="confetti-container">
      {pieces.map((_, i) => (
        <div 
          key={i} 
          className="confetti-piece" 
          style={{ 
            left: `${Math.random() * 100}vw`, 
            animationDelay: `${Math.random() * 2}s`, 
            backgroundColor: `hsl(${Math.random() * 360}, 70%, 50%)` 
          }} 
        />
      ))}
    </div>
  );
};