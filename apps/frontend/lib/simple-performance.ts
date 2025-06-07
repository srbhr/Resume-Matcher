// Simple performance optimization utilities

export function throttle<T extends (...args: any[]) => any>(
    func: T,
    limit: number
): (...args: Parameters<T>) => void {
    let inThrottle: boolean
    return function (this: any, ...args: Parameters<T>) {
        if (!inThrottle) {
            func.apply(this, args)
            inThrottle = true
            setTimeout(() => inThrottle = false, limit)
        }
    }
}

export function debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: NodeJS.Timeout
    return function (this: any, ...args: Parameters<T>) {
        clearTimeout(timeout)
        timeout = setTimeout(() => func.apply(this, args), wait)
    }
}

export function measurePerformance<T extends (...args: any[]) => any>(
    fn: T,
    name?: string
): T {
    return ((...args: Parameters<T>) => {
        const start = performance.now()
        const result = fn(...args)
        const end = performance.now()

        if (process.env.NODE_ENV === 'development') {
            console.log(`${name || fn.name} took ${Math.round((end - start) * 100) / 100}ms`)
        }

        return result
    }) as T
}

export function getCurrentMemoryUsage(): number {
    if (typeof window === 'undefined' || !('memory' in performance)) {
        return 0
    }
    return Math.round((performance as any).memory.usedJSHeapSize / 1024 / 1024)
}

export function scheduleIdleCallback(callback: () => void): number {
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        return (window as any).requestIdleCallback(callback)
    } else {
        return setTimeout(callback, 1) as any
    }
}

export function analyzeBundle(): void {
    if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return

    const scripts = Array.from(document.querySelectorAll('script[src]'))
    const totalSize = scripts.reduce((size, script) => {
        return size + (script as HTMLScriptElement).src.length
    }, 0)

    console.log('📦 Bundle Analysis:', {
        scriptCount: scripts.length,
        estimatedSize: `${Math.round(totalSize / 1024)}KB`,
        scripts: scripts.map(s => (s as HTMLScriptElement).src.split('/').pop())
    })
} 