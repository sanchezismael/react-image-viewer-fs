import React, { useState, useCallback, useRef, useEffect } from 'react';
import ImageViewer, { ImageViewerApi } from './components/ImageViewer';
import Toolbar from './components/Toolbar';
import DirectoryBrowser from './components/DirectoryBrowser';
import { TransformState } from './hooks/useImageTransform';
import { getFiles, readJsonFile, saveJsonFile, saveImageFile, saveTextFile, readTextFile, ImageFile } from './utils/api';

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

type OutputPaths = {
  annotations: string;
  masks: string;
  times: string;
};

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

// --- Rocket Launch Animation Component ---
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
      
      {/* Stars */}
      <span className="star" style={{ top: '10%', left: '20%', animationDelay: '0s' }}>✨</span>
      <span className="star" style={{ top: '25%', left: '80%', animationDelay: '0.5s' }}>✨</span>
      <span className="star" style={{ top: '15%', left: '60%', animationDelay: '1s' }}>⭐</span>
      <span className="star" style={{ top: '40%', left: '15%', animationDelay: '1.5s' }}>✨</span>
      <span className="star" style={{ top: '35%', left: '85%', animationDelay: '0.8s' }}>⭐</span>
      <span className="star" style={{ top: '50%', left: '50%', animationDelay: '0.3s' }}>✨</span>
      
      {/* Planet */}
      <span className="planet" style={{ top: '10%', right: '10%' }}>🪐</span>
      
      {/* Smoke clouds */}
      <span className="smoke">💨</span>
      <span className="smoke">💨</span>
      <span className="smoke">💨</span>
      <span className="smoke">💨</span>
      
      {/* Flame */}
      <span className="flame">🔥</span>
      
      {/* Rocket */}
      <span className="rocket">🚀</span>
      
      {/* Launch text */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm font-bold">
        🚀 Despegando hacia el espacio...
      </div>
    </div>
  );
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

const trimTrailingSeparator = (value: string) => value.replace(/[\\/]+$/, '');
const detectSeparator = (value: string) => (value.includes('\\') ? '\\' : '/');
const joinPathSegments = (base: string, child: string) => {
  if (!base) return child;
  const sanitizedBase = trimTrailingSeparator(base);
  const separator = detectSeparator(base);
  const sanitizedChild = child.replace(/^[\\/]+/, '');
  return `${sanitizedBase}${separator}${sanitizedChild}`;
};

