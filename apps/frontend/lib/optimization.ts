/**
 * Frontend optimization utilities for memory-efficient React applications.
 * 
 * Features:
 * - Virtual scrolling for large lists
 * - Debouncing and throttling
 * - Memoization helpers
 * - Lazy loading components
 * - Efficient state management
 */

import React, { useCallback, useEffect, useRef, useState, useMemo } from 'react';

/**
 * Debounce hook for optimizing frequent function calls.
 * 
 * @param callback Function to debounce
 * @param delay Delay in milliseconds
 * @returns Debounced function
 */
export function useDebounce<T extends (...args: any[]) => any>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const callbackRef = useRef(callback);

    // Update callback ref on each render
    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    return useCallback((...args: Parameters<T>) => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            callbackRef.current(...args);
        }, delay);
    }, [delay]);
}

/**
 * Throttle hook for limiting function execution rate.
 * 
 * @param callback Function to throttle
 * @param delay Minimum time between calls in milliseconds
 * @returns Throttled function
 */
export function useThrottle<T extends (...args: any[]) => any>(
    callback: T,
    delay: number
): (...args: Parameters<T>) => void {
    const lastCallRef = useRef<number>(0);
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    return useCallback((...args: Parameters<T>) => {
        const now = Date.now();
        if (now - lastCallRef.current >= delay) {
            lastCallRef.current = now;
            callbackRef.current(...args);
        }
    }, [delay]);
}

/**
 * Virtual scrolling hook for rendering large lists efficiently.
 * 
 * @param items Array of items to render
 * @param itemHeight Height of each item in pixels
 * @param containerHeight Height of the container in pixels
 * @param overscan Number of items to render outside visible area
 * @returns Virtual scrolling state and handlers
 */
export function useVirtualScroll<T>(
    items: T[],
    itemHeight: number,
    containerHeight: number,
    overscan: number = 3
) {
    const [scrollTop, setScrollTop] = useState(0);

    const visibleItems = useMemo(() => {
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
        const endIndex = Math.min(
            items.length - 1,
            Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
        );

        return {
            items: items.slice(startIndex, endIndex + 1),
            startIndex,
            endIndex,
            offsetY: startIndex * itemHeight,
        };
    }, [items, scrollTop, itemHeight, containerHeight, overscan]);

    const totalHeight = items.length * itemHeight;

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        setScrollTop(e.currentTarget.scrollTop);
    }, []);

    return {
        visibleItems: visibleItems.items,
        startIndex: visibleItems.startIndex,
        offsetY: visibleItems.offsetY,
        totalHeight,
        handleScroll,
    };
}

/**
 * Intersection Observer hook for lazy loading.
 * 
 * @param options Intersection observer options
 * @returns Ref and visibility state
 */
export function useIntersectionObserver(
    options?: IntersectionObserverInit
) {
    const [isIntersecting, setIsIntersecting] = useState(false);
    const targetRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        const target = targetRef.current;
        if (!target) return;

        const observer = new IntersectionObserver(([entry]) => {
            setIsIntersecting(entry.isIntersecting);
        }, options);

        observer.observe(target);

        return () => {
            observer.disconnect();
        };
    }, [options]);

    return { targetRef, isIntersecting };
}

/**
 * Memory-efficient LRU cache implementation.
 */
export class LRUCache<K, V> {
    private cache: Map<K, V>;
    private maxSize: number;

    constructor(maxSize: number = 100) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        const value = this.cache.get(key);
        if (value !== undefined) {
            // Move to end (most recently used)
            this.cache.delete(key);
            this.cache.set(key, value);
        }
        return value;
    }

    set(key: K, value: V): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            // Remove least recently used (first item)
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
        this.cache.set(key, value);
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}

/**
 * Hook for caching expensive computations.
 * 
 * @param compute Function that computes the value
 * @param deps Dependencies for recomputation
 * @param cacheKey Unique key for caching
 * @returns Cached or computed value
 */
export function useCachedComputation<T>(
    compute: () => T,
    deps: React.DependencyList,
    cacheKey: string
): T {
    const cacheRef = useRef(new LRUCache<string, T>(50));

    return useMemo(() => {
        const cached = cacheRef.current.get(cacheKey);
        if (cached !== undefined) {
            return cached;
        }

        const value = compute();
        cacheRef.current.set(cacheKey, value);
        return value;
    }, [cacheKey, ...deps]);
}

/**
 * Efficient text search with highlighting.
 */
export class TextSearcher {
    private index: Map<string, Set<number>> = new Map();
    private documents: string[] = [];

    constructor(documents: string[]) {
        this.documents = documents;
        this.buildIndex();
    }

    private buildIndex(): void {
        this.documents.forEach((doc, docIndex) => {
            const words = doc.toLowerCase().split(/\s+/);
            words.forEach(word => {
                if (!this.index.has(word)) {
                    this.index.set(word, new Set());
                }
                this.index.get(word)!.add(docIndex);
            });
        });
    }

    search(query: string): number[] {
        const queryWords = query.toLowerCase().split(/\s+/);
        const resultSets = queryWords
            .map(word => this.index.get(word) || new Set())
            .filter(set => set.size > 0);

        if (resultSets.length === 0) return [];

        // Find intersection of all sets
        const intersection = resultSets.reduce((acc, set) => {
            return new Set([...acc].filter(x => set.has(x)));
        });

        return Array.from(intersection) as number[];
    }

