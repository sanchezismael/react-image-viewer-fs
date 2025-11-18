import React from 'react';

const CONFETTI_COUNT = 150;
const CONFETTI_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];

const ConfettiPiece: React.FC = () => {
  const style: React.CSSProperties = {
    left: `${Math.random() * 100}%`,
    backgroundColor: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    animationDelay: `${Math.random() * 2}s`,
    width: `${Math.random() * 8 + 8}px`,
    height: `${Math.random() * 5 + 5}px`,
    opacity: Math.random() * 0.5 + 0.5,
    transform: `rotate(${Math.random() * 360}deg)`,
  };
  return <div className="confetti" style={style}></div>;
};

const Confetti: React.FC = () => {
  return (
    <div className="fixed top-0 left-0 w-full h-full pointer-events-none z-50 overflow-hidden">
      {Array.from({ length: CONFETTI_COUNT }).map((_, i) => (
        <ConfettiPiece key={i} />
      ))}
    </div>
  );
};

export default Confetti;
