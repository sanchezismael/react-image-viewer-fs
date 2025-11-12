import React, { useState, useCallback, useRef, useEffect } from 'react';
import ImageViewer, { ImageViewerApi } from './components/ImageViewer';
import Toolbar from './components/Toolbar';
import { TransformState } from './hooks/useImageTransform';

// Fix for non-standard 'webkitdirectory' and 'directory' input attributes on input elements.
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

export interface AnnotationClass {
  id: number;
  name: string;
  color: string;
}

export type Point = { x: number; y: number };
export type Annotation = { id: string; points: Point[]; className: string };

export interface AnnotationStats {
  currentImage: { [className: string]: number };
  allImages: { [className: string]: number };
}

const PALETTE = [
  'rgba(239, 68, 68, 0.5)',   // red
  'rgba(59, 130, 246, 0.5)',  // blue
  'rgba(34, 197, 94, 0.5)',   // green
  'rgba(249, 115, 22, 0.5)',  // orange
  'rgba(168, 85, 247, 0.5)',  // purple
  'rgba(236, 72, 153, 0.5)',  // pink
  'rgba(14, 165, 233, 0.5)',  // sky
  'rgba(245, 158, 11, 0.5)',  // amber
];

const hexToRgba = (hex: string, alpha: number = 0.5): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return `rgba(255, 255, 255, ${alpha})`; // fallback
    }
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

// --- Confetti Component ---
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
// --- End Confetti Component ---

