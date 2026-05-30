/**
 * React Hook - 订阅实时进度更新
 */

import { useEffect, useState, useCallback } from 'react';
import type { ProgressUpdate } from '@/lib/progress-tracker';

export interface UseProgressOptions {
  runId: string;
  onComplete?: (update: ProgressUpdate) => void;
  onError?: (update: ProgressUpdate) => void;
}

export function useProgress({ runId, onComplete, onError }: UseProgressOptions) {
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [status, setStatus] = useState<ProgressUpdate['status']>('info');
  const [message, setMessage] = useState<string>('');
  const [updates, setUpdates] = useState<ProgressUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!runId) return;

    let eventSource: EventSource | null = null;

    const connect = () => {
      eventSource = new EventSource(`/api/progress/${runId}`);

      eventSource.onopen = () => {
        setIsConnected(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const update: ProgressUpdate = JSON.parse(event.data);

          setProgress(update.progress);
          setCurrentStep(update.step);
          setStatus(update.status);
          setMessage(update.message);
          // Replace existing entry for the same step, or append if new
          setUpdates(prev => {
            const idx = prev.findIndex(u => u.step === update.step);
            if (idx !== -1) {
              const next = [...prev];
              next[idx] = update;
              return next;
            }
            return [...prev, update];
          });

          // 触发回调
          if (update.progress >= 100 && onComplete) {
            onComplete(update);
          }
          if (update.status === 'error' && onError) {
            onError(update);
          }
        } catch (error) {
          console.error('Failed to parse progress update:', error);
        }
      };

      eventSource.onerror = () => {
        setIsConnected(false);
        eventSource?.close();
      };
    };

    connect();

    return () => {
      eventSource?.close();
      setIsConnected(false);
    };
  }, [runId, onComplete, onError]);

  const reset = useCallback(() => {
    setProgress(0);
    setCurrentStep('');
    setStatus('info');
    setMessage('');
    setUpdates([]);
  }, []);

  return {
    progress,
    currentStep,
    status,
    message,
    updates,
    isConnected,
    reset,
  };
}
