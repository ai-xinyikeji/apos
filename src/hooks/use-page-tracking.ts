/**
 * Client-side hook for tracking page views
 */

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export function usePageTracking() {
  const pathname = usePathname();

  useEffect(() => {
    // Track page view
    fetch('/api/growth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'page_view',
        properties: { page: pathname },
      }),
    }).catch(err => {
      console.error('Failed to track page view:', err);
    });
  }, [pathname]);
}