const App: React.FC = () => {
  const [images, setImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  const [allImageDimensions, setAllImageDimensions] = useState<Record<number, {width: number, height: number}>>({});
  const [activeTransform, setActiveTransform] = useState<TransformState>({ scale: 1, x: 0, y: 0 });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  
  const [annotationClasses, setAnnotationClasses] = useState<AnnotationClass[]>([]);
  const [selectedAnnotationClass, setSelectedAnnotationClass] = useState<string | null>(null);

  const [allAnnotations, setAllAnnotations] = useState<Record<number, Annotation[]>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats | null>(null);
  
  const [annotationTime, setAnnotationTime] = useState(0);
  const [allAnnotationTimes, setAllAnnotationTimes] = useState<Record<number, number>>({});
  const timerRef = useRef<number | null>(null);
  const annotationTimeRef = useRef(0);

  const [activeAnnotationTime, setActiveAnnotationTime] = useState(0);
  const [allActiveAnnotationTimes, setAllActiveAnnotationTimes] = useState<Record<number, number>>({});
  const activeTimerRef = useRef<number | null>(null);
  const activeAnnotationTimeRef = useRef(0);

  const [isTimerPaused, setIsTimerPaused] = useState(false);
  const inactivityTimerRef = useRef<number | null>(null);
  const isTimerPausedRef = useRef(false);

  const [completedImages, setCompletedImages] = useState<Record<number, boolean>>({});
  const [showConfetti, setShowConfetti] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageViewerRef = useRef<ImageViewerApi>(null);
  
  useEffect(() => {
    annotationTimeRef.current = annotationTime;
  }, [annotationTime]);

  useEffect(() => {
    activeAnnotationTimeRef.current = activeAnnotationTime;
  }, [activeAnnotationTime]);

  useEffect(() => {
    isTimerPausedRef.current = isTimerPaused;
  }, [isTimerPaused]);

  useEffect(() => {
    return () => {
      imageUrls.forEach(url => URL.revokeObjectURL(url));
    };
  }, [imageUrls]);

  // Effect to load image dimensions when the current image changes
  useEffect(() => {
    const currentUrl = imageUrls[currentIndex];
    if (!currentUrl) {
      setImageDimensions(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.src = currentUrl;

  }, [currentIndex, imageUrls]);

  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
    }
    
    if (isTimerPausedRef.current) {
        setIsTimerPaused(false);
    }

    inactivityTimerRef.current = window.setTimeout(() => {
        setIsTimerPaused(true);
    }, 5000); // 5 seconds of inactivity
  }, []);

  // Effect to manage the annotation timer
  useEffect(() => {
    if (images.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      return;
    }

    if (completedImages[currentIndex]) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        setAnnotationTime(allAnnotationTimes[currentIndex] || 0);
        setActiveAnnotationTime(allActiveAnnotationTimes[currentIndex] || 0);
        setIsTimerPaused(true);
        return;
    }
  
    if (timerRef.current) clearInterval(timerRef.current);
    
    const savedTime = allAnnotationTimes[currentIndex] || 0;
    setAnnotationTime(savedTime);
    const savedActiveTime = allActiveAnnotationTimes[currentIndex] || 0;
    setActiveAnnotationTime(savedActiveTime);
    
    resetInactivityTimer();
  
    timerRef.current = window.setInterval(() => {
      if (!isTimerPausedRef.current) {
        setAnnotationTime(prev => prev + 1);
      }
    }, 1000);
  
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [currentIndex, images.length, resetInactivityTimer, allAnnotationTimes, allActiveAnnotationTimes, completedImages]);

  // Effect to calculate annotation statistics
  useEffect(() => {
    if (Object.keys(allAnnotations).length === 0 || Object.keys(allImageDimensions).length === 0) {
      setAnnotationStats(null);
      return;
    }

    const polygonArea = (points: Point[]) => {
      let area = 0;
      for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y;
        area -= points[j].x * points[i].y;
      }
      return Math.abs(area / 2);
    };

    const newStats: AnnotationStats = {
      currentImage: {},
      allImages: {},
    };

    // Initialize stats for all classes to 0
    annotationClasses.forEach(cls => {
      newStats.currentImage[cls.name] = 0;
      newStats.allImages[cls.name] = 0;
    });
    
    // Calculate for current image
    const currentAnns = allAnnotations[currentIndex] || [];
    currentAnns.forEach(ann => {
      const area = polygonArea(ann.points);
      newStats.currentImage[ann.className] = (newStats.currentImage[ann.className] || 0) + area;
    });

    // Calculate for all images
    Object.entries(allAnnotations).forEach(([indexStr, annotations]) => {
      const index = parseInt(indexStr, 10);
      if (allImageDimensions[index]) {
        annotations.forEach(ann => {
          const area = polygonArea(ann.points);
          newStats.allImages[ann.className] = (newStats.allImages[ann.className] || 0) + area;
        });
      }
    });
    
    setAnnotationStats(newStats);

  }, [allAnnotations, allImageDimensions, currentIndex, annotationClasses]);

  const resetState = () => {
    imageUrls.forEach(url => URL.revokeObjectURL(url));
    setImages([]);
    setImageUrls([]);
    setCurrentIndex(0);
    setIsDrawingMode(false);
    setAllAnnotations({});
    setSelectedAnnotationId(null);
    setAnnotationClasses([]);
    setSelectedAnnotationClass(null);
    setImageDimensions(null);
    setAllImageDimensions({});
    setHasUnsavedChanges(false);
    setAnnotationStats(null);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (activeTimerRef.current) {
      clearInterval(activeTimerRef.current);
      activeTimerRef.current = null;
    }
    setAnnotationTime(0);
    annotationTimeRef.current = 0;
    setAllAnnotationTimes({});
    setActiveAnnotationTime(0);
    activeAnnotationTimeRef.current = 0;
    setAllActiveAnnotationTimes({});
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
      inactivityTimerRef.current = null;
    }
    setIsTimerPaused(false);
    isTimerPausedRef.current = false;
    setCompletedImages({});
    setShowConfetti(false);
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
  
    resetState();
  
    const allFiles = Array.from(files);
    const imageFiles = allFiles
      .filter(file => file.type.startsWith('image/') && !file.name.endsWith('_mask.png'))
      .sort((a, b) => a.name.localeCompare(b.name));
    const jsonFiles = allFiles.filter(file => file.name.endsWith('.json'));
    const completedFile = allFiles.find(file => file.name === 'completed_images.txt');
  
    if (imageFiles.length === 0) {
      if (event.target) event.target.value = '';
      return;
    }
  
    const newUrls = imageFiles.map(file => URL.createObjectURL(file));
    setImages(imageFiles);
    setImageUrls(newUrls);

    // Load completed status if file exists
    if (completedFile) {
      try {
        const completedContent = await completedFile.text();
        const completedNames = new Set(completedContent.split('\n').map(name => name.trim()).filter(Boolean));
        const initialCompletedState: Record<number, boolean> = {};
        imageFiles.forEach((file, index) => {
          if (completedNames.has(file.name)) {
            initialCompletedState[index] = true;
          }
        });
        setCompletedImages(initialCompletedState);
      } catch (e) {
        console.error("Could not read completed images file:", e);
      }
    }

    // Load all image dimensions for stats
    const dimsPromises = newUrls.map(url => new Promise<{width: number, height: number}>((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => resolve({ width: 0, height: 0 }); // Handle broken images
      img.src = url;
    }));

    const dims = await Promise.all(dimsPromises);
    const dimsRecord = dims.reduce((acc, dim, index) => {
      acc[index] = dim;
      return acc;
    }, {} as Record<number, {width: number, height: number}>);
    setAllImageDimensions(dimsRecord);
  
    if (jsonFiles.length > 0) {
      const jsonContents = await Promise.all(jsonFiles.map(file => file.text()));
      
      const jsonAnnotationsMap = new Map<string, any[]>();
      jsonContents.forEach((content, index) => {
        try {
          const data = JSON.parse(content);
          const baseName = jsonFiles[index].name.split('.').slice(0, -1).join('.');
          if (data.annotations && Array.isArray(data.annotations)) {
            jsonAnnotationsMap.set(baseName, data.annotations);
          }
        } catch (e) {
          console.error(`Error parsing JSON file ${jsonFiles[index].name}:`, e);
        }
      });
      
      const newAllAnnotations: Record<number, Annotation[]> = {};
      const loadedClasses = new Map<string, { id: number }>();
  
      imageFiles.forEach((imageFile, index) => {
        const imageBaseName = imageFile.name.split('.').slice(0, -1).join('.');
        const annotationsData = jsonAnnotationsMap.get(imageBaseName);
        
        if (annotationsData) {
          newAllAnnotations[index] = annotationsData.map((ann: any) => {
            if (ann.className && ann.classId && !loadedClasses.has(ann.className)) {
              loadedClasses.set(ann.className, { id: ann.classId });
            }
            return {
              id: `${Date.now()}-${Math.random()}`,
              points: ann.points,
              className: ann.className,
            };
          });
        }
      });
  
      const finalClasses: AnnotationClass[] = [];
      let colorIndex = 0;
      for (const [name, data] of loadedClasses.entries()) {
        finalClasses.push({
          name,
          id: data.id,
          color: PALETTE[colorIndex % PALETTE.length]
        });
        colorIndex++;
      }
      
      finalClasses.sort((a, b) => a.id - b.id);
      
      setAnnotationClasses(finalClasses);
      setAllAnnotations(newAllAnnotations);
      
      if (finalClasses.length > 0) {
        setSelectedAnnotationClass(finalClasses[0].name);
      }
    }
  
    if (event.target) {
      event.target.value = '';
    }
  };

  const triggerFileSelect = useCallback(() => fileInputRef.current?.click(), []);
  const clearImages = useCallback(() => resetState(), [imageUrls]);

  const changeImage = useCallback((newIndex: number) => {
    if (!completedImages[currentIndex]) {
      setAllAnnotationTimes(prev => ({ ...prev, [currentIndex]: annotationTimeRef.current }));
      setAllActiveAnnotationTimes(prev => ({ ...prev, [currentIndex]: activeAnnotationTimeRef.current }));
    }
    setCurrentIndex(newIndex);
    setSelectedAnnotationId(null);
    setImageDimensions(null); // Reset dimensions to trigger loading for the new image
    setHasUnsavedChanges(false);
  }, [currentIndex, completedImages]);

  const handleExportJson = useCallback(() => {
    const currentAnns = allAnnotations[currentIndex] || [];
    if (currentAnns.length === 0 || !images[currentIndex]) return;

    const classIdMap = new Map(annotationClasses.map(cls => [cls.name, cls.id]));
    const exportData = {
      imageName: images[currentIndex].name,
      annotations: currentAnns.map(ann => ({
        className: ann.className,
        classId: classIdMap.get(ann.className),
        points: ann.points,
      }))
    };
    
    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${images[currentIndex].name.split('.').slice(0, -1).join('.')}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [allAnnotations, currentIndex, images, annotationClasses]);

  const handleExportMask = useCallback(() => {
    const currentAnns = allAnnotations[currentIndex] || [];
    if (currentAnns.length === 0 || !imageDimensions) return;
    
    const canvas = document.createElement('canvas');
    canvas.width = imageDimensions.width;
    canvas.height = imageDimensions.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgb(0, 0, 0)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const classIdMap = new Map(annotationClasses.map(cls => [cls.name, cls.id]));

    currentAnns.forEach(ann => {
      const classId = classIdMap.get(ann.className);
      if (classId === undefined || ann.points.length < 3) return;
      
      ctx.fillStyle = `rgb(${classId}, ${classId}, ${classId})`;
      ctx.beginPath();
      ctx.moveTo(ann.points[0].x, ann.points[0].y);
      for (let i = 1; i < ann.points.length; i++) {
        ctx.lineTo(ann.points[i].x, ann.points[i].y);
      }
      ctx.closePath();
      ctx.fill();
    });

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${images[currentIndex].name.split('.').slice(0, -1).join('.')}_mask.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');

  }, [allAnnotations, currentIndex, imageDimensions, annotationClasses, images]);

  const handleExportTimes = useCallback(() => {
    if (images.length === 0) return;
    const timesToExport = { ...allAnnotationTimes };
    if (!completedImages[currentIndex]) {
        timesToExport[currentIndex] = annotationTimeRef.current;
    }
    
    const activeTimesToExport = { ...allActiveAnnotationTimes };
    if (!completedImages[currentIndex]) {
        activeTimesToExport[currentIndex] = activeAnnotationTimeRef.current;
    }

    const format = (totalSeconds: number) => {
        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;
        return `${minutes} minute(s) ${seconds} second(s)`;
    };
  
    let content = "Annotation Times:\n\n";
    images.forEach((image, index) => {
      const totalTime = timesToExport[index] || 0;
      const activeTime = activeTimesToExport[index] || 0;
      content += `${image.name}:\n`;
      content += `  - Total Time: ${format(totalTime)}\n`;
      content += `  - Active Annotation Time: ${format(activeTime)}\n\n`;
    });
  
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'annotation_times.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [allAnnotationTimes, allActiveAnnotationTimes, currentIndex, images, completedImages]);

  const handleExportCompleted = useCallback(() => {
    if (images.length === 0) return;

    const completedFileNames = images
      .map((image, index) => ({ name: image.name, index }))
      .filter(item => completedImages[item.index])
      .map(item => item.name);

    if (completedFileNames.length === 0) {
      alert("No images have been marked as complete.");
      return;
    }

    const content = completedFileNames.join('\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'completed_images.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [images, completedImages]);

  const goToPrevious = useCallback(() => {
    if (hasUnsavedChanges) {
      handleExportJson();
      handleExportMask();
    }
    changeImage(currentIndex === 0 ? images.length - 1 : currentIndex - 1);
  }, [images.length, currentIndex, changeImage, hasUnsavedChanges, handleExportJson, handleExportMask]);

  const goToNext = useCallback(() => {
    if (hasUnsavedChanges) {
      handleExportJson();
      handleExportMask();
    }
    changeImage(currentIndex === images.length - 1 ? 0 : currentIndex + 1);
  }, [images.length, currentIndex, changeImage, hasUnsavedChanges, handleExportJson, handleExportMask]);

  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < images.length) {
      if (hasUnsavedChanges) {
        handleExportJson();
        handleExportMask();
      }
      changeImage(index);
    } else {
      alert(`Please enter a number between 1 and ${images.length}.`);
    }
  }, [images.length, changeImage, hasUnsavedChanges, handleExportJson, handleExportMask]);

  const handleAddAnnotation = useCallback((newAnnotation: Omit<Annotation, 'id'>) => {
    if (!selectedAnnotationClass || completedImages[currentIndex]) return;
    const id = `${Date.now()}-${Math.random()}`;
    const annotationWithId = { ...newAnnotation, id, className: selectedAnnotationClass };
    setAllAnnotations(prev => {
        const currentAnns = prev[currentIndex] || [];
        return { ...prev, [currentIndex]: [...currentAnns, annotationWithId] };
    });
    setHasUnsavedChanges(true);
  }, [currentIndex, selectedAnnotationClass, completedImages]);

  const handleSelectAnnotation = useCallback((id: string | null) => setSelectedAnnotationId(id), []);

  const handleDeleteAnnotation = useCallback((id: string) => {
    if (completedImages[currentIndex]) return;
    setAllAnnotations(prev => ({
        ...prev,
        [currentIndex]: (prev[currentIndex] || []).filter(ann => ann.id !== id)
    }));
    if (selectedAnnotationId === id) {
        setSelectedAnnotationId(null);
    }
    setHasUnsavedChanges(true);
  }, [currentIndex, selectedAnnotationId, completedImages]);

  const handleTransformChange = useCallback((newTransform: TransformState) => setActiveTransform(newTransform), []);
  
  const handleToggleDrawingMode = useCallback(() => {
    if (completedImages[currentIndex]) return;
    setIsDrawingMode(prev => !prev);
  }, [completedImages, currentIndex]);

  const handleSelectAnnotationClass = useCallback((className: string) => setSelectedAnnotationClass(className), []);

  const handleAddAnnotationClass = useCallback((name: string, id: number) => {
    const trimmedName = name.trim();
    if (!trimmedName || annotationClasses.some(cls => cls.name === trimmedName || cls.id === id)) {
      alert("Class name and ID must be unique.");
      return;
    }
    const colorIndex = annotationClasses.length % PALETTE.length;
    const newClass = { id, name: trimmedName, color: PALETTE[colorIndex] };
    const newClasses = [...annotationClasses, newClass];
    setAnnotationClasses(newClasses);
    if(!selectedAnnotationClass) {
        setSelectedAnnotationClass(newClass.name);
    }
  }, [annotationClasses, selectedAnnotationClass]);
  
  const handleUpdateAnnotationClassColor = useCallback((className: string, newHexColor: string) => {
    const newRgbaColor = hexToRgba(newHexColor);
    setAnnotationClasses(prevClasses =>
        prevClasses.map(cls =>
            cls.name === className ? { ...cls, color: newRgbaColor } : cls
        )
    );
  }, []);

  const handleMarkAsComplete = useCallback(() => {
    if (completedImages[currentIndex]) return;

    if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
    }
    if (activeTimerRef.current) {
        clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
    }
    if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
        inactivityTimerRef.current = null;
    }
    
    setAllAnnotationTimes(prev => ({ ...prev, [currentIndex]: annotationTimeRef.current }));
    setAllActiveAnnotationTimes(prev => ({ ...prev, [currentIndex]: activeAnnotationTimeRef.current }));

    setCompletedImages(prev => ({ ...prev, [currentIndex]: true }));
    setIsTimerPaused(true);

    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, [currentIndex, completedImages]);


  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Annotation deletion shortcut works regardless of focus
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        e.preventDefault();
        handleDeleteAnnotation(selectedAnnotationId);
        return;
      }
      
      // Prevent other shortcuts when typing in form elements
      if (['INPUT', 'BUTTON', 'TEXTAREA'].includes(document.activeElement?.tagName || '')) {
        return;
      }

      // Image navigation
      if (images.length > 1) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          goToPrevious();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          goToNext();
        }
      }
      
      // Toggle drawing mode shortcut ('d' for draw)
      if (e.key.toLowerCase() === 'd') {
        e.preventDefault();
        // The button is disabled if no class is selected, so the shortcut should be too.
        if (selectedAnnotationClass) {
          handleToggleDrawingMode();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    images.length, 
    goToPrevious, 
    goToNext, 
    selectedAnnotationId, 
    handleDeleteAnnotation,
    selectedAnnotationClass,
    handleToggleDrawingMode
  ]);


  const handleZoomIn = () => {
    resetInactivityTimer();
    imageViewerRef.current?.zoomIn();
  };
  const handleZoomOut = () => {
    resetInactivityTimer();
    imageViewerRef.current?.zoomOut();
  };
  const handleResetTransform = () => {
    resetInactivityTimer();
    imageViewerRef.current?.resetTransform();
  };

  const startActiveTimer = useCallback(() => {
    if (activeTimerRef.current || completedImages[currentIndex]) return;
    activeTimerRef.current = window.setInterval(() => {
        setActiveAnnotationTime(prev => prev + 1);
    }, 1000);
  }, [completedImages, currentIndex]);

  const stopActiveTimer = useCallback(() => {
    if (activeTimerRef.current) {
        clearInterval(activeTimerRef.current);
        activeTimerRef.current = null;
    }
  }, []);

  const currentAnnotations = allAnnotations[currentIndex] || [];
  const completedImagesCount = Object.values(completedImages).filter(isCompleted => isCompleted).length;
  const totalImages = images.length;
  const isCurrentImageCompleted = !!completedImages[currentIndex];

  return (
    <div className="w-screen h-screen bg-gray-900 flex flex-row overflow-hidden font-sans">
      {showConfetti && <Confetti />}
      <input type="file" ref={fileInputRef} onChange={handleFileChange} accept="image/*,.json,.txt" className="hidden" webkitdirectory="" directory="" multiple/>
      
      {imageUrls.length > 0 && (
        <Toolbar
          images={images}
          currentIndex={currentIndex}
          transform={activeTransform}
          isDrawingMode={isDrawingMode}
          annotations={currentAnnotations}
          annotationClasses={annotationClasses}
          selectedAnnotationId={selectedAnnotationId}
          selectedAnnotationClass={selectedAnnotationClass}
          totalImages={totalImages}
          completedImagesCount={completedImagesCount}
          annotationStats={annotationStats}
          currentImageDimensions={imageDimensions}
          allImageDimensions={allImageDimensions}
          annotationTime={annotationTime}
          activeAnnotationTime={activeAnnotationTime}
          isTimerPaused={isTimerPaused}
          isCurrentImageCompleted={isCurrentImageCompleted}
          onFileSelect={triggerFileSelect}
          onClose={clearImages}
          onPrevious={goToPrevious}
          onNext={goToNext}
          onGoToIndex={goToIndex}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleResetTransform}
          onToggleDrawingMode={handleToggleDrawingMode}
          onAddAnnotationClass={handleAddAnnotationClass}
          onUpdateAnnotationClassColor={handleUpdateAnnotationClassColor}
          onSelectAnnotationClass={handleSelectAnnotationClass}
          onSelectAnnotation={handleSelectAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onExportJson={handleExportJson}
          onExportMask={handleExportMask}
          onExportTimes={handleExportTimes}
          onExportCompleted={handleExportCompleted}
          onMarkAsComplete={handleMarkAsComplete}
        />
      )}
      
      <main className="flex-1 h-full flex items-center justify-center relative bg-black/50 p-8">
        {imageUrls.length > 0 && imageDimensions ? (
          <ImageViewer
            ref={imageViewerRef}
            src={imageUrls[currentIndex]}
            key={imageUrls[currentIndex]}
            onTransformChange={handleTransformChange}
            isDrawingMode={isDrawingMode && !isCurrentImageCompleted}
            annotations={currentAnnotations}
            annotationClasses={annotationClasses}
            selectedAnnotationClass={selectedAnnotationClass}
            selectedAnnotationId={selectedAnnotationId}
            onAddAnnotation={handleAddAnnotation}
            onSelectAnnotation={handleSelectAnnotation}
            imageDimensions={imageDimensions}
            onActivity={resetInactivityTimer}
            startActiveTimer={startActiveTimer}
            stopActiveTimer={stopActiveTimer}
          />
        ) : (
          <div className="text-center p-8">
              <h1 className="text-4xl font-bold mb-4 text-gray-100">Image Folder Viewer</h1>
              <p className="text-lg text-gray-400 mb-8">Select a folder to view all its images and annotations.</p>
              <button
                  onClick={triggerFileSelect}
                  className="px-8 py-4 text-lg font-semibold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500"
              >
                  Select Folder
              </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;