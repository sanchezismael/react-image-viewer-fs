import React from 'react';

const RocketLaunchAnimation: React.FC = () => {
  return (
    <div className="relative w-full h-64 overflow-hidden bg-gradient-to-b from-blue-900 via-purple-900 to-black rounded-lg">
      <style>{`
        @keyframes rocketFly {
          0% {
            transform: translateY(0) translateX(-50%) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateY(-80px) translateX(-50%) scale(0.8);
            opacity: 0.9;
          }
          100% {
            transform: translateY(-250px) translateX(-50%) scale(0.3);
            opacity: 0;
          }
        }
        @keyframes flame {
          0%, 100% {
            transform: translateX(-50%) scaleY(1);
            opacity: 0.8;
          }
          50% {
            transform: translateX(-50%) scaleY(1.3);
            opacity: 1;
          }
        }
        @keyframes smoke {
          0% {
            transform: translateY(0) scale(1);
            opacity: 0.6;
          }
          100% {
            transform: translateY(-100px) scale(2);
            opacity: 0;
          }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.3; }
          50% { opacity: 1; }
        }
        .rocket {
          position: absolute;
          bottom: 20%;
          left: 50%;
          font-size: 3rem;
          animation: rocketFly 3s ease-in infinite;
        }
        .flame {
          position: absolute;
          bottom: calc(20% - 30px);
          left: 50%;
          font-size: 2rem;
          animation: flame 0.2s ease-in-out infinite;
        }
        .smoke {
          position: absolute;
          bottom: calc(20% - 40px);
          left: 50%;
          font-size: 1.5rem;
          animation: smoke 2s ease-out infinite;
        }
        .smoke:nth-child(2) { animation-delay: 0.3s; }
        .smoke:nth-child(3) { animation-delay: 0.6s; }
        .smoke:nth-child(4) { animation-delay: 0.9s; }
        .star {
          position: absolute;
          color: white;
          font-size: 0.5rem;
          animation: star-twinkle 2s ease-in-out infinite;
        }
        .planet {
          position: absolute;
          font-size: 2rem;
          opacity: 0.6;
        }
      `}</style>

      <span className="star" style={{ top: '10%', left: '20%', animationDelay: '0s' }}>✦</span>
      <span className="star" style={{ top: '25%', left: '80%', animationDelay: '0.5s' }}>✦</span>
      <span className="star" style={{ top: '15%', left: '60%', animationDelay: '1s' }}>✦</span>
      <span className="star" style={{ top: '40%', left: '15%', animationDelay: '1.5s' }}>✦</span>
      <span className="star" style={{ top: '35%', left: '85%', animationDelay: '0.8s' }}>✦</span>
      <span className="star" style={{ top: '50%', left: '50%', animationDelay: '0.3s' }}>✦</span>

      <span className="planet" style={{ top: '10%', right: '10%' }}>🪐</span>

      <span className="smoke">💨</span>
      <span className="smoke">💨</span>
      <span className="smoke">💨</span>
      <span className="smoke">💨</span>

      <span className="flame">🔥</span>

      <span className="rocket">🚀</span>

      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm font-bold">
        🚀 Despegando hacia el espacio...
      </div>
    </div>
  );
};

export default RocketLaunchAnimation;