const getDefaultOutputPaths = (baseDir: string): OutputPaths => {
  if (!baseDir) {
    return { annotations: '', masks: '', times: '' };
  }
  const cleanBase = trimTrailingSeparator(baseDir);
  const separator = detectSeparator(cleanBase);
  return {
    annotations: `${cleanBase}${separator}annotations`,
    masks: `${cleanBase}${separator}masks`,
    times: `${cleanBase}${separator}times`
  };
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
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats | null>(null);
  const [outputPaths, setOutputPaths] = useState<OutputPaths | null>(null);
  const [showOutputSettings, setShowOutputSettings] = useState(false);
  
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
  const isActivelyDrawingRef = useRef(false);

  const [completedImages, setCompletedImages] = useState<Record<number, boolean>>({});
  const [showConfetti, setShowConfetti] = useState(false);

  const [totalProjectTime, setTotalProjectTime] = useState(0);
  const [totalActiveProjectTime, setTotalActiveProjectTime] = useState(0);

  const imageViewerRef = useRef<ImageViewerApi>(null);
  const saveInProgressRef = useRef<Promise<boolean> | null>(null);
  
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

  // Effect to calculate total project times
  useEffect(() => {
    const totalTime = Object.values(allAnnotationTimes).reduce((sum, time) => sum + time, 0) + 
                      (completedImages[currentIndex] ? 0 : annotationTime);
    const totalActive = Object.values(allActiveAnnotationTimes).reduce((sum, time) => sum + time, 0) + 
                        (completedImages[currentIndex] ? 0 : activeAnnotationTime);
    
    setTotalProjectTime(totalTime);
    setTotalActiveProjectTime(totalActive);
  }, [allAnnotationTimes, allActiveAnnotationTimes, annotationTime, activeAnnotationTime, currentIndex, completedImages]);

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
    if (imageFiles.length === 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeTimerRef.current) clearInterval(activeTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
      return;
    }

    if (completedImages[currentIndex]) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (activeTimerRef.current) clearInterval(activeTimerRef.current);
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        setAnnotationTime(allAnnotationTimes[currentIndex] || 0);
        setActiveAnnotationTime(allActiveAnnotationTimes[currentIndex] || 0);
        setIsTimerPaused(true);
        return;
    }
  
    if (timerRef.current) clearInterval(timerRef.current);
    if (activeTimerRef.current) clearInterval(activeTimerRef.current);
    
    const savedTime = allAnnotationTimes[currentIndex] || 0;
    setAnnotationTime(savedTime);
    const savedActiveTime = allActiveAnnotationTimes[currentIndex] || 0;
    setActiveAnnotationTime(savedActiveTime);
    
    resetInactivityTimer();
  
    // Total time timer - runs when there is activity (movement) or active drawing
    timerRef.current = window.setInterval(() => {
      if (!isTimerPausedRef.current || isActivelyDrawingRef.current) {
        setAnnotationTime(prev => prev + 1);
        annotationTimeRef.current += 1;
      }
    }, 1000);

    // Active time timer - only runs while actively drawing
    activeTimerRef.current = window.setInterval(() => {
      if (isActivelyDrawingRef.current) {
        setActiveAnnotationTime(prev => prev + 1);
        activeAnnotationTimeRef.current += 1;
      }
    }, 1000);
  
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (activeTimerRef.current) clearInterval(activeTimerRef.current);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [currentIndex, imageFiles.length, resetInactivityTimer, allAnnotationTimes, allActiveAnnotationTimes, completedImages]);

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
        (annotations as Annotation[]).forEach(ann => {
          const area = polygonArea(ann.points);
          newStats.allImages[ann.className] = (newStats.allImages[ann.className] || 0) + area;
        });
      }
    });
    
    setAnnotationStats(newStats);

  }, [allAnnotations, allImageDimensions, currentIndex, annotationClasses]);

  const resetState = () => {
    imageUrls.forEach(url => URL.revokeObjectURL(url));
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
    setAnnotationStats(null);
  setOutputPaths(null);
  setShowOutputSettings(false);
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

  const handleDirectorySelect = async (dirPath: string) => {
    try {
      console.log('═══════════════════════════════════════');
      console.log('🚀 STARTING DIRECTORY LOAD');
      console.log('📁 Selected path:', dirPath);
      console.log('═══════════════════════════════════════');
      
      setIsLoadingProject(true);
      resetState();
      setShowDirectoryBrowser(false);

      const filesData = await getFiles(dirPath);
      setCurrentDirectory(dirPath);
      setImageFiles(filesData.images);
      const defaultPaths = getDefaultOutputPaths(dirPath);
      setOutputPaths(defaultPaths);

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

      // Variable to store loaded annotations for use in times loading
      let newAllAnnotations: Record<number, Annotation[]> = {};

      // Load JSON annotations from the annotations subfolder
      try {
        const annotationsFolder = defaultPaths.annotations;
        console.log('🔍 Looking for annotations in:', annotationsFolder);
        console.log('📂 Base directory selected:', dirPath);
        console.log('📸 Number of images found:', filesData.images.length);
        
        const annotationsFolderData = await getFiles(annotationsFolder).catch((err) => {
          console.log('⚠️ Annotations folder not found or empty:', err.message);
          console.log('ℹ️ This is normal if you haven\'t saved annotations yet.');
          console.log('ℹ️ Annotations will be saved to:', annotationsFolder);
          return { images: [], jsonFiles: [] };
        });
        
        console.log('📁 Found JSON files:', annotationsFolderData.jsonFiles.length);
        
        if (annotationsFolderData.jsonFiles.length > 0) {
          const jsonDataPromises = annotationsFolderData.jsonFiles.map(jsonFile => {
            console.log('📄 Loading JSON file:', jsonFile.name);
            return readJsonFile(jsonFile.path).catch(err => {
              console.error(`❌ Error loading ${jsonFile.name}:`, err);
              return null;
            });
          });

          const jsonContents = await Promise.all(jsonDataPromises);
          console.log('✅ Loaded JSON contents:', jsonContents.filter(c => c !== null).length);

          const jsonAnnotationsMap = new Map<string, any[]>();
          jsonContents.forEach((data, index) => {
            if (data && data.annotations && Array.isArray(data.annotations)) {
              const baseName = annotationsFolderData.jsonFiles[index].name.split('.').slice(0, -1).join('.');
              console.log(`📝 Mapping annotations for: ${baseName} (${data.annotations.length} annotations)`);
              jsonAnnotationsMap.set(baseName, data.annotations);
            }
          });

          const loadedClasses = new Map<string, { id: number }>();

          filesData.images.forEach((imageFile, index) => {
            const imageBaseName = imageFile.name.split('.').slice(0, -1).join('.');
            const annotationsData = jsonAnnotationsMap.get(imageBaseName);

            if (annotationsData) {
              console.log(`✨ Found ${annotationsData.length} annotations for image: ${imageFile.name}`);
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
            } else {
              console.log(`⭕ No annotations found for: ${imageFile.name}`);
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

          console.log('🎨 Loaded annotation classes:', finalClasses.map(c => `${c.name} (ID: ${c.id})`));
          console.log('📊 Total annotations loaded:', Object.keys(newAllAnnotations).length, 'images with annotations');

          setAnnotationClasses(finalClasses);
          setAllAnnotations(newAllAnnotations);

          if (finalClasses.length > 0) {
            setSelectedAnnotationClass(finalClasses[0].name);
          }
        } else {
          console.log('ℹ️ No JSON files found in annotations folder');
        }
      } catch (error) {
        console.error('❌ Error loading annotations:', error);
      }

      // Load annotation times from times folder
      try {
        const timesFilePath = joinPathSegments(defaultPaths.times, 'annotation_times.txt');
        console.log('⏱️ Looking for times file:', timesFilePath);
        
        const timesContent = await readTextFile(timesFilePath).catch((err) => {
          console.log('ℹ️ Times file not found, starting fresh');
          return null;
        });

        if (timesContent) {
          console.log('⏱️ Parsing times file...');
          const loadedTimes: Record<number, number> = {};
          const loadedActiveTimes: Record<number, number> = {};
          const loadedCompleted: Record<number, boolean> = {};

          const lines = timesContent.split('\n');
          let currentImageIndex = -1;

          filesData.images.forEach((imageFile, index) => {
            const imageName = imageFile.name;
            const imageLineIndex = lines.findIndex(line => line.trim() === `${imageName}:`);
            
            if (imageLineIndex !== -1) {
              // Parse total time
              const totalTimeLine = lines[imageLineIndex + 1];
              if (totalTimeLine && totalTimeLine.includes('Total Time:')) {
                const match = totalTimeLine.match(/(\d+) minute\(s\) (\d+) second\(s\)/);
                if (match) {
                  const minutes = parseInt(match[1]);
                  const seconds = parseInt(match[2]);
                  loadedTimes[index] = minutes * 60 + seconds;
                }
              }

              // Parse active time
              const activeTimeLine = lines[imageLineIndex + 2];
              if (activeTimeLine && activeTimeLine.includes('Active Annotation Time:')) {
                const match = activeTimeLine.match(/(\d+) minute\(s\) (\d+) second\(s\)/);
                if (match) {
                  const minutes = parseInt(match[1]);
                  const seconds = parseInt(match[2]);
                  loadedActiveTimes[index] = minutes * 60 + seconds;
                }
              }

              // If there's time recorded, consider it as having been worked on
              if (loadedTimes[index] > 0) {
                // Check if there are annotations for this image
                if (newAllAnnotations[index] && newAllAnnotations[index].length > 0) {
                  loadedCompleted[index] = true;
                }
              }
            }
          });

          console.log('✅ Loaded times for', Object.keys(loadedTimes).length, 'images');
          setAllAnnotationTimes(loadedTimes);
          setAllActiveAnnotationTimes(loadedActiveTimes);
          setCompletedImages(loadedCompleted);
        }
      } catch (error) {
        console.error('❌ Error loading times:', error);
      }

      setIsLoadingProject(false);
      console.log('✅ PROJECT LOADED SUCCESSFULLY');
    } catch (error) {
      console.error('Error loading directory:', error);
      setIsLoadingProject(false);
      alert(`Failed to load directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const triggerFileSelect = useCallback(() => setShowDirectoryBrowser(true), []);
  const clearImages = useCallback(() => resetState(), [imageUrls]);

  const changeImage = useCallback((newIndex: number) => {
    if (!completedImages[currentIndex]) {
      setAllAnnotationTimes(prev => ({ ...prev, [currentIndex]: annotationTimeRef.current }));
      setAllActiveAnnotationTimes(prev => ({ ...prev, [currentIndex]: activeAnnotationTimeRef.current }));
    }
    setCurrentIndex(newIndex);
    setSelectedAnnotationId(null);
    setImageDimensions(null); // Reset dimensions to trigger loading for the new image
  }, [currentIndex, completedImages]);

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
          timesSnapshot[currentIndex] = annotationTimeRef.current;
          activeSnapshot[currentIndex] = activeAnnotationTimeRef.current;
        }

        setAllAnnotationTimes(prev => ({ ...prev, [currentIndex]: timesSnapshot[currentIndex] || 0 }));
        setAllActiveAnnotationTimes(prev => ({ ...prev, [currentIndex]: activeSnapshot[currentIndex] || 0 }));

        const classIdMap = new Map(annotationClasses.map(cls => [cls.name, cls.id]));
        const operations: Promise<void>[] = [];

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
            const canvas = document.createElement('canvas');
            canvas.width = dims.width;
            canvas.height = dims.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
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
        return true;
      } catch (error) {
        console.error('Error saving changes:', error);
        if (!silent) {
          alert('Failed to save changes. Please try again.');
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
  }, [imageFiles, currentIndex, allAnnotations, allAnnotationTimes, allActiveAnnotationTimes, completedImages, annotationClasses, imageDimensions, allImageDimensions, outputPaths, currentDirectory, createTimesFileContent]);

  const goToPrevious = useCallback(async () => {
    await handleSaveAll({ silent: true });
    changeImage(currentIndex === 0 ? imageFiles.length - 1 : currentIndex - 1);
  }, [imageFiles.length, currentIndex, changeImage, handleSaveAll]);

  const goToNext = useCallback(async () => {
    await handleSaveAll({ silent: true });
    changeImage(currentIndex === imageFiles.length - 1 ? 0 : currentIndex + 1);
  }, [imageFiles.length, currentIndex, changeImage, handleSaveAll]);

  const goToIndex = useCallback(async (index: number) => {
    if (index >= 0 && index < imageFiles.length) {
      await handleSaveAll({ silent: true });
      changeImage(index);
    } else {
      alert(`Please enter a number between 1 and ${imageFiles.length}.`);
    }
  }, [imageFiles.length, changeImage, handleSaveAll]);

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
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        if (!isTimerPausedRef.current) {
          setAnnotationTime(prev => prev + 1);
        }
      }, 1000);
    }
    
    const id = `${Date.now()}-${Math.random()}`;
    const annotationWithId = { ...newAnnotation, id, className: selectedAnnotationClass };
    setAllAnnotations(prev => {
        const currentAnns = prev[currentIndex] || [];
        return { ...prev, [currentIndex]: [...currentAnns, annotationWithId] };
    });
  }, [currentIndex, selectedAnnotationClass, completedImages, allAnnotationTimes, allActiveAnnotationTimes, resetInactivityTimer]);

  const handleSelectAnnotation = useCallback((id: string | null) => setSelectedAnnotationId(id), []);

  const handleDeleteAnnotation = useCallback((id: string) => {
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
      
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = window.setInterval(() => {
        if (!isTimerPausedRef.current) {
          setAnnotationTime(prev => prev + 1);
        }
      }, 1000);
    }
    
    setAllAnnotations(prev => ({
        ...prev,
        [currentIndex]: (prev[currentIndex] || []).filter(ann => ann.id !== id)
    }));
    if (selectedAnnotationId === id) {
        setSelectedAnnotationId(null);
    }
  }, [currentIndex, selectedAnnotationId, completedImages, allAnnotationTimes, allActiveAnnotationTimes, resetInactivityTimer]);

  const handleTransformChange = useCallback((newTransform: TransformState) => setActiveTransform(newTransform), []);
  
  const handleToggleDrawingMode = useCallback(() => {
    setIsDrawingMode(prev => !prev);
  }, []);

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
      setOutputPaths(prev => (prev ? { ...prev, [type]: newValue.trim() } : prev));
    }
  }, [outputPaths]);

  const handleRestoreDefaultOutputPaths = useCallback(() => {
    if (!currentDirectory) return;
    setOutputPaths(getDefaultOutputPaths(currentDirectory));
  }, [currentDirectory]);

  const handleMarkAsComplete = useCallback(() => {
    // Toggle: if already completed, unmark it
    if (completedImages[currentIndex]) {
      console.log('🔓 Unmarking image as complete - resuming timers');
      setCompletedImages(prev => {
        const newCompleted = { ...prev };
        delete newCompleted[currentIndex];
        return newCompleted;
      });
      // Timers will restart automatically via useEffect
      return;
    }

    console.log('✅ Marking image as complete - stopping timers');
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
    isActivelyDrawingRef.current = true;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const stopActiveTimer = useCallback(() => {
    isActivelyDrawingRef.current = false;
  }, []);

  const currentAnnotations = allAnnotations[currentIndex] || [];
  const completedImagesCount = Object.values(completedImages).filter(isCompleted => isCompleted).length;
  const totalImages = imageFiles.length;
  const isCurrentImageCompleted = !!completedImages[currentIndex];

  return (
    <div className="w-screen h-screen bg-gray-900 flex flex-row overflow-hidden font-sans">
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
          onAddAnnotationClass={handleAddAnnotationClass}
          onUpdateAnnotationClassColor={handleUpdateAnnotationClassColor}
          onSelectAnnotationClass={handleSelectAnnotationClass}
          onSelectAnnotation={handleSelectAnnotation}
          onDeleteAnnotation={handleDeleteAnnotation}
          onSaveAll={() => { void handleSaveAll(); }}
          onMarkAsComplete={handleMarkAsComplete}
          isSaving={isSaving}
          onToggleOutputSettings={handleToggleOutputSettings}
          onRequestOutputPathChange={handleRequestOutputPathChange}
          onRestoreDefaultOutputPaths={handleRestoreDefaultOutputPaths}
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