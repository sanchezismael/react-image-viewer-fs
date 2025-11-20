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
  refineMode: boolean;
  onRefineRequest: (point: Point, erode: boolean) => void;
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
    startActiveTimer, stopActiveTimer, refineMode, onRefineRequest
  },
  ref
) => {
  const viewerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [currentPath, setCurrentPath] = useState<Point[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isHoveringImage, setIsHoveringImage] = useState(false);

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

    ctx.restore();
  }, [annotations, currentPath, transform, selectedAnnotationId, imageDimensions]);

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
    if (refineMode) {
      const point = getTransformedPoint(e.clientX, e.clientY);
      onRefineRequest(point, e.shiftKey);
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
    if (isDrawingMode) handleDrawStart(e.clientX, e.clientY);
    else handlePanMouseDown(e);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    onActivity();
    if (isDrawingMode) {
      if (e.touches.length === 1) handleDrawStart(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      handlePanTouchStart(e);
    }
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => handleDrawMove(e.clientX, e.clientY);
    const handleTouchMove = (e: TouchEvent) => { if (e.touches.length === 1) handleDrawMove(e.touches[0].clientX, e.touches[0].clientY); };

    if (isDrawing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleDrawEnd);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleDrawEnd);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleDrawEnd);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleDrawEnd);
    };
  }, [isDrawing, handleDrawMove, handleDrawEnd]);

  const handleViewerMouseMove = (e: React.MouseEvent) => {
    onActivity();
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
  const viewerCursorClass = isDrawingMode ? 'cursor-default' : 'cursor-grab active:cursor-grabbing';
  
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
      onTouchStart={handleTouchStart}
      onClick={handleCanvasClick}
      onMouseMove={handleViewerMouseMove}
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
