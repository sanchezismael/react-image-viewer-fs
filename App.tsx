import React, { useState, useCallback, useRef, useEffect } from 'react';
import ImageViewer, { ImageViewerApi } from './components/ImageViewer';
import Toolbar from './components/Toolbar';
import DirectoryBrowser from './components/DirectoryBrowser';
import { TransformState } from './hooks/useImageTransform';
import { getFiles, readJsonFile, saveJsonFile, saveImageFile, ImageFile } from './utils/api';

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

const App: React.FC = () => {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  const [allImageDimensions, setAllImageDimensions] = useState<Record<number, {width: number, height: number}>>({});
  const [activeTransform, setActiveTransform] = useState<TransformState>({ scale: 1, x: 0, y: 0 });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  
  const [annotationClasses, setAnnotationClasses] = useState<AnnotationClass[]>([]);
  const [selectedAnnotationClass, setSelectedAnnotationClass] = useState<string | null>(null);

  const [allAnnotations, setAllAnnotations] = useState<Record<number, Annotation[]>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats | null>(null);

  const imageViewerRef = useRef<ImageViewerApi>(null);

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
    setImageFiles([]);
    setImageUrls([]);
    setImagePaths([]);
    setCurrentDirectory('');
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
  };

  const handleDirectorySelect = async (dirPath: string) => {
    try {
      resetState();
      setShowDirectoryBrowser(false);
      
      const filesData = await getFiles(dirPath);
      setCurrentDirectory(dirPath);
      setImageFiles(filesData.images);
      
      const urls = filesData.images.map(img => img.url);
      const paths = filesData.images.map(img => img.path);
      setImageUrls(urls);
      setImagePaths(paths);

      // Load all image dimensions for stats
      const dimsPromises = urls.map(url => new Promise<{width: number, height: number}>((resolve) => {
        const img = new Image();
        img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = url;
      }));

      const dims = await Promise.all(dimsPromises);
      const dimsRecord = dims.reduce((acc, dim, index) => {
        acc[index] = dim;
        return acc;
      }, {} as Record<number, {width: number, height: number}>);
      setAllImageDimensions(dimsRecord);

      // Load JSON annotations if available
      if (filesData.jsonFiles.length > 0) {
        const jsonDataPromises = filesData.jsonFiles.map(jsonFile => 
          readJsonFile(jsonFile.path).catch(err => {
            console.error(`Error loading ${jsonFile.name}:`, err);
            return null;
          })
        );
        
        const jsonContents = await Promise.all(jsonDataPromises);
        
        const jsonAnnotationsMap = new Map<string, any[]>();
        jsonContents.forEach((data, index) => {
          if (data && data.annotations && Array.isArray(data.annotations)) {
            const baseName = filesData.jsonFiles[index].name.split('.').slice(0, -1).join('.');
            jsonAnnotationsMap.set(baseName, data.annotations);
          }
        });
        
        const newAllAnnotations: Record<number, Annotation[]> = {};
        const loadedClasses = new Map<string, { id: number }>();

        filesData.images.forEach((imageFile, index) => {
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
    } catch (error) {
      console.error('Error loading directory:', error);
      alert(`Failed to load directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const triggerFileSelect = useCallback(() => setShowDirectoryBrowser(true), []);
  const clearImages = useCallback(() => resetState(), []);

  const changeImage = useCallback((newIndex: number) => {
    setCurrentIndex(newIndex);
    setSelectedAnnotationId(null);
    setImageDimensions(null);
    setHasUnsavedChanges(false);
  }, []);

  const handleExportJson = useCallback(async () => {
    const currentAnns = allAnnotations[currentIndex] || [];
    if (currentAnns.length === 0 || !imageFiles[currentIndex]) return;

    const classIdMap = new Map(annotationClasses.map(cls => [cls.name, cls.id]));
    const exportData = {
      imageName: imageFiles[currentIndex].name,
      annotations: currentAnns.map(ann => ({
        className: ann.className,
        classId: classIdMap.get(ann.className),
        points: ann.points,
      }))
    };
    
    const jsonPath = imagePaths[currentIndex].replace(/\.[^.]+$/, '.json');
    
    try {
      await saveJsonFile(jsonPath, exportData);
      console.log('JSON saved successfully:', jsonPath);
    } catch (error) {
      console.error('Error saving JSON:', error);
      alert('Failed to save JSON file');
    }
  }, [allAnnotations, currentIndex, imageFiles, imagePaths, annotationClasses]);

  const handleExportMask = useCallback(async () => {
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

    const base64Data = canvas.toDataURL('image/png');
    const maskPath = imagePaths[currentIndex].replace(/\.[^.]+$/, '_mask.png');
    
    try {
      await saveImageFile(maskPath, base64Data);
      console.log('Mask saved successfully:', maskPath);
    } catch (error) {
      console.error('Error saving mask:', error);
      alert('Failed to save mask file');
    }
  }, [allAnnotations, currentIndex, imageDimensions, annotationClasses, imagePaths]);

  const goToPrevious = useCallback(() => {
    if (hasUnsavedChanges) {
      handleExportJson();
      handleExportMask();
    }
    changeImage(currentIndex === 0 ? imageFiles.length - 1 : currentIndex - 1);
  }, [imageFiles.length, currentIndex, changeImage, hasUnsavedChanges, handleExportJson, handleExportMask]);

  const goToNext = useCallback(() => {
    if (hasUnsavedChanges) {
      handleExportJson();
      handleExportMask();
    }
    changeImage(currentIndex === imageFiles.length - 1 ? 0 : currentIndex + 1);
  }, [imageFiles.length, currentIndex, changeImage, hasUnsavedChanges, handleExportJson, handleExportMask]);

  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < imageFiles.length) {
      if (hasUnsavedChanges) {
        handleExportJson();
        handleExportMask();
      }
      changeImage(index);
    } else {
      alert(`Please enter a number between 1 and ${imageFiles.length}.`);
    }
  }, [imageFiles.length, changeImage, hasUnsavedChanges, handleExportJson, handleExportMask]);

  const handleAddAnnotation = useCallback((newAnnotation: Omit<Annotation, 'id'>) => {
    if (!selectedAnnotationClass) return;
    const id = `${Date.now()}-${Math.random()}`;
    const annotationWithId = { ...newAnnotation, id, className: selectedAnnotationClass };
    setAllAnnotations(prev => {
        const currentAnns = prev[currentIndex] || [];
        return { ...prev, [currentIndex]: [...currentAnns, annotationWithId] };
    });
    setHasUnsavedChanges(true);
  }, [currentIndex, selectedAnnotationClass]);

  const handleSelectAnnotation = useCallback((id: string | null) => setSelectedAnnotationId(id), []);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAllAnnotations(prev => ({
        ...prev,
        [currentIndex]: (prev[currentIndex] || []).filter(ann => ann.id !== id)
    }));
    if (selectedAnnotationId === id) {
        setSelectedAnnotationId(null);
    }
    setHasUnsavedChanges(true);
  }, [currentIndex, selectedAnnotationId]);

  const handleTransformChange = useCallback((newTransform: TransformState) => setActiveTransform(newTransform), []);
  const handleToggleDrawingMode = useCallback(() => setIsDrawingMode(prev => !prev), []);
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
      if (imageFiles.length > 1) {
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
    imageFiles.length, 
    goToPrevious, 
    goToNext, 
    selectedAnnotationId, 
    handleDeleteAnnotation,
    selectedAnnotationClass,
    handleToggleDrawingMode
  ]);


  const handleZoomIn = () => imageViewerRef.current?.zoomIn();
  const handleZoomOut = () => imageViewerRef.current?.zoomOut();
  const handleResetTransform = () => imageViewerRef.current?.resetTransform();

  const currentAnnotations = allAnnotations[currentIndex] || [];
  const annotatedImagesCount = Object.values(allAnnotations).filter((anns: Annotation[]) => anns.length > 0).length;
  const totalImages = imageFiles.length;

  return (
    <div className="w-screen h-screen bg-gray-900 flex flex-row overflow-hidden font-sans">
      {showDirectoryBrowser && (
        <DirectoryBrowser
          onSelectDirectory={handleDirectorySelect}
          onClose={() => setShowDirectoryBrowser(false)}
        />
      )}
      
      {imageUrls.length > 0 && (
        <Toolbar
          images={imageFiles}
          currentIndex={currentIndex}
          transform={activeTransform}
          isDrawingMode={isDrawingMode}
          annotations={currentAnnotations}
          annotationClasses={annotationClasses}
          selectedAnnotationId={selectedAnnotationId}
          selectedAnnotationClass={selectedAnnotationClass}
          totalImages={totalImages}
          annotatedImagesCount={annotatedImagesCount}
          annotationStats={annotationStats}
          currentImageDimensions={imageDimensions}
          allImageDimensions={allImageDimensions}
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
        />
      )}
      
      <main className="flex-1 h-full flex items-center justify-center relative bg-black/50 p-8">
        {imageUrls.length > 0 && imageDimensions ? (
          <ImageViewer
            ref={imageViewerRef}
            src={imageUrls[currentIndex]}
            key={imageUrls[currentIndex]}
            onTransformChange={handleTransformChange}
            isDrawingMode={isDrawingMode}
            annotations={currentAnnotations}
            annotationClasses={annotationClasses}
            selectedAnnotationClass={selectedAnnotationClass}
            selectedAnnotationId={selectedAnnotationId}
            onAddAnnotation={handleAddAnnotation}
            onSelectAnnotation={handleSelectAnnotation}
            imageDimensions={imageDimensions}
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