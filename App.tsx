import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import ImageViewer, { ImageViewerApi } from './components/ImageViewer';
import Toolbar from './components/Toolbar';
import DashboardModal from './components/DashboardModal';
import DirectoryBrowser from './components/DirectoryBrowser';
import Confetti from './components/Confetti';
import RocketLaunchAnimation from './components/RocketLaunchAnimation';
import { TransformState } from './hooks/useImageTransform';
import { getFiles, readJsonFile, saveJsonFile, saveImageFile, saveTextFile, readTextFile, deleteImageAssets } from './utils/api';
import { DashboardEntry } from './types/dashboard';
import { useTimer } from './hooks/useTimer';
import { useProjectData } from './hooks/useProjectData';
import { useAnnotations } from './hooks/useAnnotations';
import { CONFIG_FILE_NAME, DASHBOARD_STATS_FILE, MAX_DASHBOARD_ENTRIES, PALETTE } from './utils/constants';
import { joinPathSegments, getDefaultOutputPaths, OutputPaths, hexToRgba } from './utils/helpers';

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

const polygonArea = (points: Point[]) => {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return Math.abs(area / 2);
};

const appendDashboardEntry = (entries: DashboardEntry[], entry: DashboardEntry) => {
  const updated = [...entries, entry];
  if (updated.length > MAX_DASHBOARD_ENTRIES) {
    updated.shift();
  }
  return updated;
};

const buildHistoricalDashboardEntries = (
  files: any[],
  annotations: Record<number, Annotation[]>,
  totalTimes: Record<number, number>,
  activeTimes: Record<number, number>
): DashboardEntry[] => {
  const entries: DashboardEntry[] = [];
  files.forEach((file, index) => {
    const imageAnnotations = annotations[index] || [];
    const totalTime = totalTimes[index] || 0;
    const activeTime = activeTimes[index] || 0;
    if (imageAnnotations.length === 0 && totalTime === 0 && activeTime === 0) {
      return;
    }
    const totalPixels = imageAnnotations.reduce((sum, ann) => {
      if (ann.points.length < 3) {
        return sum;
      }
      return sum + polygonArea(ann.points);
    }, 0);

    entries.push({
      id: `${file.path}-${index}`,
      imageName: file.name,
      imagePath: file.path,
      timestamp: file.modifiedAt || new Date().toISOString(),
      annotationCount: imageAnnotations.length,
      totalPixelsAnnotated: totalPixels,
      totalTimeSeconds: totalTime,
      activeTimeSeconds: activeTime,
    });
  });
  return entries;
};

