import React, { useState, useCallback, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import ImageViewer, { ImageViewerApi } from './components/ImageViewer';
import Toolbar from './components/Toolbar';
import DashboardModal from './components/DashboardModal';
import DirectoryBrowser from './components/DirectoryBrowser';
import Confetti from './components/Confetti';
import ConfirmationModal from './components/ConfirmationModal';
import RocketLaunchAnimation from './components/RocketLaunchAnimation';
import { TransformState } from './hooks/useImageTransform';
import { getFiles, readJsonFile, saveJsonFile, saveImageFile, saveTextFile, readTextFile, deleteImageAssets, getImageUrl } from './utils/api';
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

const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let isInside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / ((yj - yi) || 1e-6) + xi);
    if (intersect) isInside = !isInside;
  }
  return isInside;
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
  const brushMaskRef = useRef<Uint8Array | null>(null);
  const brushMaskDimsRef = useRef<{ width: number, height: number } | null>(null);
  const brushTargetIdRef = useRef<string | null>(null);
  const [lastDirectory, setLastDirectory] = useState<string>(() => {
    if (typeof window === 'undefined') return '';
    return localStorage.getItem('lastDirectory') || '';
  });

  const [inlineMasks, setInlineMasks] = useState<Map<string, string>>(new Map());
  const [maskFiles, setMaskFiles] = useState<Map<string, string>>(new Map());
  const [showMaskConversionModal, setShowMaskConversionModal] = useState(false);
  const [pendingMaskConversion, setPendingMaskConversion] = useState<{ imageBaseName: string, maskPath: string } | null>(null);

  const dirtyIndicesRef = useRef<Set<number>>(new Set());
  const markCurrentAsDirty = useCallback(() => {
    dirtyIndicesRef.current.add(currentIndex);
  }, [currentIndex]);

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

  // Sync mask files from inline and external sources
  useEffect(() => {
    const updateMasks = async () => {
      const combined = new Map(inlineMasks);
      
      if (outputPaths?.masks && outputPaths.masks !== currentDirectory) {
        try {
          const data = await getFiles(outputPaths.masks);
          data.masks.forEach(m => combined.set(m.name, m.path));
          // Also include regular images from the masks folder as potential masks
          data.images.forEach(m => combined.set(m.name, m.path));
        } catch (error) {
          console.warn('Failed to load external masks:', error);
        }
      }
      setMaskFiles(combined);
    };
    
    updateMasks();
  }, [inlineMasks, outputPaths?.masks, currentDirectory]);

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
      
      const imageBaseName = imageFiles[currentIndex].name.replace(/\.[^.]+$/, '');
      const jsonPath = joinPathSegments(outputPaths.annotations, `${imageBaseName}.json`);
      
      const checkForMask = () => {
        let exactMatchPath: string | null = null;

        for (const [maskName, maskPath] of maskFiles.entries()) {
          const maskBaseName = maskName.replace(/\.[^.]+$/, '');
          
          // Check for _mask suffix (highest priority)
          if (maskBaseName === `${imageBaseName}_mask`) {
            setPendingMaskConversion({ imageBaseName, maskPath });
            setShowMaskConversionModal(true);
            return;
          }
          
          // Check for exact base name match (lower priority)
          if (maskBaseName === imageBaseName) {
            exactMatchPath = maskPath;
          }
        }

        if (exactMatchPath) {
          setPendingMaskConversion({ imageBaseName, maskPath: exactMatchPath });
          setShowMaskConversionModal(true);
        }
      };

      // If we already have annotations for this index
      if (allAnnotations[currentIndex] !== undefined) {
        // If empty, check for mask again (in case masks loaded late)
        if (allAnnotations[currentIndex].length === 0) {
          checkForMask();
        }
        return;
      }

      try {
        const data = await readJsonFile(jsonPath);
        if (data && data.annotations && Array.isArray(data.annotations) && data.annotations.length > 0) {
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
          checkForMask();
        }
      } catch (e) {
        // File likely doesn't exist, set empty
        setAllAnnotations(prev => ({ ...prev, [currentIndex]: [] }));
        checkForMask();
      }
    };
    
    loadAnnotations();
  }, [currentIndex, imageFiles, outputPaths, allAnnotations, setAllAnnotations, annotationClasses, setAnnotationClasses, selectedAnnotationClass, setSelectedAnnotationClass, maskFiles]);

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
      
      if (filesData.images.length === 0) {
        toast.error('No images found in the selected directory');
        setIsLoadingProject(false);
        return;
      }
      
      setCurrentDirectory(dirPath);
      setLastDirectory(dirPath);
      if (typeof window !== 'undefined') {
        localStorage.setItem('lastDirectory', dirPath);
      }
      setImageFiles(filesData.images);
      
      const maskMap = new Map<string, string>();
      filesData.masks.forEach(m => maskMap.set(m.name, m.path));
      setInlineMasks(maskMap);

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
        const isDirty = dirtyIndicesRef.current.has(currentIndex);

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

        if (jsonPath && (isDirty || !silent)) {
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

        if (maskPath && (isDirty || !silent)) {
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
        if (isDirty) {
          dirtyIndicesRef.current.delete(currentIndex);
        }
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
    markCurrentAsDirty();
  }, [currentIndex, selectedAnnotationClass, completedImages, allAnnotationTimes, allActiveAnnotationTimes, resetInactivityTimer, setCompletedImages, setAnnotationTime, setActiveAnnotationTime, setIsTimerPaused, addAnnotation, markCurrentAsDirty]);

  const applyBrush = useCallback((seed: Point, erode: boolean, phase: 'start' | 'move' | 'end') => {
    const dims = imageDimensions || allImageDimensions[currentIndex];
    if (!dims) return;

    // --- START PHASE ---
    if (phase === 'start') {
        let targetId = selectedAnnotationId || null;
        const anns = allAnnotations[currentIndex] || [];

        // If no selection, try to find one under cursor
        if (!targetId) {
            for (let i = anns.length - 1; i >= 0; i--) {
                if (isPointInPolygon(seed, anns[i].points)) {
                    targetId = anns[i].id;
                    break;
                }
            }
        }

        // If still no target and we are eroding, do nothing
        if (!targetId && erode) return;

        // If no target and expanding, check if we have a class selected
        if (!targetId && !selectedAnnotationClass) {
            toast.error('Select a class or an annotation to use the brush.');
            return;
        }

        brushTargetIdRef.current = targetId;
        brushMaskDimsRef.current = { width: dims.width, height: dims.height };
        
        // Initialize mask (Full Image Size to avoid drift/offset issues)
        const size = dims.width * dims.height;
        const mask = new Uint8Array(size);
        
        if (targetId) {
            const ann = anns.find(a => a.id === targetId);
            if (ann && ann.points.length > 2) {
                // Rasterize existing annotation
                const canvas = document.createElement('canvas');
                canvas.width = dims.width;
                canvas.height = dims.height;
                const ctx = canvas.getContext('2d');
                if (ctx) {
                    ctx.beginPath();
                    ctx.moveTo(ann.points[0].x, ann.points[0].y);
                    for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
                    ctx.closePath();
                    ctx.fillStyle = 'white';
                    ctx.fill();
                    const imgData = ctx.getImageData(0, 0, dims.width, dims.height);
                    for (let i = 0; i < size; i++) {
                        if (imgData.data[i * 4 + 3] > 128) mask[i] = 1;
                    }
                }
            }
        }
        brushMaskRef.current = mask;
    }

    // --- APPLY BRUSH (START & MOVE) ---
    if (brushMaskRef.current && brushMaskDimsRef.current) {
        const mask = brushMaskRef.current;
        const { width, height } = brushMaskDimsRef.current;
        const radius = wandTolerance;
        const r2 = radius * radius;
        const cx = Math.floor(seed.x);
        const cy = Math.floor(seed.y);

        const bx1 = Math.max(0, cx - Math.ceil(radius));
        const by1 = Math.max(0, cy - Math.ceil(radius));
        const bx2 = Math.min(width, cx + Math.ceil(radius) + 1);
        const by2 = Math.min(height, cy + Math.ceil(radius) + 1);

        let changed = false;
        for (let y = by1; y < by2; y++) {
            for (let x = bx1; x < bx2; x++) {
                const dx = x - cx;
                const dy = y - cy;
                if (dx*dx + dy*dy <= r2) {
                    const idx = y * width + x;
                    if (erode) {
                        if (mask[idx] === 1) {
                            mask[idx] = 0;
                            changed = true;
                        }
                    } else {
                        if (mask[idx] === 0) {
                            mask[idx] = 1;
                            changed = true;
                        }
                    }
                }
            }
        }

        if (changed || phase === 'start') {
            // Re-vectorize
            // Optimization: marchingSquares is fast enough for 1080p, might be slow for 4k.
            // But since we are in a loop, we have to do it.
            const contour = marchingSquares(mask, width, height);
            
            // If empty result
            if (contour.length < 3) {
                if (brushTargetIdRef.current) {
                     setAllAnnotations(prev => ({
                        ...prev,
                        [currentIndex]: (prev[currentIndex] || []).filter(a => a.id !== brushTargetIdRef.current)
                     }));
                     if (phase === 'end') {
                        brushTargetIdRef.current = null;
                        setSelectedAnnotationId(null);
                     }
                }
                return;
            }

            // Simplify slightly to reduce point count but keep shape
            const simplified = simplifyPath(contour, 0.5); 

            if (brushTargetIdRef.current) {
                setAllAnnotations(prev => ({
                    ...prev,
                    [currentIndex]: (prev[currentIndex] || []).map(a => a.id === brushTargetIdRef.current ? { ...a, points: simplified } : a)
                }));
                markCurrentAsDirty();
            } else if (selectedAnnotationClass) {
                // Create new annotation on first stroke
                const id = `${Date.now()}-${Math.random()}`;
                const ann = { id, className: selectedAnnotationClass, points: simplified };
                setAllAnnotations(prev => ({ ...prev, [currentIndex]: [...(prev[currentIndex] || []), ann] }));
                brushTargetIdRef.current = id;
                setSelectedAnnotationId(id);
                markCurrentAsDirty();
            }
        }
    }

    // --- END PHASE ---
    if (phase === 'end') {
        brushMaskRef.current = null;
        brushMaskDimsRef.current = null;
        brushTargetIdRef.current = null;
    }

  }, [allAnnotations, currentIndex, imageDimensions, allImageDimensions, selectedAnnotationClass, selectedAnnotationId, wandTolerance, setAllAnnotations, setSelectedAnnotationId]);

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
    markCurrentAsDirty();
  }, [currentIndex, completedImages, allAnnotationTimes, allActiveAnnotationTimes, resetInactivityTimer, setCompletedImages, setAnnotationTime, setActiveAnnotationTime, setIsTimerPaused, deleteAnnotation, markCurrentAsDirty]);

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
    markCurrentAsDirty();
  }, [allAnnotations, currentIndex, imageDimensions, allImageDimensions, setAllAnnotations, markCurrentAsDirty]);

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

  const rasterizePolygon = (points: Point[], width: number, height: number): Uint8Array => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const mask = new Uint8Array(width * height);
    if (!ctx || points.length < 3) return mask;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    ctx.fillStyle = '#fff';
    ctx.fill();
    const data = ctx.getImageData(0, 0, width, height).data;
    for (let i = 0; i < width * height; i++) {
      mask[i] = data[i * 4] > 0 ? 1 : 0;
    }
    return mask;
  };

  const marchingSquares = (mask: Uint8Array, width: number, height: number, startPoint?: [number, number], targetVal: number = 1): Point[] => {
    const neighbors = [
      [1, 0], [1, 1], [0, 1], [-1, 1],
      [-1, 0], [-1, -1], [0, -1], [1, -1],
    ];
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === targetVal;
    
    let start: [number, number] | null = startPoint || null;

    if (!start) {
      for (let y = 0; y < height && !start; y++) {
        for (let x = 0; x < width; x++) {
          if (inside(x, y)) {
            start = [x, y];
            break;
          }
        }
      }
    }
    
    if (!start) return [];

    const contour: Point[] = [];
    let current = start;
    let prevDir = 0;
    const maxSteps = width * height * 4;

    for (let step = 0; step < maxSteps; step++) {
      contour.push({ x: current[0], y: current[1] });
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
    return simplifyPath(contour, 1.5);
  };

  const handleConfirmMaskConversion = async () => {
    if (!pendingMaskConversion) return;
    setShowMaskConversionModal(false);
    const { maskPath } = pendingMaskConversion;
    const url = getImageUrl(maskPath);
    
    try {
      const img = new Image();
      img.crossOrigin = "Anonymous";
      img.src = url;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      
      const imgData = ctx.getImageData(0, 0, img.width, img.height);
      const data = imgData.data;
      const width = img.width;
      const height = img.height;
      const size = width * height;
      const mask = new Uint8Array(size);
      
      let hasPixels = false;
      for (let i = 0; i < size; i++) {
        const r = data[i*4];
        const g = data[i*4+1];
        const b = data[i*4+2];
        const a = data[i*4+3];
        
        if (a > 10) {
          // Use max of channels to capture values like 1, 2, 3 in grayscale/indexed masks
          const val = Math.max(r, g, b);
          if (val > 0) {
            mask[i] = val;
            hasPixels = true;
          }
        }
      }

      if (!hasPixels) {
        toast.error('The mask image appears to be empty or all black.');
        return;
      }
      
      const newAnnotations: Annotation[] = [];
      // const visited = new Uint8Array(size); // Unused

      // Helper to erase object from mask so we find the next one
      const floodFillErase = (startX: number, startY: number, targetVal: number) => {
        const stack = [[startX, startY]];
        while (stack.length) {
          const [cx, cy] = stack.pop()!;
          const idx = cy * width + cx;
          if (cx >= 0 && cx < width && cy >= 0 && cy < height && mask[idx] === targetVal) {
            mask[idx] = 0; // Erase
            stack.push([cx + 1, cy]);
            stack.push([cx - 1, cy]);
            stack.push([cx, cy + 1]);
            stack.push([cx, cy - 1]);
          }
        }
      };

      const numberToWord = (num: number): string => {
        const words = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
        return words[num] || num.toString();
      };

      // Find all contours
      let iterations = 0;
      const MAX_ITERATIONS = 2000; // Safety break

      while (iterations < MAX_ITERATIONS) {
        let start: [number, number] | null = null;
        let foundVal = 0;
        // Scan for next object
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            if (mask[y * width + x] > 0) {
              start = [x, y];
              foundVal = mask[y * width + x];
              break;
            }
          }
          if (start) break;
        }

        if (!start) break; // No more objects

        const contour = marchingSquares(mask, width, height, start, foundVal); // Pass start point and value
        
        if (contour.length > 2) {
           const id = `${Date.now()}-${Math.random()}`;
           const className = numberToWord(foundVal);
           newAnnotations.push({
             id,
             className: className,
             points: contour
           });
        }

        // Erase the object we just found (or the noise)
        floodFillErase(start[0], start[1], foundVal);
        iterations++;
      }
      
      if (newAnnotations.length > 0) {
        // Update classes logic
        const newClassesMap = new Map(annotationClasses.map(c => [c.name, c]));
        const addedClasses: AnnotationClass[] = [];
        
        newAnnotations.forEach(ann => {
            if (!newClassesMap.has(ann.className)) {
                const words = ['cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez'];
                let id = words.indexOf(ann.className);
                if (id === -1) id = parseInt(ann.className) || Date.now();
                
                const newClass = {
                    id: id,
                    name: ann.className,
                    color: PALETTE[id % PALETTE.length] || PALETTE[0]
                };
                newClassesMap.set(ann.className, newClass);
                addedClasses.push(newClass);
            }
        });

        if (addedClasses.length > 0) {
            setAnnotationClasses(prev => [...prev, ...addedClasses]);
        }

        setAllAnnotations(prev => ({
          ...prev,
          [currentIndex]: newAnnotations
        }));
        markCurrentAsDirty();

        // Immediate Save
        if (outputPaths?.annotations) {
             const imageBaseName = imageFiles[currentIndex].name.replace(/\.[^.]+$/, '');
             const jsonPath = joinPathSegments(outputPaths.annotations, `${imageBaseName}.json`);
             
             const exportData = {
                imageName: imageFiles[currentIndex].name,
                annotations: newAnnotations.map(ann => {
                    const cls = newClassesMap.get(ann.className);
                    return {
                        className: ann.className,
                        classId: cls ? cls.id : 0,
                        points: ann.points
                    };
                })
             };
             
             await saveJsonFile(jsonPath, exportData);
             toast.success(`Generated and saved ${newAnnotations.length} annotations`);
        } else {
             toast.success(`Generated ${newAnnotations.length} annotations`);
        }
      } else {
        toast.error('Could not generate valid annotations from mask');
      }
    } catch (error) {
      console.error('Error converting mask:', error);
      toast.error('Failed to convert mask to annotations');
    } finally {
      setPendingMaskConversion(null);
    }
  };

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

      <ConfirmationModal
        isOpen={showMaskConversionModal}
        title="Generate Annotations from Mask?"
        message="This image has an associated mask file but no annotations. Would you like to generate annotations from the mask?"
        onConfirm={handleConfirmMaskConversion}
        onCancel={() => {
          setShowMaskConversionModal(false);
          setPendingMaskConversion(null);
        }}
      />

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
          wandActive={wandMode}
          wandTolerance={wandTolerance}
          onToggleWand={() => setWandMode(v => !v)}
          onChangeWandTolerance={setWandTolerance}
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
            wandActive={wandMode}
            wandTolerance={wandTolerance}
            onWandRequest={applyBrush}
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


