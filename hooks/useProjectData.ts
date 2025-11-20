import React, { useState, useCallback, useEffect } from 'react';
import { ImageFile, getFiles } from '../utils/api';
import { joinPathSegments, getDefaultOutputPaths, OutputPaths } from '../utils/helpers';
import { toast } from 'sonner';

export interface ProjectDataState {
  imageFiles: ImageFile[];
  currentDirectory: string;
  currentIndex: number;
  imageDimensions: { width: number; height: number } | null;
  allImageDimensions: Record<number, { width: number; height: number }>;
  isLoadingProject: boolean;
  completedImages: Record<number, boolean>;
  outputPaths: OutputPaths | null;
  showDirectoryBrowser: boolean;
  isDeletingImage: boolean;
}

export interface ProjectDataActions {
  setImageFiles: React.Dispatch<React.SetStateAction<ImageFile[]>>;
  setCurrentDirectory: (dir: string) => void;
  setCurrentIndex: (index: number) => void;
  setImageDimensions: (dims: { width: number; height: number } | null) => void;
  setAllImageDimensions: React.Dispatch<React.SetStateAction<Record<number, { width: number; height: number }>>>;
  setIsLoadingProject: (loading: boolean) => void;
  setCompletedImages: React.Dispatch<React.SetStateAction<Record<number, boolean>>>;
  setOutputPaths: (paths: OutputPaths | null) => void;
  setShowDirectoryBrowser: (show: boolean) => void;
  setIsDeletingImage: (deleting: boolean) => void;
  
  handleDirectorySelect: (directory: string) => Promise<void>;
  goToPrevious: () => void;
  goToNext: () => void;
  goToIndex: (index: number) => void;
  triggerFileSelect: () => void;
}

export const useProjectData = (): ProjectDataState & ProjectDataActions => {
  const [imageFiles, setImageFiles] = useState<ImageFile[]>([]);
  const [currentDirectory, setCurrentDirectory] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [imageDimensions, setImageDimensions] = useState<{width: number, height: number} | null>(null);
  const [allImageDimensions, setAllImageDimensions] = useState<Record<number, {width: number, height: number}>>({});
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [completedImages, setCompletedImages] = useState<Record<number, boolean>>({});
  const [outputPaths, setOutputPaths] = useState<OutputPaths | null>(null);
  const [showDirectoryBrowser, setShowDirectoryBrowser] = useState(false);
  const [isDeletingImage, setIsDeletingImage] = useState(false);

  const handleDirectorySelect = useCallback(async (directory: string) => {
    setIsLoadingProject(true);
    setShowDirectoryBrowser(false);
    try {
      const filesData = await getFiles(directory);
      setImageFiles(filesData.images);
      setCurrentDirectory(directory);
      setCurrentIndex(0);
      
      const defaults = getDefaultOutputPaths(directory);
      setOutputPaths(defaults);
      
      // Reset other state if needed, but that might be handled by effects in App or other hooks
    } catch (error) {
      console.error('Error loading directory:', error);
      toast.error('Failed to load directory.');
    } finally {
      setIsLoadingProject(false);
    }
  }, []);

  const goToPrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : prev));
  }, []);

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < imageFiles.length - 1 ? prev + 1 : prev));
  }, [imageFiles.length]);

  const goToIndex = useCallback((index: number) => {
    if (index >= 0 && index < imageFiles.length) {
      setCurrentIndex(index);
    }
  }, [imageFiles.length]);

  const triggerFileSelect = useCallback(() => {
    setShowDirectoryBrowser(true);
  }, []);

  // Effect to load image dimensions when the current image changes
  const currentImageUrl = imageFiles[currentIndex]?.url ?? null;

  useEffect(() => {
    if (!currentImageUrl) {
      setImageDimensions(null);
      return;
    }

    const img = new Image();
    img.onload = () => {
      setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => setImageDimensions(null);
    img.src = currentImageUrl;
  }, [currentImageUrl]);

  return {
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
    handleDirectorySelect,
    goToPrevious,
    goToNext,
    goToIndex,
    triggerFileSelect
  };
};
