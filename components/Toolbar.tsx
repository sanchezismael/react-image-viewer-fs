import React, { useState } from 'react';
import { TransformState } from '../hooks/useImageTransform';
import { ChartIcon, CheckIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, MinusIcon, PencilIcon, PlusIcon, ResetIcon, TrashIcon } from './icons';
import { Annotation, AnnotationClass, AnnotationStats } from '../App';
import { ImageFile } from '../utils/api';
import DonutChart from './DonutChart';

interface ToolbarProps {
  images: ImageFile[];
  currentIndex: number;
  transform: TransformState;
  isDrawingMode: boolean;
  annotations: Annotation[];
  annotationClasses: AnnotationClass[];
  selectedAnnotationClass: string | null;
  selectedAnnotationId: string | null;
  totalImages: number;
  completedImagesCount: number;
  annotationStats: AnnotationStats | null;
  currentImageDimensions: {width: number, height: number} | null;
  allImageDimensions: Record<number, {width: number, height: number}>;
  annotationTime: number;
  activeAnnotationTime: number;
  isTimerPaused: boolean;
  isCurrentImageCompleted: boolean;
  totalProjectTime: number;
  totalActiveProjectTime: number;
  outputPaths: {
    annotations: string;
    masks: string;
    times: string;
  } | null;
  showOutputSettings: boolean;
  onToggleOutputSettings: () => void;
  onRequestOutputPathChange: (type: 'annotations' | 'masks' | 'times') => void;
  onRestoreDefaultOutputPaths: () => void;
  onFileSelect: () => void;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onGoToIndex: (index: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onReset: () => void;
  onToggleDrawingMode: () => void;
  onAddAnnotationClass: (name: string, id: number) => void;
  onUpdateAnnotationClassColor: (className: string, newColor: string) => void;
  onSelectAnnotationClass: (className: string) => void;
  onSelectAnnotation: (id: string | null) => void;
  onDeleteAnnotation: (id: string) => void;
  onResizeAnnotation: (id: string, deltaPercent: number) => void;
  onMorphAnnotation: (mode: 'dilate' | 'erode') => void;
  onSaveAll: () => void | Promise<void>;
  onMarkAsComplete: () => void;
  onDeleteCurrentImage: () => void;
  onOpenDashboard: () => void;
  isSaving: boolean;
  isDeletingImage: boolean;
}

const rgbaToHex = (rgba: string): string => {
    const match = rgba.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (!match) return '#ffffff';
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
};

const StatsSection: React.FC<{
  title: string;
  stats: { [className: string]: number };
  totalArea: number;
  classes: AnnotationClass[];
}> = ({ title, stats, totalArea, classes }) => {
  if (totalArea === 0) return null;

  const totalAnnotatedArea = Object.values(stats).reduce((sum, area) => (sum as number) + (area as number), 0) as number;
  const backgroundArea = totalArea - totalAnnotatedArea;

  const data = [
    ...classes.map(cls => ({
      name: cls.name,
      percentage: (stats[cls.name] / totalArea) * 100,
      color: cls.color.replace('0.5', '1'), // Make color solid for stats
    })),
    {
      name: 'Background',
      percentage: (backgroundArea / totalArea) * 100,
      color: '#4a5568', // gray-600
    }
  ];

  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 mb-1">{title}</h3>
      <div className="space-y-1 text-xs">
        {data.map(item => (
          <div key={item.name} className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }}></span>
              <span>{item.name}</span>
            </div>
            <span>{item.percentage.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};


const Toolbar: React.FC<ToolbarProps> = ({
  images, currentIndex, transform, isDrawingMode, annotations, annotationClasses, selectedAnnotationClass,
  selectedAnnotationId, totalImages, completedImagesCount, annotationStats, currentImageDimensions, allImageDimensions,
  annotationTime, activeAnnotationTime, isTimerPaused, isCurrentImageCompleted, totalProjectTime, totalActiveProjectTime, onFileSelect, onClose, onPrevious, onNext, onGoToIndex, onZoomIn, onZoomOut, onReset,
  onToggleDrawingMode, onAddAnnotationClass, onUpdateAnnotationClassColor, onSelectAnnotationClass, onSelectAnnotation, onDeleteAnnotation, onResizeAnnotation, onMorphAnnotation,
  onSaveAll, onMarkAsComplete, onDeleteCurrentImage, onOpenDashboard, isSaving, isDeletingImage, outputPaths, showOutputSettings, onToggleOutputSettings, onRequestOutputPathChange, onRestoreDefaultOutputPaths
}) => {
  const colorMap = React.useMemo(() => new Map(annotationClasses.map(cls => [cls.name, cls.color])), [annotationClasses]);
  const [newClassName, setNewClassName] = useState('');
  const [newClassId, setNewClassId] = useState('');
  const [jumpToValue, setJumpToValue] = useState('');
  const [refineDelta, setRefineDelta] = useState('5');

  const formatTime = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const handleAddClass = (e: React.FormEvent) => {
    e.preventDefault();
    const id = parseInt(newClassId, 10);
    if (!newClassName.trim() || !id || id < 1 || id > 255) {
      alert("Please provide a valid name and a unique mask ID between 1 and 255.");
      return;
    }
    if (annotationClasses.some(cls => cls.name === newClassName.trim() || cls.id === id)) {
      alert("Class name and ID must be unique.");
      return;
    }
    onAddAnnotationClass(newClassName, id);
    setNewClassName('');
    setNewClassId('');
  };

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(jumpToValue, 10);
    if (!isNaN(num)) {
      // User inputs 1-based, we use 0-based
      onGoToIndex(num - 1);
    }
    setJumpToValue(''); // Reset input
  };

  const totalPixelArea = Object.values(allImageDimensions).reduce((sum, dim) => (sum as number) + ((dim as {width: number, height: number}).width * (dim as {width: number, height: number}).height), 0);
  const currentImagePixelArea = currentImageDimensions ? currentImageDimensions.width * currentImageDimensions.height : 0;

  return (
    <aside className="w-80 h-screen glass-panel text-white flex flex-col p-5 border-r border-white/10 shadow-2xl shrink-0 overflow-y-auto thumbnail-scrollbar relative">
      <div className="absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/8 to-transparent pointer-events-none" />
      <div className="mb-4 pb-4 border-b border-white/5 relative z-10">
        <h1 className="text-2xl font-bold text-white mb-1">Image Annotator</h1>
        <p className="text-[12px] text-white/50">Anota con precisión y guarda todo sin perder ritmo.</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={onFileSelect} className="px-4 py-2 text-sm font-semibold bg-white text-slate-900 rounded-md hover:bg-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white">
            Change Folder
          </button>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold bg-slate-800 text-white rounded-md hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-slate-500">
            Close
          </button>
          <button
            onClick={onSaveAll}
            disabled={isSaving}
            className="col-span-2 px-4 py-2 text-sm font-semibold bg-slate-100 text-slate-900 rounded-md hover:bg-white disabled:bg-gray-600 disabled:cursor-wait transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-white"
          >
            {isSaving ? 'Saving…' : 'Guardar cambios'}
          </button>
          <button
            onClick={onOpenDashboard}
            className="col-span-2 px-4 py-2 text-sm font-semibold bg-slate-900/60 text-white rounded-md hover:bg-slate-800 transition-colors border border-white/10 flex items-center justify-center gap-2"
          >
            <ChartIcon className="w-5 h-5" />
            <span>Dashboard</span>
          </button>
          <button 
            onClick={onMarkAsComplete}
            className={`col-span-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 flex items-center justify-center gap-2 ${
              isCurrentImageCompleted 
                ? 'bg-amber-500 hover:bg-amber-400 focus:ring-amber-300 text-slate-900' 
                : 'bg-emerald-500 hover:bg-emerald-400 focus:ring-emerald-300 text-slate-900'
            }`}
          >
            {isCurrentImageCompleted ? (
              <>
                <CheckIcon className="w-5 h-5" />
                <span>Unmark Complete</span>
              </>
            ) : (
              'Mark as Complete'
            )}
          </button>
          <button
            onClick={onDeleteCurrentImage}
            disabled={isDeletingImage}
            className={`col-span-2 px-4 py-2 text-sm font-semibold rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 flex items-center justify-center gap-2 ${
              isDeletingImage ? 'bg-gray-600 cursor-wait text-white' : 'bg-red-600 hover:bg-red-500 focus:ring-red-300 text-white'
            }`}
          >
            <TrashIcon className="w-5 h-5" />
            <span>{isDeletingImage ? 'Deleting…' : 'Delete Image'}</span>
          </button>
        </div>
      </div>

      <div className="mb-4 pb-4 border-b border-white/5 text-sm flex-shrink-0">
        <p className="font-semibold break-words text-white/90" title={images[currentIndex]?.name}>{images[currentIndex]?.name || '...'}</p>
        <div className="text-gray-300 flex items-center justify-between mt-2">
          <span className="font-mono text-sm px-2 py-1 rounded bg-white/5 border border-white/5">{currentIndex + 1} / {images.length}</span>
          <form onSubmit={handleJump} className="flex items-center gap-1">
              <input
                  type="number"
                  value={jumpToValue}
                  onChange={(e) => setJumpToValue(e.target.value)}
                  placeholder="Go to..."
                  className="w-20 bg-slate-900/80 border border-white/10 text-white text-xs rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                  min="1"
                  max={images.length}
              />
              <button type="submit" className="px-2 py-1 text-xs font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors">Go</button>
          </form>
        </div>
      </div>

      <div className="mb-4 pb-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-gray-200 px-1 mb-2">Current Image Timer</h2>
        <div className="space-y-2">
            <div className="p-3 frosted rounded-lg flex justify-between items-center" title={`Total Time${isTimerPaused ? ' (Paused)' : ''}`}>
               <div className="flex items-center gap-2 text-gray-200">
                  <ClockIcon className={`w-5 h-5 transition-colors ${isTimerPaused ? 'text-rose-400 animate-pulse' : 'text-sky-300'}`} />
                  <span className="text-sm">Total Time</span>
               </div>
               <span className={`font-mono text-lg transition-colors ${isTimerPaused ? 'text-rose-400' : 'text-amber-300'}`}>{formatTime(annotationTime)}</span>
            </div>
            <div className="p-3 frosted rounded-lg flex justify-between items-center" title="Active Annotation Time">
               <div className="flex items-center gap-2 text-gray-200">
                  <PencilIcon className="w-5 h-5 text-indigo-200" />
                  <span className="text-sm">Active Time</span>
               </div>
               <span className="font-mono text-lg text-cyan-300">{formatTime(activeAnnotationTime)}</span>
            </div>
        </div>
      </div>

      <div className="mb-4 pb-4 border-b border-white/5">
        <h2 className="text-sm font-semibold text-gray-200 px-1 mb-2">Total Project Time</h2>
        <div className="space-y-2">
            <div className="p-3 bg-indigo-900/40 rounded-lg flex justify-between items-center border border-indigo-500/40" title="Total Time Across All Images">
               <div className="flex items-center gap-2 text-gray-200">
                  <ClockIcon className="w-5 h-5 text-indigo-300" />
                  <span className="text-sm font-semibold">Total</span>
               </div>
               <span className="font-mono text-lg font-bold text-indigo-300">{formatTime(totalProjectTime)}</span>
            </div>
            <div className="p-3 bg-cyan-900/40 rounded-lg flex justify-between items-center border border-cyan-500/40" title="Total Active Time Across All Images">
               <div className="flex items-center gap-2 text-gray-200">
                  <PencilIcon className="w-5 h-5 text-cyan-300" />
                  <span className="text-sm font-semibold">Active</span>
               </div>
               <span className="font-mono text-lg font-bold text-cyan-300">{formatTime(totalActiveProjectTime)}</span>
            </div>
        </div>
      </div>

      {outputPaths && (
        <div className="mb-4 pb-4 border-b border-white/5 text-xs text-gray-200 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-200">Output Folders</h2>
            <button
              onClick={onToggleOutputSettings}
              className="text-indigo-300 text-xs hover:text-indigo-100"
            >
              {showOutputSettings ? 'Ocultar' : 'Avanzado'}
            </button>
          </div>
          {([
            { label: 'Annotations (JSON)', key: 'annotations' as const },
            { label: 'Masks (PNG)', key: 'masks' as const },
            { label: 'Times (TXT)', key: 'times' as const }
          ]).map(item => (
            <div key={item.key} className="space-y-1">
              <p className="text-[11px] uppercase tracking-wide text-gray-400">{item.label}</p>
              <div className="flex items-center gap-2">
                <span className="flex-1 truncate font-mono" title={outputPaths[item.key]}>{outputPaths[item.key]}</span>
                {showOutputSettings && (
                  <button
                    onClick={() => onRequestOutputPathChange(item.key)}
                    className="px-2 py-1 text-[11px] font-semibold bg-white/10 border border-white/10 rounded-md hover:bg-white/20"
                  >
                    Cambiar
                  </button>
                )}
              </div>
            </div>
          ))}
          {showOutputSettings && (
            <button
              onClick={onRestoreDefaultOutputPaths}
              className="w-full mt-2 px-3 py-1.5 text-xs font-semibold bg-white/10 text-white rounded-md hover:bg-white/20"
            >
              Restaurar rutas por defecto
            </button>
          )}
        </div>
      )}

      {totalImages > 0 && (
        <div className="mb-4 pb-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-gray-200 px-1 mb-2">Completion Progress</h2>
          <div className="flex items-center gap-4 p-2 bg-gray-700/50 rounded-lg">
            <DonutChart progress={completedImagesCount / totalImages} size={60} />
            <div>
              <p className="text-lg font-bold">{completedImagesCount} / {totalImages}</p>
              <p className="text-xs text-gray-400">Images Completed</p>
            </div>
          </div>
        </div>
      )}

      {annotationStats && (
        <div className="mb-4 pb-4 border-b border-white/5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-200 px-1">Pixel Statistics</h2>
          <div className="p-2 bg-white/5 rounded-lg space-y-3 border border-white/10">
            <StatsSection
              title="Current Image"
              stats={annotationStats.currentImage}
              totalArea={currentImagePixelArea}
              classes={annotationClasses}
            />
            <StatsSection
              title="All Images"
              stats={annotationStats.allImages}
              totalArea={totalPixelArea}
              classes={annotationClasses}
            />
          </div>
        </div>
      )}
      
      <div className="space-y-2 mb-4 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-200 px-1">Annotation Classes</h2>
        <div className="flex flex-col gap-1">
          {annotationClasses.map((cls) => (
            <div key={cls.name} className={`w-full text-left text-sm rounded-md transition-colors flex items-center justify-between pr-2 ${ selectedAnnotationClass === cls.name ? 'bg-indigo-600/80 text-white font-semibold shadow-lg' : 'bg-white/5 hover:bg-white/10' }`}>
                <div onClick={() => onSelectAnnotationClass(cls.name)} className="flex items-center gap-3 px-3 py-2 flex-grow cursor-pointer">
                    <div className="w-4 h-4 rounded-full border-2 border-white/50 flex-shrink-0" style={{ backgroundColor: cls.color }}></div>
                    <span className="flex-grow truncate">{cls.name}</span>
                    <span className="text-xs font-mono bg-gray-900/50 px-1.5 py-0.5 rounded-sm">{cls.id}</span>
                </div>
                <div className="relative w-6 h-6 rounded-md overflow-hidden border-2 border-gray-500 hover:border-indigo-400 flex-shrink-0">
                    <input
                        type="color"
                        value={rgbaToHex(cls.color)}
                        onChange={(e) => onUpdateAnnotationClassColor(cls.name, e.target.value)}
                        className="absolute -top-1 -left-1 w-10 h-10 cursor-pointer"
                        title={`Change color for ${cls.name}`}
                    />
                </div>
            </div>
          ))}
        </div>
        <form onSubmit={handleAddClass} className="mt-2 space-y-2">
            <div className="flex gap-2">
                <input
                    type="text"
                    value={newClassName}
                    onChange={(e) => setNewClassName(e.target.value)}
                    placeholder="New class name..."
                    className="flex-grow bg-slate-900/70 border border-white/10 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <input
                    type="number"
                    value={newClassId}
                    onChange={(e) => setNewClassId(e.target.value)}
                    placeholder="ID"
                    min="1"
                    max="255"
                    className="w-16 bg-slate-900/70 border border-white/10 text-white text-sm rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
            </div>
            <button 
                type="submit" 
                className="w-full px-3 py-1.5 text-sm font-semibold bg-emerald-600 text-white rounded-md hover:bg-emerald-500 disabled:bg-gray-600 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-900 focus:ring-emerald-300"
            >
                Add Class
            </button>
        </form>
      </div>
      
      <div className="flex-grow flex flex-col min-h-0">
        <h2 className="text-sm font-semibold text-gray-400 px-1 mb-2">Annotations</h2>
        <div className="flex-1 overflow-y-auto space-y-1 pr-1 thumbnail-scrollbar">
          {annotations.length === 0 ? (
            <div className="text-center text-gray-500 text-sm py-4">No annotations yet.</div>
          ) : (
            annotations.map((ann, index) => (
              <button key={ann.id} onClick={() => onSelectAnnotation(ann.id)} className={`w-full text-left px-3 py-2 text-sm rounded-md transition-colors flex items-center justify-between gap-2 ${ selectedAnnotationId === ann.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-white/5 hover:bg-white/10'}`}>
                <div className="flex items-center gap-2 overflow-hidden">
                  <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap.get(ann.className) }}></span>
                  <span className="truncate">{`Annotation ${index + 1} (${ann.className})`}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); onResizeAnnotation(ann.id, -Math.max(1, Math.min(50, parseFloat(refineDelta) || 5))); }}
                    className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-white text-xs"
                    title="Contract annotation"
                  >
                    –
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onResizeAnnotation(ann.id, Math.max(1, Math.min(50, parseFloat(refineDelta) || 5))); }}
                    className="p-1 rounded-md bg-white/5 hover:bg-white/10 text-white text-xs"
                    title="Expand annotation"
                  >
                    +
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); onDeleteAnnotation(ann.id); }} className="p-1 rounded-full hover:bg-red-500/50 text-gray-400 hover:text-white flex-shrink-0">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
        {selectedAnnotationId && (
          <div className="mt-2 p-2 bg-white/5 border border-white/10 rounded-md text-xs text-gray-200 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-white/80">Refine size</span>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  className="w-16 bg-slate-900/70 border border-white/10 text-white rounded px-2 py-1 focus:ring-1 focus:ring-indigo-400 focus:outline-none"
                  value={refineDelta}
                  min={1}
                  max={50}
                  onChange={(e) => setRefineDelta(e.target.value)}
                />
                <span className="text-white/50">%</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onResizeAnnotation(selectedAnnotationId, -(Math.max(1, Math.min(50, parseFloat(refineDelta) || 5))))}
                className="flex-1 px-2 py-1 rounded-md bg-white text-slate-900 font-semibold hover:bg-slate-100 text-sm"
              >
                Contract
              </button>
              <button
                onClick={() => onResizeAnnotation(selectedAnnotationId, Math.max(1, Math.min(50, parseFloat(refineDelta) || 5)))}
                className="flex-1 px-2 py-1 rounded-md bg-slate-800 text-white font-semibold hover:bg-slate-700 text-sm"
              >
                Expand
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => onMorphAnnotation('erode')}
                className="flex-1 px-2 py-1 rounded-md bg-slate-900 text-white font-semibold hover:bg-slate-800 text-sm"
                title="Erode mask by blur radius"
              >
                Erode (radius)
              </button>
              <button
                onClick={() => onMorphAnnotation('dilate')}
                className="flex-1 px-2 py-1 rounded-md bg-white text-slate-900 font-semibold hover:bg-slate-100 text-sm"
                title="Dilate mask by blur radius"
              >
                Dilate (radius)
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700 space-y-4 flex-shrink-0">
        {images.length > 1 && (
            <div className="flex justify-between items-center bg-white/5 p-1 rounded-lg border border-white/10">
                <button onClick={onPrevious} className="p-2 text-white rounded-md hover:bg-white/10 transition-colors flex-1" aria-label="Previous Image"><ChevronLeftIcon className="w-6 h-6 mx-auto" /></button>
                <div className="w-px h-6 bg-white/20"></div>
                <button onClick={onNext} className="p-2 text-white rounded-md hover:bg-white/10 transition-colors flex-1" aria-label="Next Image"><ChevronRightIcon className="w-6 h-6 mx-auto" /></button>
            </div>
        )}
        <div className="bg-white/5 border border-white/10 p-1 rounded-lg flex items-center gap-1">
          <button onClick={onZoomOut} className="p-2 text-white rounded-md hover:bg-white/10 transition-colors" aria-label="Zoom Out"><MinusIcon className="w-6 h-6" /></button>
          <span className="text-white font-mono text-sm w-16 text-center tabular-nums">{Math.round(transform.scale * 100)}%</span>
          <button onClick={onZoomIn} className="p-2 text-white rounded-md hover:bg-white/10 transition-colors" aria-label="Zoom In"><PlusIcon className="w-6 h-6" /></button>
          <div className="w-px h-6 bg-white/20 mx-1"></div>
          <button onClick={onReset} className="p-2 text-white rounded-md hover:bg-white/10 transition-colors" aria-label="Reset View"><ResetIcon className="w-6 h-6" /></button>
          <div className="w-px h-6 bg-white/20 mx-1"></div>
           <button 
              onClick={onToggleDrawingMode} 
              disabled={!selectedAnnotationClass || isCurrentImageCompleted}
              title={!selectedAnnotationClass ? "Create an annotation class to start drawing" : "Toggle Drawing Mode (D)"}
              className={`p-2 text-white rounded-md transition-colors ${isDrawingMode ? 'bg-indigo-600' : 'hover:bg-white/10'} disabled:bg-gray-600 disabled:cursor-not-allowed disabled:text-gray-400`} 
              aria-label="Toggle Drawing Mode"
            >
            <PencilIcon className="w-6 h-6" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Toolbar;
