import React, { useState, useCallback } from 'react';
import { Annotation, AnnotationClass, AnnotationStats } from '../App';
import { saveJsonFile } from '../utils/api';
import { joinPathSegments } from '../utils/helpers';

export interface AnnotationsState {
  annotationClasses: AnnotationClass[];
  selectedAnnotationClass: string | null;
  allAnnotations: Record<number, Annotation[]>;
  selectedAnnotationId: string | null;
  annotationStats: AnnotationStats | null;
  isSaving: boolean;
}

export interface AnnotationsActions {
  setAnnotationClasses: React.Dispatch<React.SetStateAction<AnnotationClass[]>>;
  setSelectedAnnotationClass: (cls: string | null) => void;
  setAllAnnotations: React.Dispatch<React.SetStateAction<Record<number, Annotation[]>>>;
  setSelectedAnnotationId: (id: string | null) => void;
  setAnnotationStats: React.Dispatch<React.SetStateAction<AnnotationStats | null>>;
  setIsSaving: (saving: boolean) => void;
  
  handleAddAnnotationClass: (newClass: AnnotationClass) => void;
  handleUpdateAnnotationClassColor: (id: number, color: string) => void;
  handleSelectAnnotationClass: (className: string) => void;
  handleAddAnnotation: (annotation: Annotation) => void;
  handleSelectAnnotation: (id: string | null) => void;
  handleDeleteAnnotation: (id: string) => void;
}

export const useAnnotations = (currentIndex: number): AnnotationsState & AnnotationsActions => {
  const [annotationClasses, setAnnotationClasses] = useState<AnnotationClass[]>([]);
  const [selectedAnnotationClass, setSelectedAnnotationClass] = useState<string | null>(null);
  const [allAnnotations, setAllAnnotations] = useState<Record<number, Annotation[]>>({});
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<string | null>(null);
  const [annotationStats, setAnnotationStats] = useState<AnnotationStats | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const handleAddAnnotationClass = useCallback((newClass: AnnotationClass) => {
    setAnnotationClasses(prev => [...prev, newClass]);
    if (!selectedAnnotationClass) {
      setSelectedAnnotationClass(newClass.name);
    }
  }, [selectedAnnotationClass]);

  const handleUpdateAnnotationClassColor = useCallback((id: number, color: string) => {
    setAnnotationClasses(prev => prev.map(c => c.id === id ? { ...c, color } : c));
  }, []);

  const handleSelectAnnotationClass = useCallback((className: string) => {
    setSelectedAnnotationClass(className);
  }, []);

  const handleAddAnnotation = useCallback((annotation: Annotation) => {
    setAllAnnotations(prev => {
      const current = prev[currentIndex] || [];
      return { ...prev, [currentIndex]: [...current, annotation] };
    });
  }, [currentIndex]);

  const handleSelectAnnotation = useCallback((id: string | null) => {
    setSelectedAnnotationId(id);
  }, []);

  const handleDeleteAnnotation = useCallback((id: string) => {
    setAllAnnotations(prev => {
      const current = prev[currentIndex] || [];
      return { ...prev, [currentIndex]: current.filter(a => a.id !== id) };
    });
    if (selectedAnnotationId === id) {
      setSelectedAnnotationId(null);
    }
  }, [currentIndex, selectedAnnotationId]);

  return {
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
    handleAddAnnotation,
    handleSelectAnnotation,
    handleDeleteAnnotation
  };
};
