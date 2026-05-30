'use client';

import { usePageTracking } from '@/hooks/use-page-tracking';

/**
 * Client component that tracks page views
 */
export function PageTracker() {
  usePageTracking();
  return null;
}
