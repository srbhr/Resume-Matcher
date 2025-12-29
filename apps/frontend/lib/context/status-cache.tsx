'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { fetchSystemStatus, type SystemStatus } from '@/lib/api/config';

// Cache duration constants
const LLM_HEALTH_CHECK_INTERVAL = 30 * 60 * 1000; // 30 minutes
const STATUS_STALE_THRESHOLD = 5 * 60 * 1000; // 5 minutes for DB stats

interface CachedStatus {
  status: SystemStatus | null;
  lastFetched: number | null;
  lastLlmCheck: number | null;
  isLoading: boolean;
  error: string | null;
}

interface StatusCacheContextValue {
  // Cached data
  status: SystemStatus | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: Date | null;

  // Actions
  refreshStatus: () => Promise<void>;
  refreshLlmHealth: () => Promise<void>;

  // Increment counters (for optimistic updates)
  incrementResumes: () => void;
  decrementResumes: () => void;
  incrementJobs: () => void;
  incrementImprovements: () => void;
  setHasMasterResume: (value: boolean) => void;
}

const StatusCacheContext = createContext<StatusCacheContextValue | null>(null);

export function StatusCacheProvider({ children }: { children: React.ReactNode }) {
  const [cache, setCache] = useState<CachedStatus>({
    status: null,
    lastFetched: null,
    lastLlmCheck: null,
    isLoading: true,
    error: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  // Fetch full status from backend
  const refreshStatus = useCallback(async () => {
    setCache((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const status = await fetchSystemStatus();
      if (!mountedRef.current) return;

      const now = Date.now();
      setCache({
        status,
        lastFetched: now,
        lastLlmCheck: now, // Full status includes LLM health
        isLoading: false,
        error: null,
      });
    } catch (err) {
      if (!mountedRef.current) return;
      setCache((prev) => ({
        ...prev,
        isLoading: false,
        error: (err as Error).message || 'Failed to fetch status',
      }));
    }
  }, []);

  // Refresh just LLM health (called periodically)
  const refreshLlmHealth = useCallback(async () => {
    try {
      const status = await fetchSystemStatus();
      if (!mountedRef.current) return;

      const now = Date.now();
      setCache((prev) => ({
        ...prev,
        status: status,
        lastFetched: now,
        lastLlmCheck: now,
      }));
    } catch (err) {
      // Silent fail for background refresh - keep existing data
      console.error('Background LLM health check failed:', err);
    }
  }, []);

  // Counter update methods (optimistic updates)
  const incrementResumes = useCallback(() => {
    setCache((prev) => {
      if (!prev.status) return prev;
      return {
        ...prev,
        status: {
          ...prev.status,
          database_stats: {
            ...prev.status.database_stats,
            total_resumes: prev.status.database_stats.total_resumes + 1,
          },
        },
      };
    });
  }, []);

  const decrementResumes = useCallback(() => {
    setCache((prev) => {
      if (!prev.status) return prev;
      return {
        ...prev,
        status: {
          ...prev.status,
          database_stats: {
            ...prev.status.database_stats,
            total_resumes: Math.max(0, prev.status.database_stats.total_resumes - 1),
          },
        },
      };
    });
  }, []);

  const incrementJobs = useCallback(() => {
    setCache((prev) => {
      if (!prev.status) return prev;
      return {
        ...prev,
        status: {
          ...prev.status,
          database_stats: {
            ...prev.status.database_stats,
            total_jobs: prev.status.database_stats.total_jobs + 1,
          },
        },
      };
    });
  }, []);

  const incrementImprovements = useCallback(() => {
    setCache((prev) => {
      if (!prev.status) return prev;
      return {
        ...prev,
        status: {
          ...prev.status,
          database_stats: {
            ...prev.status.database_stats,
            total_improvements: prev.status.database_stats.total_improvements + 1,
          },
        },
      };
    });
  }, []);

  const setHasMasterResume = useCallback((value: boolean) => {
    setCache((prev) => {
      if (!prev.status) return prev;
      return {
        ...prev,
        status: {
          ...prev.status,
          has_master_resume: value,
          database_stats: {
            ...prev.status.database_stats,
            has_master_resume: value,
          },
        },
      };
    });
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    mountedRef.current = true;
    refreshStatus();

    return () => {
      mountedRef.current = false;
    };
  }, [refreshStatus]);

  // Set up periodic LLM health check (every 30 minutes)
  useEffect(() => {
    intervalRef.current = setInterval(() => {
      refreshLlmHealth();
    }, LLM_HEALTH_CHECK_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [refreshLlmHealth]);

  const value: StatusCacheContextValue = {
    status: cache.status,
    isLoading: cache.isLoading,
    error: cache.error,
    lastFetched: cache.lastFetched ? new Date(cache.lastFetched) : null,
    refreshStatus,
    refreshLlmHealth,
    incrementResumes,
    decrementResumes,
    incrementJobs,
    incrementImprovements,
    setHasMasterResume,
  };

  return <StatusCacheContext.Provider value={value}>{children}</StatusCacheContext.Provider>;
}

export function useStatusCache() {
  const context = useContext(StatusCacheContext);
  if (!context) {
    throw new Error('useStatusCache must be used within a StatusCacheProvider');
  }
  return context;
}

/**
 * Hook to check if status data is stale (older than threshold)
 */
export function useIsStatusStale(thresholdMs: number = STATUS_STALE_THRESHOLD): boolean {
  const { lastFetched } = useStatusCache();
  const [isStale, setIsStale] = useState(false);

  useEffect(() => {
    if (!lastFetched) {
      setIsStale(true);
      return;
    }

    const checkStale = () => {
      const elapsed = Date.now() - lastFetched.getTime();
      setIsStale(elapsed > thresholdMs);
    };

    checkStale();
    const interval = setInterval(checkStale, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [lastFetched, thresholdMs]);

  return isStale;
}
