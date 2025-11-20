import React from 'react';
import { PencilIcon } from './icons';

interface RefineOverlayProps {
  enabled: boolean;
  radius: number;
  onToggle: () => void;
  onRadiusChange: (value: number) => void;
}

const RefineOverlay: React.FC<RefineOverlayProps> = ({ enabled, radius, onToggle, onRadiusChange }) => {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-20">
      <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-slate-900/90 backdrop-blur px-4 py-3 shadow-2xl">
        <button
          onClick={onToggle}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-300 ${
            enabled ? 'bg-white text-slate-900' : 'bg-slate-800 text-white hover:bg-slate-700'
          }`}
          title="Toggle refine wand (click to dilate, Shift+click to erode)"
        >
          <PencilIcon className="w-4 h-4" />
          <span>Refine Wand</span>
        </button>
        <div className="flex items-center gap-2 text-sm text-white/80">
          <span>Radius</span>
          <input
            aria-label="Refine radius"
            type="range"
            min={1}
            max={40}
            value={radius}
            onChange={(e) => onRadiusChange(parseInt(e.target.value, 10) || 1)}
            className="w-32 accent-white"
          />
          <span className="w-10 text-right">{radius}px</span>
        </div>
        <div className="text-xs text-gray-300">
          <div>Click to dilate · Shift+click to erode</div>
          <div className="text-gray-500">Uses selected annotation or the one under cursor.</div>
        </div>
      </div>
    </div>
  );
};

export default RefineOverlay;