    highlight(text: string, query: string): React.ReactNode[] {
        if (!query) return [text];

        const queryWords = query.toLowerCase().split(/\s+/);
        const regex = new RegExp(`(${queryWords.join('|')})`, 'gi');
        const parts = text.split(regex);

        return parts.map((part, index) => {
            if (queryWords.some(word => part.toLowerCase() === word)) {
                return React.createElement('mark', { key: index }, part);
            }
            return part;
        });
    }
}

/**
 * Hook for managing paginated data efficiently.
 */
export function usePagination<T>(
    items: T[],
    itemsPerPage: number = 20
) {
    const [currentPage, setCurrentPage] = useState(1);

    const paginationData = useMemo(() => {
        const totalPages = Math.ceil(items.length / itemsPerPage);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = startIndex + itemsPerPage;
        const currentItems = items.slice(startIndex, endIndex);

        return {
            currentItems,
            currentPage,
            totalPages,
            totalItems: items.length,
            hasNextPage: currentPage < totalPages,
            hasPrevPage: currentPage > 1,
        };
    }, [items, currentPage, itemsPerPage]);

    const goToPage = useCallback((page: number) => {
        setCurrentPage(Math.max(1, Math.min(page, paginationData.totalPages)));
    }, [paginationData.totalPages]);

    const nextPage = useCallback(() => {
        if (paginationData.hasNextPage) {
            setCurrentPage(prev => prev + 1);
        }
    }, [paginationData.hasNextPage]);

    const prevPage = useCallback(() => {
        if (paginationData.hasPrevPage) {
            setCurrentPage(prev => prev - 1);
        }
    }, [paginationData.hasPrevPage]);

    return {
        ...paginationData,
        goToPage,
        nextPage,
        prevPage,
    };
}

/**
 * Memory pool for reusing objects and reducing garbage collection.
 */
export class ObjectPool<T> {
    private pool: T[] = [];
    private factory: () => T;
    private reset: (obj: T) => void;
    private maxSize: number;

    constructor(
        factory: () => T,
        reset: (obj: T) => void,
        maxSize: number = 100
    ) {
        this.factory = factory;
        this.reset = reset;
        this.maxSize = maxSize;
    }

    acquire(): T {
        if (this.pool.length > 0) {
            return this.pool.pop()!;
        }
        return this.factory();
    }

    release(obj: T): void {
        if (this.pool.length < this.maxSize) {
            this.reset(obj);
            this.pool.push(obj);
        }
    }

    clear(): void {
        this.pool = [];
    }

    get size(): number {
        return this.pool.length;
    }
}

/**
 * Hook for batch updates to reduce re-renders.
 */
export function useBatchUpdate<T>(
    updateFn: (updates: T[]) => void,
    delay: number = 100
) {
    const batchRef = useRef<T[]>([]);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);

    const batchUpdate = useCallback((update: T) => {
        batchRef.current.push(update);

        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            if (batchRef.current.length > 0) {
                updateFn(batchRef.current);
                batchRef.current = [];
            }
        }, delay);
    }, [updateFn, delay]);

    useEffect(() => {
        return () => {
            if (timeoutRef.current) {
                clearTimeout(timeoutRef.current);
            }
        };
    }, []);

    return batchUpdate;
}

/**
 * Optimized deep equality check for React.memo.
 */
export function deepEqual(a: any, b: any): boolean {
    if (a === b) return true;

    if (a == null || b == null) return false;

    if (typeof a !== 'object' || typeof b !== 'object') return false;

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!keysB.includes(key)) return false;
        if (!deepEqual(a[key], b[key])) return false;
    }

    return true;
}

/**
 * Web Worker wrapper for CPU-intensive operations.
 */
export class WorkerPool {
    private workers: Worker[] = [];
    private queue: Array<{
        data: any;
        resolve: (value: any) => void;
        reject: (error: any) => void;
    }> = [];
    private busyWorkers = new Set<Worker>();

    constructor(workerScript: string, poolSize: number = 4) {
        for (let i = 0; i < poolSize; i++) {
            const worker = new Worker(workerScript);
            this.workers.push(worker);
        }
    }

    async execute(data: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const availableWorker = this.workers.find(w => !this.busyWorkers.has(w));

            if (availableWorker) {
                this.runWorker(availableWorker, data, resolve, reject);
            } else {
                this.queue.push({ data, resolve, reject });
            }
        });
    }

    private runWorker(
        worker: Worker,
        data: any,
        resolve: (value: any) => void,
        reject: (error: any) => void
    ): void {
        this.busyWorkers.add(worker);

        const handleMessage = (e: MessageEvent) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            this.busyWorkers.delete(worker);
            resolve(e.data);
            this.processQueue();
        };

        const handleError = (e: ErrorEvent) => {
            worker.removeEventListener('message', handleMessage);
            worker.removeEventListener('error', handleError);
            this.busyWorkers.delete(worker);
            reject(e);
            this.processQueue();
        };

        worker.addEventListener('message', handleMessage);
        worker.addEventListener('error', handleError);
        worker.postMessage(data);
    }

    private processQueue(): void {
        if (this.queue.length === 0) return;

        const availableWorker = this.workers.find(w => !this.busyWorkers.has(w));
        if (availableWorker) {
            const { data, resolve, reject } = this.queue.shift()!;
            this.runWorker(availableWorker, data, resolve, reject);
        }
    }

    terminate(): void {
        this.workers.forEach(worker => worker.terminate());
        this.workers = [];
        this.queue = [];
        this.busyWorkers.clear();
    }
} 