const App: React.FC = () => {
  const {
    imageFiles,
    currentDirectory,
    currentIndex,
    imageDimensions,
    allImageDimensions,
    isLoadingProject,
    completedImages,
    outputPaths,
    showDirectoryBrowser,
    isDeletingImage,
    setImageFiles,
    setCurrentDirectory,
    setCurrentIndex,
    setImageDimensions,
    setAllImageDimensions,
    setIsLoadingProject,
    setCompletedImages,
    setOutputPaths,
    setShowDirectoryBrowser,
    setIsDeletingImage,
    handleDirectorySelect: loadDirectory,
    goToPrevious: navigatePrevious,
    goToNext: navigateNext,
    goToIndex: navigateToIndex,
    triggerFileSelect
  } = useProjectData();

  const {
    annotationClasses,
    selectedAnnotationClass,
    allAnnotations,
    selectedAnnotationId,
    annotationStats,
    isSaving,
    setAnnotationClasses,
    setSelectedAnnotationClass,
    setAllAnnotations,
    setSelectedAnnotationId,
    setAnnotationStats,
    setIsSaving,
    handleAddAnnotationClass,
    handleUpdateAnnotationClassColor,
    handleSelectAnnotationClass,
    handleAddAnnotation: addAnnotation,
    handleSelectAnnotation,
    handleDeleteAnnotation: deleteAnnotation
  } = useAnnotations(currentIndex);

  const [timerRestartKey, setTimerRestartKey] = React.useState(0);

  const {
    annotationTime,
    activeAnnotationTime,
    allAnnotationTimes,
    allActiveAnnotationTimes,
    isTimerPaused,
    totalProjectTime,
    totalActiveProjectTime,
    setAnnotationTime,
    setActiveAnnotationTime,
    setAllAnnotationTimes,
    setAllActiveAnnotationTimes,
    setIsTimerPaused,
    resetInactivityTimer,
    startActiveTimer,
    stopActiveTimer,
    resetTimersForNewImage,
    clearTimers
  } = useTimer(currentIndex, !!completedImages[currentIndex], timerRestartKey);

  const [activeTransform, setActiveTransform] = useState<TransformState>({ scale: 1, x: 0, y: 0 });
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [dashboardEntries, setDashboardEntries] = useState<DashboardEntry[]>([]);
  const dashboardEntriesRef = useRef<DashboardEntry[]>([]);
  const [isDashboardOpen, setIsDashboardOpen] = useState(false);
  const [wandTolerance, setWandTolerance] = useState<number>(15);
  const [wandMode, setWandMode] = useState<boolean>(false);
  const wandImageDataRef = useRef<ImageData | null>(null);
  const wandCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [lastDirectory, setLastDirectory] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('lastDirectory') || '';
  });

  const imageViewerRef = useRef<ImageViewerApi>(null);
  const saveInProgressRef = useRef<Promise<boolean> | null>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const liveDashboardEntries = React.useMemo(() => {
    if (imageFiles.length === 0) {
      return [] as DashboardEntry[];
    }
    const timesSnapshot = { ...allAnnotationTimes };
    const activeSnapshot = { ...allActiveAnnotationTimes };
    if (!completedImages[currentIndex]) {
      timesSnapshot[currentIndex] = annotationTime;
      activeSnapshot[currentIndex] = activeAnnotationTime;
    }
    return buildHistoricalDashboardEntries(imageFiles, allAnnotations, timesSnapshot, activeSnapshot);
  }, [imageFiles, allAnnotations, allAnnotationTimes, allActiveAnnotationTimes, currentIndex, completedImages, annotationTime, activeAnnotationTime]);

  useEffect(() => {
    dashboardEntriesRef.current = dashboardEntries;
  }, [dashboardEntries]);

  // Preload neighbors to make navigation snappier
  useEffect(() => {
    if (!imageFiles.length) return;
    const preload = (idx: number) => {
      const url = imageFiles[idx]?.url;
      if (url) {
        const img = new Image();
        img.src = url;
      }
    };
    preload(currentIndex + 1);
    preload(currentIndex - 1);
  }, [currentIndex, imageFiles]);

  const hydrateDashboardEntries = useCallback(async (timesPath?: string, fallbackEntries?: DashboardEntry[]) => {
    if (!timesPath) {
      const entries = fallbackEntries || [];
      setDashboardEntries(entries);
      dashboardEntriesRef.current = entries;
      return;
    }

    const statsPath = joinPathSegments(timesPath, DASHBOARD_STATS_FILE);
    try {
      const data = await readJsonFile(statsPath);
      if (Array.isArray(data)) {
        setDashboardEntries(data as DashboardEntry[]);
        dashboardEntriesRef.current = data as DashboardEntry[];
        return;
      }
    } catch (error) {
      console.debug('Dashboard stats not found, attempting to bootstrap with existing data.', error);
    }

    const entries = fallbackEntries || [];
    setDashboardEntries(entries);
    dashboardEntriesRef.current = entries;
    if (timesPath && entries.length > 0) {
      try {
        await saveJsonFile(statsPath, entries);
      } catch (error) {
        console.error('Error creating dashboard stats file:', error);
      }
    }
  }, []);

  useEffect(() => {
    if (!outputPaths?.times) {
      return;
    }
    void hydrateDashboardEntries(outputPaths.times);
  }, [outputPaths?.times, hydrateDashboardEntries]);

  // Lazy load dimensions for current image
  useEffect(() => {
    if (!imageFiles[currentIndex]) return;
    
    // If we already have dimensions for this index, use them
    if (allImageDimensions[currentIndex]) {
      if (!imageDimensions || imageDimensions.width !== allImageDimensions[currentIndex].width) {
        setImageDimensions(allImageDimensions[currentIndex]);
      }
      return;
    }

    const img = new Image();
    img.onload = () => {
      const dims = { width: img.naturalWidth, height: img.naturalHeight };
      setImageDimensions(dims);
      setAllImageDimensions(prev => ({ ...prev, [currentIndex]: dims }));
    };
    img.onerror = () => {
      console.error(`Failed to load image dimensions for ${imageFiles[currentIndex].name}`);
      const dims = { width: 0, height: 0 };
      setImageDimensions(dims);
      setAllImageDimensions(prev => ({ ...prev, [currentIndex]: dims }));
    };
    img.src = imageFiles[currentIndex].url;
  }, [currentIndex, imageFiles, allImageDimensions, imageDimensions, setImageDimensions, setAllImageDimensions]);

  // Lazy load annotations for current image
  useEffect(() => {
    const loadAnnotations = async () => {
      if (!imageFiles[currentIndex] || !outputPaths?.annotations) return;
      
      // If we already have annotations for this index (even empty array), don't reload
      if (allAnnotations[currentIndex] !== undefined) return;

      const imageBaseName = imageFiles[currentIndex].name.replace(/\.[^.]+$/, '');
      const jsonPath = joinPathSegments(outputPaths.annotations, `${imageBaseName}.json`);
      
      try {
        const data = await readJsonFile(jsonPath);
        if (data && data.annotations && Array.isArray(data.annotations)) {
          const loadedAnns = data.annotations.map((ann: any) => ({
            id: `${Date.now()}-${Math.random()}`,
            points: ann.points,
            className: ann.className,
          }));
          
          setAllAnnotations(prev => ({ ...prev, [currentIndex]: loadedAnns }));
          
          // Update classes if new ones found
          const newClasses = new Set(annotationClasses.map(c => c.name));
          let updatedClasses = [...annotationClasses];
          let changed = false;
          
          loadedAnns.forEach((ann: any) => {
            if (!newClasses.has(ann.className)) {
              newClasses.add(ann.className);
              updatedClasses.push({
                id: ann.classId || Date.now(),
                name: ann.className,
                color: PALETTE[updatedClasses.length % PALETTE.length]
              });
              changed = true;
            }
          });
          
          if (changed) {
            setAnnotationClasses(updatedClasses);
            if (!selectedAnnotationClass && updatedClasses.length > 0) {
              setSelectedAnnotationClass(updatedClasses[0].name);
            }
          }
        } else {
          setAllAnnotations(prev => ({ ...prev, [currentIndex]: [] }));
        }
      } catch (e) {
        // File likely doesn't exist, set empty
        setAllAnnotations(prev => ({ ...prev, [currentIndex]: [] }));
      }
    };
    
    loadAnnotations();
  }, [currentIndex, imageFiles, outputPaths, allAnnotations, setAllAnnotations, annotationClasses, setAnnotationClasses, selectedAnnotationClass, setSelectedAnnotationClass]);

  // Effect to calculate annotation statistics
  useEffect(() => {
    if (Object.keys(allAnnotations).length === 0 || Object.keys(allImageDimensions).length === 0) {
      setAnnotationStats(null);
      return;
    }

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
        (annotations as Annotation[]).forEach(ann => {
          const area = polygonArea(ann.points);
          newStats.allImages[ann.className] = (newStats.allImages[ann.className] || 0) + area;
        });
      }
    });
    
    setAnnotationStats(newStats);

  }, [allAnnotations, allImageDimensions, currentIndex, annotationClasses, setAnnotationStats]);

  const resetState = useCallback(() => {
    setImageFiles([]);
    setCurrentDirectory('');
    setCurrentIndex(0);
    setIsDrawingMode(false);
    setAllAnnotations({});
    setSelectedAnnotationId(null);
    setAnnotationClasses([]);
    setSelectedAnnotationClass(null);
    setImageDimensions(null);
    setAllImageDimensions({});
    setAnnotationStats(null);
    setOutputPaths(null);
    setShowOutputSettings(false);
    clearTimers();
    setTimerRestartKey((key) => key + 1);
    setAnnotationTime(0);
    setAllAnnotationTimes({});
    setActiveAnnotationTime(0);
    setAllActiveAnnotationTimes({});
    setIsTimerPaused(false);
    setCompletedImages({});
    setShowConfetti(false);
    setDashboardEntries([]);
    dashboardEntriesRef.current = [];
    setIsDashboardOpen(false);
  }, [clearTimers, setAllActiveAnnotationTimes, setAllAnnotationTimes, setAllAnnotations, setAllImageDimensions, setAnnotationClasses, setAnnotationStats, setAnnotationTime, setActiveAnnotationTime, setCompletedImages, setCurrentDirectory, setCurrentIndex, setImageDimensions, setImageFiles, setIsTimerPaused, setOutputPaths, setSelectedAnnotationClass, setSelectedAnnotationId]);

  const handleDirectorySelect = async (dirPath: string) => {
    try {
      setIsLoadingProject(true);
      resetState();
      setShowDirectoryBrowser(false);

      const filesData = await getFiles(dirPath);
      setCurrentDirectory(dirPath);
      setLastDirectory(dirPath);
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastDirectory', dirPath);
      }
      setImageFiles(filesData.images);
      const defaultPaths = getDefaultOutputPaths(dirPath);
      // Note: loadPersistedOutputPaths logic moved inline or needs to be extracted
      // For now, assuming defaultPaths or re-implementing simple read
      let effectivePaths = defaultPaths;
      try {
          const configPath = joinPathSegments(dirPath, CONFIG_FILE_NAME);
          const data = await readJsonFile(configPath);
          if (data && data.outputPaths) {
             effectivePaths = {
                annotations: typeof data.outputPaths.annotations === 'string' ? data.outputPaths.annotations : defaultPaths.annotations,
                masks: typeof data.outputPaths.masks === 'string' ? data.outputPaths.masks : defaultPaths.masks,
                times: typeof data.outputPaths.times === 'string' ? data.outputPaths.times : defaultPaths.times,
             };
          }
      } catch (e) { /* ignore */ }
      
      setOutputPaths(effectivePaths);

      // Note: Dimensions and Annotations are now lazy-loaded via useEffect hooks.
      // We only initialize empty states here.
      
      setAllImageDimensions({});
      setAllAnnotations({});

      let newAllAnnotations: Record<number, Annotation[]> = {};
      let loadedTimes: Record<number, number> = {};
      let loadedActiveTimes: Record<number, number> = {};
      let loadedCompleted: Record<number, boolean> = {};

      // Pre-fetch list of existing annotation files for completion status
      let existingJsonFiles = new Set<string>();
      try {
          const annotationsFolder = effectivePaths.annotations;
          const annotationsFolderData = await getFiles(annotationsFolder).catch(() => ({ images: [], jsonFiles: [] }));
          annotationsFolderData.jsonFiles.forEach(f => existingJsonFiles.add(f.name));
      } catch (e) { /* ignore */ }

      try {
        const timesFilePath = joinPathSegments(effectivePaths.times, 'annotation_times.txt');

        const timesContent = await readTextFile(timesFilePath).catch(() => null);

        if (timesContent) {
          const lines = timesContent.split('\n');

          filesData.images.forEach((imageFile, index) => {
            const imageName = imageFile.name;
            const imageLineIndex = lines.findIndex((line) => line.trim() === `${imageName}:`);

            if (imageLineIndex !== -1) {
              const totalTimeLine = lines[imageLineIndex + 1];
              if (totalTimeLine && totalTimeLine.includes('Total Time:')) {
                const match = totalTimeLine.match(/(\d+) minute\(s\) (\d+) second\(s\)/);
                if (match) {
                  const minutes = parseInt(match[1]);
                  const seconds = parseInt(match[2]);
                  loadedTimes[index] = minutes * 60 + seconds;
                }
              }

              const activeTimeLine = lines[imageLineIndex + 2];
              if (activeTimeLine && activeTimeLine.includes('Active Annotation Time:')) {
                const match = activeTimeLine.match(/(\d+) minute\(s\) (\d+) second\(s\)/);
                if (match) {
                  const minutes = parseInt(match[1]);
                  const seconds = parseInt(match[2]);
                  loadedActiveTimes[index] = minutes * 60 + seconds;
                }
              }

              if (loadedTimes[index] > 0) {
                const imageBaseName = imageName.replace(/\.[^.]+$/, '');
                if (existingJsonFiles.has(`${imageBaseName}.json`)) {
                  loadedCompleted[index] = true;
                }
              }
            }
          });

          setAllAnnotationTimes(loadedTimes);
          setAllActiveAnnotationTimes(loadedActiveTimes);
          setCompletedImages(loadedCompleted);
        }
      } catch (error) {
        console.error('Error loading times:', error);
      }

      const historicalEntries = buildHistoricalDashboardEntries(
        filesData.images,
        newAllAnnotations,
        loadedTimes,
        loadedActiveTimes
      );
      await hydrateDashboardEntries(effectivePaths.times, historicalEntries.length ? historicalEntries : undefined);

      setIsLoadingProject(false);
    } catch (error) {
      console.error('Error loading directory:', error);
      setIsLoadingProject(false);
      toast.error(`Failed to load directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const clearImages = useCallback(() => resetState(), [resetState]);

  const formatTimeForFile = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes} minute(s) ${seconds} second(s)`;
  };

  const createTimesFileContent = useCallback((timesSnapshot: Record<number, number>, activeSnapshot: Record<number, number>) => {
    let content = 'Annotation Times:\n\n';
    imageFiles.forEach((image, index) => {
      const totalTime = timesSnapshot[index] || 0;
      const activeTime = activeSnapshot[index] || 0;
      content += `${image.name}:\n`;
      content += `  - Total Time: ${formatTimeForFile(totalTime)}\n`;
      content += `  - Active Annotation Time: ${formatTimeForFile(activeTime)}\n\n`;
    });
    return content;
  }, [imageFiles]);

  const handleSaveAll = useCallback(async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!imageFiles[currentIndex]) {
      return false;
    }

    const effectiveOutputs = outputPaths || (currentDirectory ? getDefaultOutputPaths(currentDirectory) : null);
    if (!effectiveOutputs) {
      return false;
    }

    if (saveInProgressRef.current) {
      return saveInProgressRef.current;
    }

    const savePromise = (async () => {
      setIsSaving(true);
      try {
        const currentAnns = allAnnotations[currentIndex] || [];
        const imageName = imageFiles[currentIndex].name;
        const imageBaseName = imageName.replace(/\.[^.]+$/, '');
        const jsonPath = joinPathSegments(effectiveOutputs.annotations, `${imageBaseName}.json`);
        const maskPath = joinPathSegments(effectiveOutputs.masks, `${imageBaseName}_mask.png`);

        const timesSnapshot = { ...allAnnotationTimes };
        const activeSnapshot = { ...allActiveAnnotationTimes };

        if (!completedImages[currentIndex]) {
          timesSnapshot[currentIndex] = annotationTime;
          activeSnapshot[currentIndex] = activeAnnotationTime;
        }

        setAllAnnotationTimes(prev => ({ ...prev, [currentIndex]: timesSnapshot[currentIndex] || 0 }));
        setAllActiveAnnotationTimes(prev => ({ ...prev, [currentIndex]: activeSnapshot[currentIndex] || 0 }));

        const classIdMap = new Map(annotationClasses.map(cls => [cls.name, cls.id]));
        const operations: Promise<void>[] = [];

        let updatedDashboardEntries: DashboardEntry[] | null = null;
        if (!silent && effectiveOutputs.times) {
          const totalPixelsAnnotated = currentAnns.reduce((sum, ann) => sum + (
            ann.points.length >= 3 ? polygonArea(ann.points) : 0
          ), 0);
          const entry: DashboardEntry = {
            id: `${Date.now()}-${Math.random()}`,
            imageName,
            imagePath: imageFiles[currentIndex].path,
            timestamp: new Date().toISOString(),
            annotationCount: currentAnns.length,
            totalPixelsAnnotated,
            totalTimeSeconds: timesSnapshot[currentIndex] || 0,
            activeTimeSeconds: activeSnapshot[currentIndex] || 0,
          };
          updatedDashboardEntries = appendDashboardEntry(dashboardEntriesRef.current, entry);
          dashboardEntriesRef.current = updatedDashboardEntries;
          setDashboardEntries(updatedDashboardEntries);
          const statsFilePath = joinPathSegments(effectiveOutputs.times, DASHBOARD_STATS_FILE);
          operations.push(saveJsonFile(statsFilePath, updatedDashboardEntries));
        }

        if (jsonPath) {
          const exportData = {
            imageName,
            annotations: currentAnns.map(ann => ({
              className: ann.className,
              classId: classIdMap.get(ann.className),
              points: ann.points,
            }))
          };
          operations.push(saveJsonFile(jsonPath, exportData));
        }

        if (maskPath) {
          const dims = imageDimensions || allImageDimensions[currentIndex];
          if (dims) {
            if (!maskCanvasRef.current) {
              maskCanvasRef.current = document.createElement('canvas');
            }
            const canvas = maskCanvasRef.current;
            canvas.width = dims.width;
            canvas.height = dims.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.clearRect(0, 0, canvas.width, canvas.height);
              ctx.fillStyle = 'rgb(0, 0, 0)';
              ctx.fillRect(0, 0, canvas.width, canvas.height);

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
              operations.push(saveImageFile(maskPath, base64Data));
            }
          }
        }

        const timesFilePath = joinPathSegments(effectiveOutputs.times, 'annotation_times.txt');
        if (timesFilePath) {
          const content = createTimesFileContent(timesSnapshot, activeSnapshot);
          operations.push(saveTextFile(timesFilePath, content));
        }

        await Promise.all(operations);
        if (!silent) toast.success('Saved successfully');
        return true;
      } catch (error) {
        console.error('Error saving changes:', error);
        if (!silent) {
          toast.error('Failed to save changes. Please try again.');
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    })();

    saveInProgressRef.current = savePromise;
    const result = await savePromise;
    saveInProgressRef.current = null;
    return result;
  }, [imageFiles, currentIndex, allAnnotations, allAnnotationTimes, allActiveAnnotationTimes, completedImages, annotationClasses, imageDimensions, allImageDimensions, outputPaths, currentDirectory, createTimesFileContent, annotationTime, activeAnnotationTime, setAllAnnotationTimes, setAllActiveAnnotationTimes, setIsSaving]);

  const goToPrevious = useCallback(async () => {
    await handleSaveAll({ silent: true });
    navigatePrevious();
  }, [navigatePrevious, handleSaveAll]);

  const goToNext = useCallback(async () => {
    await handleSaveAll({ silent: true });
    navigateNext();
  }, [navigateNext, handleSaveAll]);

  const goToIndex = useCallback(async (index: number) => {
    if (index >= 0 && index < imageFiles.length) {
      await handleSaveAll({ silent: true });
      navigateToIndex(index);
    } else {
      toast.error(`Please enter a number between 1 and ${imageFiles.length}.`);
    }
  }, [imageFiles.length, navigateToIndex, handleSaveAll]);

  const handleAddAnnotationClassWrapper = useCallback((name: string, id: number) => {
    const newClass: AnnotationClass = {
      id,
      name,
      color: PALETTE[annotationClasses.length % PALETTE.length]
    };
    handleAddAnnotationClass(newClass);
  }, [annotationClasses.length, handleAddAnnotationClass]);

  const handleAddAnnotation = useCallback((newAnnotation: Omit<Annotation, 'id'>) => {
    if (!selectedAnnotationClass) return;
    
    // Si la imagen estaba completada, desmarcarla al hacer cambios
    if (completedImages[currentIndex]) {
      setCompletedImages(prev => {
        const updated = { ...prev };
        delete updated[currentIndex];
        return updated;
      });
      setShowConfetti(false);
      
      // Reiniciar el timer para esta imagen
      const savedTime = allAnnotationTimes[currentIndex] || 0;
      setAnnotationTime(savedTime);
      const savedActiveTime = allActiveAnnotationTimes[currentIndex] || 0;
      setActiveAnnotationTime(savedActiveTime);
      setIsTimerPaused(false);
      resetInactivityTimer();
    }
    
    const id = `${Date.now()}-${Math.random()}`;
    const annotationWithId = { ...newAnnotation, id, className: selectedAnnotationClass };
    addAnnotation(annotationWithId);
  }, [currentIndex, selectedAnnotationClass, completedImages, allAnnotationTimes, allActiveAnnotationTimes, resetInactivityTimer, setCompletedImages, setAnnotationTime, setActiveAnnotationTime, setIsTimerPaused, addAnnotation]);

  const handleDeleteAnnotationWrapper = useCallback((id: string) => {
    // Si la imagen estaba completada, desmarcarla al hacer cambios
    if (completedImages[currentIndex]) {
      setCompletedImages(prev => {
        const updated = { ...prev };
        delete updated[currentIndex];
        return updated;
      });
      setShowConfetti(false);
      
      // Reiniciar el timer para esta imagen
      const savedTime = allAnnotationTimes[currentIndex] || 0;
      setAnnotationTime(savedTime);
      const savedActiveTime = allActiveAnnotationTimes[currentIndex] || 0;
      setActiveAnnotationTime(savedActiveTime);
      setIsTimerPaused(false);
      resetInactivityTimer();
    }
    
    deleteAnnotation(id);
  }, [currentIndex, completedImages, allAnnotationTimes, allActiveAnnotationTimes, resetInactivityTimer, setCompletedImages, setAnnotationTime, setActiveAnnotationTime, setIsTimerPaused, deleteAnnotation]);

  const handleResizeAnnotation = useCallback((id: string, deltaPercent: number) => {
    const anns = allAnnotations[currentIndex] || [];
    const target = anns.find(a => a.id === id);
    const bounds = imageDimensions || allImageDimensions[currentIndex];
    if (!target || !bounds) return;

    const scale = 1 + deltaPercent / 100;
    const cx = target.points.reduce((sum, p) => sum + p.x, 0) / target.points.length;
    const cy = target.points.reduce((sum, p) => sum + p.y, 0) / target.points.length;
    const clamp = (val: number, max: number) => Math.max(0, Math.min(max, val));

    const scaledPoints = target.points.map(p => ({
      x: clamp(cx + (p.x - cx) * scale, bounds.width),
      y: clamp(cy + (p.y - cy) * scale, bounds.height)
    }));

    setAllAnnotations(prev => ({
      ...prev,
      [currentIndex]: anns.map(a => a.id === id ? { ...a, points: scaledPoints } : a)
    }));
  }, [allAnnotations, currentIndex, imageDimensions, allImageDimensions, setAllAnnotations]);

  const simplifyPath = (points: Point[], tolerance = 1): Point[] => {
    if (points.length <= 2) return points;
    const sqTolerance = tolerance * tolerance;
    const sqDist = (p1: Point, p2: Point) => {
      const dx = p1.x - p2.x;
      const dy = p1.y - p2.y;
      return dx * dx + dy * dy;
    };

    const simplifyDPStep = (pts: Point[], first: number, last: number, simplified: Point[]) => {
      let maxSqDist = sqTolerance;
      let index = -1;
      const line = { p1: pts[first], p2: pts[last] };

      for (let i = first + 1; i < last; i++) {
        const t = ((pts[i].x - line.p1.x) * (line.p2.x - line.p1.x) + (pts[i].y - line.p1.y) * (line.p2.y - line.p1.y)) /
          (sqDist(line.p1, line.p2) || 1);
        const proj = {
          x: line.p1.x + (line.p2.x - line.p1.x) * t,
          y: line.p1.y + (line.p2.y - line.p1.y) * t
        };
        const d = sqDist(pts[i], proj);
        if (d > maxSqDist) {
          index = i;
          maxSqDist = d;
        }
      }

      if (index >= 0) {
        if (index - first > 1) simplifyDPStep(pts, first, index, simplified);
        simplified.push(pts[index]);
        if (last - index > 1) simplifyDPStep(pts, index, last, simplified);
      }
    };

    const simplified: Point[] = [points[0]];
    simplifyDPStep(points, 0, points.length - 1, simplified);
    simplified.push(points[points.length - 1]);
    return simplified;
  };

  const morphAnnotation = useCallback((id: string, radiusPx: number, mode: 'dilate' | 'erode') => {
    const anns = allAnnotations[currentIndex] || [];
    const target = anns.find(a => a.id === id);
    const bounds = imageDimensions || allImageDimensions[currentIndex];
    if (!target || !bounds) return;
    if (radiusPx <= 0) return;

    const xs = target.points.map(p => p.x);
    const ys = target.points.map(p => p.y);
    const minX = Math.max(0, Math.min(...xs) - radiusPx - 2);
    const minY = Math.max(0, Math.min(...ys) - radiusPx - 2);
    const maxX = Math.min(bounds.width, Math.max(...xs) + radiusPx + 2);
    const maxY = Math.min(bounds.height, Math.max(...ys) + radiusPx + 2);
    const w = Math.ceil(maxX - minX);
    const h = Math.ceil(maxY - minY);
    if (w <= 2 || h <= 2) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    ctx.save();
    ctx.translate(-minX, -minY);
    ctx.beginPath();
    ctx.moveTo(target.points[0].x, target.points[0].y);
    for (let i = 1; i < target.points.length; i++) {
      ctx.lineTo(target.points[i].x, target.points[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.restore();

    const applyBlurThreshold = (invert = false) => {
      ctx.globalCompositeOperation = 'source-over';
      ctx.filter = `blur(${radiusPx}px)`;
      ctx.drawImage(canvas, 0, 0);
      ctx.filter = 'none';
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i + 3] = invert ? 255 - data[i] : data[i];
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] > 10 ? 255 : 0;
      }
      ctx.putImageData(imageData, 0, 0);
    };

    if (mode === 'dilate') {
      applyBlurThreshold(false);
    } else {
      // erode: invert -> blur -> threshold -> invert
      ctx.globalCompositeOperation = 'source-over';
      const img = ctx.getImageData(0, 0, w, h);
      for (let i = 0; i < img.data.length; i += 4) {
        const val = img.data[i] > 0 ? 0 : 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = val;
        img.data[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      applyBlurThreshold(true);
    }

    const imageData = ctx.getImageData(0, 0, w, h);
    const mask = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = (y * w + x) * 4;
        mask[y * w + x] = imageData.data[idx] > 0 ? 1 : 0;
      }
    }

    // contour extraction (simple boundary trace)
    const neighbors = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x];
    let start: [number, number] | null = null;
    for (let y = 0; y < h && !start; y++) {
      for (let x = 0; x < w; x++) {
        if (inside(x, y)) {
          start = [x, y];
          break;
        }
      }
    }
    if (!start) return;

    let contour: Point[] = [];
    let current = start;
    let prevDir = 0;
    const maxSteps = w * h * 4;
    for (let step = 0; step < maxSteps; step++) {
      contour.push({ x: current[0] + minX, y: current[1] + minY });
      let found = false;
      for (let i = 0; i < 8; i++) {
        const dir = (prevDir + 6 + i) % 8;
        const nx = current[0] + neighbors[dir][0];
        const ny = current[1] + neighbors[dir][1];
        if (inside(nx, ny)) {
          current = [nx, ny];
          prevDir = dir;
          found = true;
          break;
        }
      }
      if (!found || (current[0] === start[0] && current[1] === start[1] && contour.length > 10)) {
        break;
      }
    }

    contour = simplifyPath(contour, 1.5);
    setAllAnnotations(prev => ({
      ...prev,
      [currentIndex]: anns.map(a => a.id === id ? { ...a, points: contour } : a)
    }));
  }, [allAnnotations, currentIndex, imageDimensions, allImageDimensions, setAllAnnotations]);

  const handleMorphAnnotation = useCallback((mode: 'dilate' | 'erode') => {
    if (!selectedAnnotationId) return;
    morphAnnotation(selectedAnnotationId, refineRadius, mode);
  }, [selectedAnnotationId, refineRadius, morphAnnotation]);

  const handleRefineAtPoint = useCallback((point: Point, erode: boolean) => {
    const anns = allAnnotations[currentIndex] || [];
    let targetId = selectedAnnotationId || null;
    if (!targetId) {
      for (let i = anns.length - 1; i >= 0; i--) {
        if (isPointInPolygon(point, anns[i].points)) {
          targetId = anns[i].id;
          break;
        }
      }
    }
    if (!targetId) {
      toast.error('Select an annotation to refine or click inside one.');
      return;
    }
    morphAnnotation(targetId, refineRadius, erode ? 'erode' : 'dilate');
  }, [allAnnotations, currentIndex, morphAnnotation, refineRadius, selectedAnnotationId]);

  const handleTransformChange = useCallback((newTransform: TransformState) => setActiveTransform(newTransform), []);
  
  const handleToggleDrawingMode = useCallback(() => {
    setIsDrawingMode(prev => !prev);
  }, []);

  const persistOutputPaths = useCallback(async (paths: OutputPaths) => {
    if (!currentDirectory) return;
    const configPath = joinPathSegments(currentDirectory, CONFIG_FILE_NAME);
    try {
      await saveJsonFile(configPath, { outputPaths: paths });
    } catch (error) {
      console.error('Error persisting output configuration:', error);
    }
  }, [currentDirectory]);

  const handleToggleOutputSettings = useCallback(() => {
    setShowOutputSettings(prev => !prev);
  }, []);

  const handleRequestOutputPathChange = useCallback((type: keyof OutputPaths) => {
    if (!outputPaths) return;
    const labels: Record<keyof OutputPaths, string> = {
      annotations: 'archivos JSON',
      masks: 'máscaras PNG',
      times: 'registro de tiempos'
    };
    const currentValue = outputPaths[type];
    const newValue = window.prompt(`Nueva ruta para ${labels[type]}:`, currentValue);
    if (newValue && newValue.trim()) {
      const sanitized = newValue.trim();
      const updated = { ...outputPaths, [type]: sanitized };
      setOutputPaths(updated);
      void persistOutputPaths(updated);
    }
  }, [outputPaths, persistOutputPaths, setOutputPaths]);

  const handleRestoreDefaultOutputPaths = useCallback(() => {
    if (!currentDirectory) return;
    const defaults = getDefaultOutputPaths(currentDirectory);
    setOutputPaths(defaults);
    void persistOutputPaths(defaults);
  }, [currentDirectory, persistOutputPaths, setOutputPaths]);

  const openDashboard = useCallback(() => {
    setIsDashboardOpen(true);
  }, []);

  const closeDashboard = useCallback(() => {
    setIsDashboardOpen(false);
  }, []);

  const handleMarkAsComplete = useCallback(() => {
    // Toggle: if already completed, unmark it
    if (completedImages[currentIndex]) {
      setCompletedImages(prev => {
        const newCompleted = { ...prev };
        delete newCompleted[currentIndex];
        return newCompleted;
      });
      // Timers will restart automatically via useEffect in useTimer
      return;
    }

    // Stop timers
    clearTimers();
    
    setAllAnnotationTimes(prev => ({ ...prev, [currentIndex]: annotationTime }));
    setAllActiveAnnotationTimes(prev => ({ ...prev, [currentIndex]: activeAnnotationTime }));

    setCompletedImages(prev => ({ ...prev, [currentIndex]: true }));
    setIsTimerPaused(true);

    setShowConfetti(true);
    setTimeout(() => setShowConfetti(false), 4000);
  }, [currentIndex, completedImages, clearTimers, annotationTime, activeAnnotationTime, setAllAnnotationTimes, setAllActiveAnnotationTimes, setCompletedImages, setIsTimerPaused]);

  const handleDeleteCurrentImage = useCallback(async () => {
    const imageFile = imageFiles[currentIndex];
    if (!imageFile) {
      return;
    }

    const confirmDelete = window.confirm('Delete this image along with its annotation JSON and mask file? This action cannot be undone.');
    if (!confirmDelete) {
      return;
    }

    clearTimers();

    const effectiveOutputs = outputPaths || (currentDirectory ? getDefaultOutputPaths(currentDirectory) : null);
    const imageBaseName = imageFile.name.replace(/\.[^.]+$/, '');
    const annotationPath = effectiveOutputs ? joinPathSegments(effectiveOutputs.annotations, `${imageBaseName}.json`) : undefined;
    const maskPath = effectiveOutputs ? joinPathSegments(effectiveOutputs.masks, `${imageBaseName}_mask.png`) : undefined;

    setIsDeletingImage(true);
    try {
      await deleteImageAssets({
        imagePath: imageFile.path,
        annotationPath,
        maskPath
      });

      // Note: remapRecordAfterRemoval needs to be imported or defined
      const remapRecordAfterRemoval = <T,>(record: Record<number, T>, removedIndex: number): Record<number, T> => {
        return Object.keys(record).reduce((acc, key) => {
          const idx = parseInt(key, 10);
          if (Number.isNaN(idx) || idx === removedIndex) {
            return acc;
          }
          const newIdx = idx > removedIndex ? idx - 1 : idx;
          acc[newIdx] = record[idx];
          return acc;
        }, {} as Record<number, T>);
      };

      const removedIndex = currentIndex;
      const newImageFiles = imageFiles.filter((_, idx) => idx !== removedIndex);

      const remappedAnnotations = remapRecordAfterRemoval(allAnnotations, removedIndex);
      const remappedTimes = remapRecordAfterRemoval(allAnnotationTimes, removedIndex);
      const remappedActiveTimes = remapRecordAfterRemoval(allActiveAnnotationTimes, removedIndex);
      const remappedDimensions = remapRecordAfterRemoval(allImageDimensions, removedIndex);
      const remappedCompleted = remapRecordAfterRemoval(completedImages, removedIndex);

      if (newImageFiles.length === 0) {
        setImageFiles([]);
        setAllAnnotations({});
        setAllAnnotationTimes({});
        setAllActiveAnnotationTimes({});
        setAllImageDimensions({});
        setCompletedImages({});
        setAnnotationTime(0);
        setActiveAnnotationTime(0);
        setCurrentIndex(0);
        setSelectedAnnotationId(null);
        setIsDrawingMode(false);
        setIsTimerPaused(false);
        setShowConfetti(false);
        return;
      }

      const nextIndex = Math.min(removedIndex, newImageFiles.length - 1);
      setImageFiles(newImageFiles);
      setAllAnnotations(remappedAnnotations);
      setAllAnnotationTimes(remappedTimes);
      setAllActiveAnnotationTimes(remappedActiveTimes);
      setAllImageDimensions(remappedDimensions);
      setCompletedImages(remappedCompleted);
      setSelectedAnnotationId(null);
      setIsDrawingMode(false);
      setShowConfetti(false);
      setCurrentIndex(nextIndex);

      const nextAnnotationTime = remappedTimes[nextIndex] || 0;
      const nextActiveAnnotationTime = remappedActiveTimes[nextIndex] || 0;
      setAnnotationTime(nextAnnotationTime);
      setActiveAnnotationTime(nextActiveAnnotationTime);

      const nextIsCompleted = !!remappedCompleted[nextIndex];
      setIsTimerPaused(nextIsCompleted);
      if (!nextIsCompleted) {
        resetInactivityTimer();
      }
      toast.success('Image deleted');
    } catch (error) {
      console.error('Error deleting image:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete image.');
    } finally {
      setIsDeletingImage(false);
    }
  }, [imageFiles, currentIndex, allAnnotations, allAnnotationTimes, allActiveAnnotationTimes, allImageDimensions, completedImages, outputPaths, currentDirectory, resetInactivityTimer, clearTimers, setImageFiles, setAllAnnotations, setAllAnnotationTimes, setAllActiveAnnotationTimes, setAllImageDimensions, setCompletedImages, setAnnotationTime, setActiveAnnotationTime, setCurrentIndex, setSelectedAnnotationId, setIsTimerPaused, setIsDeletingImage]);


  const currentImageUrl = imageFiles[currentIndex]?.url ?? null;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Annotation deletion shortcut works regardless of focus
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedAnnotationId) {
        e.preventDefault();
        handleDeleteAnnotationWrapper(selectedAnnotationId);
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
    handleDeleteAnnotationWrapper,
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

  const currentAnnotations = allAnnotations[currentIndex] || [];
  const completedImagesCount = Object.values(completedImages).filter(isCompleted => isCompleted).length;
  const totalImages = imageFiles.length;
  const isCurrentImageCompleted = !!completedImages[currentIndex];

  const hasImages = imageFiles.length > 0;
  const currentImage = imageFiles[currentIndex];
  const viewerImageKey = currentImage?.path ?? currentImage?.url ?? `image-${currentIndex}`;

  return (
    <div className="app-shell w-screen h-screen flex flex-row overflow-hidden relative z-10">
      {showConfetti && <Confetti />}
      
      {/* Loading overlay with Rocket animation */}
      {isLoadingProject && (
        <div className="fixed inset-0 bg-black bg-opacity-95 z-50 flex items-center justify-center">
          <div className="bg-gray-800 p-6 rounded-lg shadow-2xl text-center" style={{ maxWidth: '500px' }}>
            <h2 className="text-2xl font-bold mb-4 text-white">Cargando Proyecto</h2>
            
            <RocketLaunchAnimation />
            
            <p className="text-gray-300 mt-4 mb-2">Leyendo anotaciones y tiempos guardados...</p>
            
            {/* Loading bar */}
            <div className="mt-3 w-full bg-gray-700 rounded-full h-2 overflow-hidden">
              <div className="bg-blue-500 h-full rounded-full animate-pulse" style={{ width: '100%' }}></div>
            </div>
          </div>
        </div>
      )}
      
      {showDirectoryBrowser && (
        <DirectoryBrowser
          onSelectDirectory={handleDirectorySelect}
          onClose={() => setShowDirectoryBrowser(false)}
          initialPath={lastDirectory}
        />
      )}

      {isDashboardOpen && (
        <DashboardModal
          entries={dashboardEntries}
          liveEntries={liveDashboardEntries}
          totalImages={imageFiles.length}
          onClose={closeDashboard}
        />
      )}

      {hasImages && (
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
          completedImagesCount={completedImagesCount}
          annotationStats={annotationStats}
          currentImageDimensions={imageDimensions}
          allImageDimensions={allImageDimensions}
          annotationTime={annotationTime}
          activeAnnotationTime={activeAnnotationTime}
          isTimerPaused={isTimerPaused}
          isCurrentImageCompleted={isCurrentImageCompleted}
          totalProjectTime={totalProjectTime}
          totalActiveProjectTime={totalActiveProjectTime}
          outputPaths={outputPaths}
          showOutputSettings={showOutputSettings}
          onFileSelect={triggerFileSelect}
          onClose={clearImages}
          onPrevious={goToPrevious}
          onNext={goToNext}
          onGoToIndex={goToIndex}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onReset={handleResetTransform}
          onToggleDrawingMode={handleToggleDrawingMode}
          onAddAnnotationClass={handleAddAnnotationClassWrapper}
          onUpdateAnnotationClassColor={handleUpdateAnnotationClassColor}
          onSelectAnnotationClass={handleSelectAnnotationClass}
          onSelectAnnotation={handleSelectAnnotation}
          onDeleteAnnotation={handleDeleteAnnotationWrapper}
          onSaveAll={() => { void handleSaveAll(); }}
          onMarkAsComplete={handleMarkAsComplete}
          onDeleteCurrentImage={handleDeleteCurrentImage}
          onOpenDashboard={openDashboard}
          isSaving={isSaving}
          isDeletingImage={isDeletingImage}
          onToggleOutputSettings={handleToggleOutputSettings}
          onRequestOutputPathChange={handleRequestOutputPathChange}
          onRestoreDefaultOutputPaths={handleRestoreDefaultOutputPaths}
        />
      )}
      
      <main className="flex-1 h-full flex items-center justify-center relative p-8">
        {hasImages && (
          <RefineOverlay
            enabled={refineMode}
            radius={refineRadius}
            onToggle={() => setRefineMode((v) => !v)}
            onRadiusChange={setRefineRadius}
          />
        )}
        {hasImages && imageDimensions && currentImageUrl ? (
          <ImageViewer
            ref={imageViewerRef}
            src={currentImageUrl}
            key={viewerImageKey}
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
            refineMode={refineMode}
            onRefineRequest={handleRefineAtPoint}
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


