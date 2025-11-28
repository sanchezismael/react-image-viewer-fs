import React, { useRef, useState, useEffect, useCallback, useImperativeHandle } from 'react';
import { useImageTransform, TransformState } from '../hooks/useImageTransform';
import { SpinnerIcon } from './icons';
import { AnnotationClass, Annotation, Point } from '../App';

export interface ImageViewerApi {
  zoomIn: () => void;
  zoomOut: () => void;
  resetTransform: () => void;
}

interface ImageViewerProps {
  src: string;
  onTransformChange: (transform: TransformState) => void;
  isDrawingMode: boolean;
  annotations: Annotation[];
  annotationClasses: AnnotationClass[];
  selectedAnnotationClass: string | null;
  selectedAnnotationId: string | null;
  onAddAnnotation: (annotation: Omit<Annotation, 'id'>) => void;
  onSelectAnnotation: (id: string | null) => void;
  imageDimensions: {width: number, height: number} | null;
  onActivity: () => void;
  startActiveTimer: () => void;
  stopActiveTimer: () => void;
  wandActive: boolean;
  wandTolerance: number;
  onWandRequest: (point: Point, erode: boolean, phase: 'start' | 'move' | 'end') => void;
}

const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y))
        && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
};

const ImageViewer: React.ForwardRefRenderFunction<ImageViewerApi, ImageViewerProps> = (
  { 
    src, onTransformChange, isDrawingMode, annotations, annotationClasses, 
    selectedAnnotationClass, selectedAnnotationId, onAddAnnotation, onSelectAnnotation, imageDimensions, onActivity,
    startActiveTimer, stopActiveTimer, wandActive, wandTolerance, onWandRequest
  },
  ref
) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isHoveringImage, setIsHoveringImage] = useState(false);
  const [cursorPos, setCursorPos] = useState<Point | null>(null);
  const isRefining = useRef(false);
  const lastRefineTs = useRef(0);

  const colorMap = useRef(new Map<string, string>());
  useEffect(() => {
    colorMap.current = new Map(annotationClasses.map(cls => [cls.name, cls.color]));
  }, [annotationClasses]);

  const { transform, handleWheel, handleMouseDown: handlePanMouseDown, handleTouchStart: handlePanTouchStart, zoomIn, zoomOut, resetTransform, isPositioned } = useImageTransform(viewerRef, imageDimensions);

  useImperativeHandle(ref, () => ({ zoomIn, zoomOut, resetTransform }), [zoomIn, zoomOut, resetTransform]);

  useEffect(() => {
    onTransformChange(transform);
  }, [transform, onTransformChange]);

  // Drawing Effect
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !viewerRef.current) return;

    const rect = viewerRef.current.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.scale(transform.scale, transform.scale);
    
    // Convert annotations from natural coordinates to displayed coordinates for rendering
    const img = imageRef.current;
    if (!img || !imageDimensions || img.clientWidth === 0) {
        ctx.restore();
        return;
    }

    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;

    const renderScaleX = displayWidth / imageDimensions.width;
    const renderScaleY = displayHeight / imageDimensions.height;

    annotations.forEach((annotation) => {
      const { points, className, id } = annotation;
      if (points.length < 2) return;
      
      const renderedPoints = points.map(p => ({ x: p.x * renderScaleX, y: p.y * renderScaleY }));

      ctx.fillStyle = colorMap.current.get(className) || 'rgba(255, 255, 255, 0.4)';
      if (id === selectedAnnotationId) {
        ctx.strokeStyle = 'rgba(59, 130, 246, 1)'; // Bright blue for selection
        ctx.lineWidth = 4 / transform.scale;
      } else {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 2 / transform.scale;
      }

      ctx.beginPath();
      ctx.moveTo(renderedPoints[0].x, renderedPoints[0].y);
      for (let i = 1; i < renderedPoints.length; i++) ctx.lineTo(renderedPoints[i].x, renderedPoints[i].y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });

    if (currentPath.length > 1) {
      const renderedCurrentPath = currentPath.map(p => ({ x: p.x * renderScaleX, y: p.y * renderScaleY }));
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2 / transform.scale;
      ctx.beginPath();
      ctx.moveTo(renderedCurrentPath[0].x, renderedCurrentPath[0].y);
      for (let i = 1; i < renderedCurrentPath.length; i++) ctx.lineTo(renderedCurrentPath[i].x, renderedCurrentPath[i].y);
      ctx.stroke();
    }

    // Draw Wand Cursor
    if (wandActive && cursorPos) {
      const cx = cursorPos.x * renderScaleX;
      const cy = cursorPos.y * renderScaleY;
      const r = wandTolerance * renderScaleX; // Assuming square pixels

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2 / transform.scale;
      ctx.stroke();
      
      // Inner dashed circle for better visibility
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 1 / transform.scale;
      ctx.setLineDash([4 / transform.scale, 4 / transform.scale]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }, [annotations, currentPath, transform, selectedAnnotationId, imageDimensions, wandActive, cursorPos, wandTolerance]);

  const getTransformedPoint = useCallback((clientX: number, clientY: number): Point => {
    const viewer = viewerRef.current;
    const img = imageRef.current;
    if (!viewer || !img || !imageDimensions || img.clientWidth === 0) return { x: 0, y: 0 };
  
    // Tamaño visible actual de la imagen
    const rect = viewer.getBoundingClientRect();
    const displayWidth = img.clientWidth;
    const displayHeight = img.clientHeight;
  
    // Factor de escala entre imagen natural y mostrada
    const scaleX = imageDimensions.width / displayWidth;
    const scaleY = imageDimensions.height / displayHeight;
  
    // Coordenadas relativas dentro del visor
    const relX = (clientX - rect.left - transform.x) / transform.scale;
    const relY = (clientY - rect.top - transform.y) / transform.scale;
  
    // Convertir a coordenadas naturales
    return {
      x: relX * scaleX,
      y: relY * scaleY,
    };
  }, [transform, imageDimensions]);

  const handleDrawStart = useCallback((clientX: number, clientY: number) => {
    if (!selectedAnnotationClass || !imageDimensions) return;

    const point = getTransformedPoint(clientX, clientY);
    if (point.x < 0 || point.x > imageDimensions.width || point.y < 0 || point.y > imageDimensions.height) {
        return; 
    }

    startActiveTimer();
    setIsDrawing(true);
    setCurrentPath([point]);
  }, [getTransformedPoint, selectedAnnotationClass, imageDimensions, startActiveTimer]);

  const handleDrawMove = useCallback((clientX: number, clientY: number) => {
    if (!isDrawing || !imageDimensions) return;
    
    let point = getTransformedPoint(clientX, clientY);
    point.x = Math.max(0, Math.min(point.x, imageDimensions.width));
    point.y = Math.max(0, Math.min(point.y, imageDimensions.height));

    setCurrentPath(prev => [...prev, point]);
  }, [isDrawing, getTransformedPoint, imageDimensions]);

  const handleDrawEnd = useCallback(() => {
    if (!isDrawing) return;
    stopActiveTimer();
    setIsDrawing(false);
    if (currentPath.length > 1 && selectedAnnotationClass) {
      onAddAnnotation({ points: currentPath, className: selectedAnnotationClass });
    }
    setCurrentPath([]);
  }, [isDrawing, currentPath, selectedAnnotationClass, onAddAnnotation, stopActiveTimer]);

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (wandActive) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      onWandRequest(point, e.shiftKey, 'start');
      onWandRequest(point, e.shiftKey, 'end');
      return;
    }
    if (isDrawingMode || e.defaultPrevented) return;
    const point = getTransformedPoint(e.clientX, e.clientY);
    let foundId: string | null = null;
    for (let i = annotations.length - 1; i >= 0; i--) {
        if (isPointInPolygon(point, annotations[i].points)) {
            foundId = annotations[i].id;
            break;
        }
    }
    onSelectAnnotation(foundId);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    onActivity();
    if (wandActive) {
      isRefining.current = true;
      lastRefineTs.current = 0;
      onWandRequest(getTransformedPoint(e.clientX, e.clientY), e.shiftKey, 'start');
      return;
    }
    if (isDrawingMode) handleDrawStart(e.clientX, e.clientY);
    else handlePanMouseDown(e);
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (wandActive && isRefining.current) {
        onWandRequest(getTransformedPoint(e.clientX, e.clientY), e.shiftKey, 'end');
    }
    isRefining.current = false;
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    onActivity();
    if (wandActive) {
      if (e.touches.length === 1) {
        isRefining.current = true;
        lastRefineTs.current = 0;
        onWandRequest(getTransformedPoint(e.touches[0].clientX, e.touches[0].clientY), e.shiftKey, 'start');
      }
      return;
    }
    if (isDrawingMode) {
      if (e.touches.length === 1) handleDrawStart(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      handlePanTouchStart(e);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (wandActive && isRefining.current) {
        const now = performance.now();
        if (now - lastRefineTs.current > 16) { // 60fps target
          onWandRequest(getTransformedPoint(e.clientX, e.clientY), e.shiftKey, 'move');
          lastRefineTs.current = now;
        }
        return;
      }
      handleDrawMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        if (wandActive && isRefining.current) {
          const touch = e.touches[0];
          const now = performance.now();
          if (now - lastRefineTs.current > 16) {
            onWandRequest(getTransformedPoint(touch.clientX, touch.clientY), e.shiftKey, 'move');
            lastRefineTs.current = now;
          }
          return;
        }
        handleDrawMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    if (isDrawing || (wandActive && isRefining.current)) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleDrawEnd); // Keep this for drawing mode cleanup
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleDrawEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDrawEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDrawEnd);
    };
  }, [isDrawing, handleDrawMove, handleDrawEnd, wandActive, onWandRequest, getTransformedPoint]);

  const handleViewerMouseMove = (e: React.MouseEvent) => {
    onActivity();
    if (wandActive) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      setCursorPos(point);
    } else if (cursorPos) {
      setCursorPos(null);
    }

    if (wandActive && isRefining.current) {
      // Handled by window listener for smoother drag
      return;
    }
    if (isDrawingMode && imageDimensions) {
        const point = getTransformedPoint(e.clientX, e.clientY);
        if (point.x >= 0 && point.x <= imageDimensions.width && point.y >= 0 && point.y <= imageDimensions.height) {
            setIsHoveringImage(true);
        } else {
            setIsHoveringImage(false);
        }
    } else if (isHoveringImage) {
        setIsHoveringImage(false);
    }
  };
  
  const handleWheelWithActivity = (e: React.WheelEvent) => {
    if (isDrawingMode) return;
    onActivity();
    handleWheel(e);
  };

  const showSpinner = !isPositioned;
  const imageOpacity = showSpinner ? 0 : 1;
  let viewerCursorClass = isDrawingMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing';
  if (wandActive) viewerCursorClass = 'cursor-none';
  
  const imageStyle: React.CSSProperties = {
    position: 'absolute',
    transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})`,
    transformOrigin: '0 0',
    willChange: 'transform',
    opacity: imageOpacity,
    transition: 'opacity 0.3s ease-in-out',
  };

  if (isDrawingMode) {
    imageStyle.cursor = isHoveringImage ? 'crosshair' : 'not-allowed';
  }


  const aspectRatio =
    imageDimensions && imageDimensions.height > 0
      ? imageDimensions.width / imageDimensions.height
      : 1;
      
  return (
    <div
      ref={viewerRef}
      className={`relative mx-auto overflow-hidden touch-none select-none bg-[#0d111c] border border-white/10 rounded-2xl shadow-[0_25px_60px_rgba(0,0,0,0.45)] ${viewerCursorClass}`}
      style={{
        width: '100%',
        height: '100%',
      }}
      onWheel={handleWheelWithActivity}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onTouchStart={handleTouchStart}
      onClick={handleCanvasClick}
      onMouseMove={handleViewerMouseMove}
      onMouseLeave={() => setCursorPos(null)}
    >
      {showSpinner && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10">
          <SpinnerIcon className="w-12 h-12 text-gray-400 animate-spin" />
        </div>
      )}
      <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full pointer-events-none z-10" />
      <img
        ref={imageRef}
        src={src}
        alt="user-upload"
        style={imageStyle}
        draggable="false"
      />
    </div>
  );
};

export default React.forwardRef(ImageViewer);
