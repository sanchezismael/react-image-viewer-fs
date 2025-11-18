import React, { useState, useRef, useEffect, useCallback } from 'react';

export interface TimerState {
  annotationTime: number;
  activeAnnotationTime: number;
  allAnnotationTimes: Record<number, number>;
  allActiveAnnotationTimes: Record<number, number>;
  isTimerPaused: boolean;
  totalProjectTime: number;
  totalActiveProjectTime: number;
}

export interface TimerActions {
  setAnnotationTime: (time: number) => void;
  setActiveAnnotationTime: (time: number) => void;
  setAllAnnotationTimes: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setAllActiveAnnotationTimes: React.Dispatch<React.SetStateAction<Record<number, number>>>;
  setIsTimerPaused: (paused: boolean) => void;
  resetInactivityTimer: () => void;
  startActiveTimer: () => void;
  stopActiveTimer: () => void;
  resetTimersForNewImage: (nextIndex: number, times: Record<number, number>, activeTimes: Record<number, number>, isCompleted: boolean) => void;
  clearTimers: () => void;
}

export const useTimer = (currentIndex: number, isCompleted: boolean): TimerState & TimerActions => {
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

  const [totalProjectTime, setTotalProjectTime] = useState(0);
  const [totalActiveProjectTime, setTotalActiveProjectTime] = useState(0);

  // Sync refs
  useEffect(() => {
    annotationTimeRef.current = annotationTime;
  }, [annotationTime]);

  useEffect(() => {
    activeAnnotationTimeRef.current = activeAnnotationTime;
  }, [activeAnnotationTime]);

  useEffect(() => {
    isTimerPausedRef.current = isTimerPaused;
  }, [isTimerPaused]);

  // Calculate totals
  useEffect(() => {
    const totalTime = Object.values(allAnnotationTimes).reduce((sum, time) => sum + time, 0) + 
                      (isCompleted ? 0 : annotationTime);
    const totalActive = Object.values(allActiveAnnotationTimes).reduce((sum, time) => sum + time, 0) + 
                        (isCompleted ? 0 : activeAnnotationTime);
    
    setTotalProjectTime(totalTime);
    setTotalActiveProjectTime(totalActive);
  }, [allAnnotationTimes, allActiveAnnotationTimes, annotationTime, activeAnnotationTime, isCompleted]);

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

  const startActiveTimer = useCallback(() => {
    isActivelyDrawingRef.current = true;
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  const stopActiveTimer = useCallback(() => {
    isActivelyDrawingRef.current = false;
  }, []);

  const clearTimers = useCallback(() => {
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
  }, []);

  // Main timer loop
  useEffect(() => {
    if (isCompleted) {
      clearTimers();
      return;
    }

    timerRef.current = window.setInterval(() => {
      if (!isTimerPausedRef.current) {
        setAnnotationTime(prev => prev + 1);
        
        if (isActivelyDrawingRef.current) {
          setActiveAnnotationTime(prev => prev + 1);
        }
      }
    }, 1000);

    resetInactivityTimer();

    return () => clearTimers();
  }, [isCompleted, resetInactivityTimer, clearTimers]);

  const resetTimersForNewImage = useCallback((nextIndex: number, times: Record<number, number>, activeTimes: Record<number, number>, nextIsCompleted: boolean) => {
      const nextAnnotationTime = times[nextIndex] || 0;
      const nextActiveAnnotationTime = activeTimes[nextIndex] || 0;
      
      setAnnotationTime(nextAnnotationTime);
      annotationTimeRef.current = nextAnnotationTime;
      
      setActiveAnnotationTime(nextActiveAnnotationTime);
      activeAnnotationTimeRef.current = nextActiveAnnotationTime;

      setIsTimerPaused(nextIsCompleted);
      if (!nextIsCompleted) {
        resetInactivityTimer();
      }
  }, [resetInactivityTimer]);

  return {
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
  };
};
