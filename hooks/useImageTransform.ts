import { useState, useRef, useEffect, useCallback, RefObject } from 'react';

const MIN_SCALE = 0.1;
const MAX_SCALE = 15;
const ZOOM_SENSITIVITY = 0.001;
const BUTTON_ZOOM_FACTOR = 1.2;

export interface TransformState {
  scale: number;
  x: number;
  y: number;
}

const getDistance = (touches: TouchList): number => {
    return Math.sqrt(
        Math.pow(touches[0].clientX - touches[1].clientX, 2) +
        Math.pow(touches[0].clientY - touches[1].clientY, 2)
    );
};

const getMidpoint = (touches: TouchList): { x: number; y: number } => {
    return {
        x: (touches[0].clientX + touches[1].clientX) / 2,
        y: (touches[0].clientY + touches[1].clientY) / 2,
    };
};


export const useImageTransform = (
    viewerRef: RefObject<HTMLElement>, 
    imageDimensions: {width: number, height: number} | null
) => {
    const [transform, setTransform] = useState<TransformState>({ scale: 1, x: 0, y: 0 });
    const [isPositioned, setIsPositioned] = useState(false);
    const initialTransformRef = useRef<TransformState>({ scale: 1, x: 0, y: 0 });
    const isInteractingRef = useRef(false);
    const lastPosRef = useRef({ x: 0, y: 0 });
    const lastTouchDistanceRef = useRef(0);

    const calculateInitialTransform = useCallback(() => {
        const viewerElement = viewerRef.current;
        if (!viewerElement || !imageDimensions) return;
        
        const rect = viewerElement.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        const { width: naturalWidth, height: naturalHeight } = imageDimensions;
        if (naturalWidth === 0 || naturalHeight === 0) return;

        // Calculate scale to fit and center the image in the viewer
        const scaleX = rect.width / naturalWidth;
        const scaleY = rect.height / naturalHeight;
        const initialScale = Math.min(scaleX, scaleY);
        
        // Calculate scaled dimensions
        const scaledWidth = naturalWidth * initialScale;
        const scaledHeight = naturalHeight * initialScale;
        
        // Center the image in the viewer
        const offsetX = (rect.width - scaledWidth) / 2;
        const offsetY = (rect.height - scaledHeight) / 2;
        
        const initialState = { scale: initialScale, x: offsetX, y: offsetY };
        setTransform(initialState);
        initialTransformRef.current = initialState;
        setIsPositioned(true);
    }, [viewerRef, imageDimensions]);

    useEffect(() => {
      setIsPositioned(false);
      const viewerElement = viewerRef.current;
      if (!viewerElement || !imageDimensions) return;

      // ResizeObserver is the modern, reliable way to know when an element's size is stable.
      // This solves the race condition where we might measure the viewer before CSS aspect-ratio is applied.
      const observer = new ResizeObserver(() => {
          calculateInitialTransform();
      });
      observer.observe(viewerElement);
      
      return () => observer.disconnect();
    }, [imageDimensions, calculateInitialTransform]);

    const zoom = useCallback((delta: number, centerX: number, centerY: number) => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        const rect = viewer.getBoundingClientRect();
        const pointX = centerX - rect.left;
        const pointY = centerY - rect.top;

        setTransform(prev => {
            const newScale = prev.scale * (1 - delta);
            const boundedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));
            
            if (boundedScale === prev.scale) return prev;
            
            const scaleRatio = boundedScale / prev.scale;

            const newX = pointX - (pointX - prev.x) * scaleRatio;
            const newY = pointY - (pointY - prev.y) * scaleRatio;

            return {
                scale: boundedScale,
                x: newX,
                y: newY,
            };
        });
    }, [viewerRef]);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        zoom(e.deltaY * ZOOM_SENSITIVITY, e.clientX, e.clientY);
    }, [zoom]);
    
    const pan = useCallback((dx: number, dy: number) => {
        setTransform(prev => ({
            ...prev,
            x: prev.x + dx,
            y: prev.y + dy,
        }));
    }, []);

    const handleInteractionStart = useCallback((clientX: number, clientY: number) => {
        isInteractingRef.current = true;
        lastPosRef.current = { x: clientX, y: clientY };
        if (viewerRef.current) viewerRef.current.style.cursor = 'grabbing';
    }, [viewerRef]);
    
    const handleInteractionMove = useCallback((e: MouseEvent) => {
        if (isInteractingRef.current) {
            const dx = e.clientX - lastPosRef.current.x;
            const dy = e.clientY - lastPosRef.current.y;
            lastPosRef.current = { x: e.clientX, y: e.clientY };
            pan(dx, dy);
        }
    }, [pan]);

    const handleInteractionEnd = useCallback(() => {
        isInteractingRef.current = false;
        if (viewerRef.current) viewerRef.current.style.cursor = 'grab';
    }, [viewerRef]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        handleInteractionStart(e.clientX, e.clientY);
    }, [handleInteractionStart]);

    const handleTouchStart = useCallback((e: React.TouchEvent) => {
        e.preventDefault();
        const touches = e.nativeEvent.touches;
        if (touches.length === 1) {
            handleInteractionStart(touches[0].clientX, touches[0].clientY);
        } else if (touches.length === 2) {
            isInteractingRef.current = false; // Stop panning
            lastTouchDistanceRef.current = getDistance(touches);
        }
    }, [handleInteractionStart]);

    const handleTouchMove = useCallback((e: TouchEvent) => {
        e.preventDefault();
        const touches = e.touches;
        if (touches.length === 1 && isInteractingRef.current) {
            const touch = touches[0];
            const dx = touch.clientX - lastPosRef.current.x;
            const dy = touch.clientY - lastPosRef.current.y;
            lastPosRef.current = { x: touch.clientX, y: touch.clientY };
            pan(dx, dy);
        } else if (touches.length === 2) {
            const newDist = getDistance(touches);
            const oldDist = lastTouchDistanceRef.current;
            if (oldDist === 0) {
                 lastTouchDistanceRef.current = newDist;
                 return;
            }
            
            const midpoint = getMidpoint(touches);
            const delta = (oldDist - newDist) / oldDist;
            zoom(delta, midpoint.x, midpoint.y);

            lastTouchDistanceRef.current = newDist;
        }
    }, [pan, zoom]);

    const handleTouchEnd = useCallback((e: TouchEvent) => {
        if (e.touches.length < 2) {
            lastTouchDistanceRef.current = 0;
        }
        if (e.touches.length === 1) {
            handleInteractionStart(e.touches[0].clientX, e.touches[0].clientY);
        } else if (e.touches.length === 0) {
            handleInteractionEnd();
        }
    }, [handleInteractionStart, handleInteractionEnd]);

    useEffect(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;

        viewer.addEventListener('touchmove', handleTouchMove, { passive: false });
        viewer.addEventListener('touchend', handleTouchEnd, { passive: false });
        viewer.addEventListener('touchcancel', handleTouchEnd, { passive: false });

        window.addEventListener('mousemove', handleInteractionMove);
        window.addEventListener('mouseup', handleInteractionEnd);
        
        return () => {
            if (viewer) {
                viewer.removeEventListener('touchmove', handleTouchMove);
                viewer.removeEventListener('touchend', handleTouchEnd);
                viewer.removeEventListener('touchcancel', handleTouchEnd);
            }
            window.removeEventListener('mousemove', handleInteractionMove);
            window.removeEventListener('mouseup', handleInteractionEnd);
        };
    }, [viewerRef, handleInteractionMove, handleInteractionEnd, handleTouchMove, handleTouchEnd]);
    
    const zoomIn = useCallback(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const rect = viewer.getBoundingClientRect();
        const delta = 1 - BUTTON_ZOOM_FACTOR;
        zoom(delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [viewerRef, zoom]);

    const zoomOut = useCallback(() => {
        const viewer = viewerRef.current;
        if (!viewer) return;
        const rect = viewer.getBoundingClientRect();
        const delta = 1 - (1 / BUTTON_ZOOM_FACTOR);
        zoom(delta, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }, [viewerRef, zoom]);

    const resetTransform = useCallback(() => {
        // Recalculating ensures that if the window was resized, the reset is correct.
        calculateInitialTransform();
    }, [calculateInitialTransform]);

    return { transform, handleWheel, handleMouseDown, handleTouchStart, zoomIn, zoomOut, resetTransform, isPositioned };
};