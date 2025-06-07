// Memory monitoring utility for detecting memory leaks and performance issues

interface MemoryInfo {
    usedJSHeapSize: number
    totalJSHeapSize: number
    jsHeapSizeLimit: number
}

declare global {
    interface Performance {
        memory?: MemoryInfo
    }
}

export class MemoryMonitor {
    private static instance: MemoryMonitor
    private intervalId: NodeJS.Timeout | null = null
    private componentMetrics: Map<string, {
        renderCount: number
        mountTime: number
        lastMemoryUsage: number
    }> = new Map()

    private constructor() { }

    static getInstance(): MemoryMonitor {
        if (!MemoryMonitor.instance) {
            MemoryMonitor.instance = new MemoryMonitor()
        }
        return MemoryMonitor.instance
    }

    startMonitoring(interval: number = 10000): void {
        if (typeof window === 'undefined' || this.intervalId) return

        this.intervalId = setInterval(() => {
            this.logMemoryMetrics()
        }, interval)
    }

    stopMonitoring(): void {
        if (this.intervalId) {
            clearInterval(this.intervalId)
            this.intervalId = null
        }
    }

    trackComponent(componentName: string): void {
        const existing = this.componentMetrics.get(componentName)

        this.componentMetrics.set(componentName, {
            renderCount: existing ? existing.renderCount + 1 : 1,
            mountTime: existing?.mountTime || Date.now(),
            lastMemoryUsage: this.getCurrentMemoryUsage(),
        })
    }

    untrackComponent(componentName: string): void {
        const metrics = this.componentMetrics.get(componentName)
        if (metrics) {
            const lifespan = Date.now() - metrics.mountTime
            console.log(`📊 [${componentName}] Unmounted:`, {
                renders: metrics.renderCount,
                lifespan: `${Math.round(lifespan / 1000)}s`,
                finalMemory: `${this.getCurrentMemoryUsage()}MB`
            })
            this.componentMetrics.delete(componentName)
        }
    }

    getCurrentMemoryUsage(): number {
        if (typeof window === 'undefined' || !performance.memory) {
            return 0
        }
        return Math.round(performance.memory.usedJSHeapSize / 1024 / 1024)
    }

    private logMemoryMetrics(): void {
        const currentMemory = this.getCurrentMemoryUsage()

        if (currentMemory > 100) {
            console.warn(`⚠️ High memory usage detected: ${currentMemory}MB`)
        }

        console.log(`🧠 Memory Status: ${currentMemory}MB`, {
            activeComponents: this.componentMetrics.size,
            components: Array.from(this.componentMetrics.entries()).map(([name, metrics]) => ({
                name,
                renders: metrics.renderCount,
                age: `${Math.round((Date.now() - metrics.mountTime) / 1000)}s`
            }))
        })
    }

    // Force garbage collection (only works in development with --enable-precise-memory-info)
    forceGC(): void {
        if (typeof window !== 'undefined' && 'gc' in window && typeof (window as any).gc === 'function') {
            (window as any).gc()
            console.log('🗑️ Forced garbage collection')
        }
    }
}

// Convenience hooks
export function useMemoryMonitor(componentName: string, enabled: boolean = process.env.NODE_ENV === 'development') {
    if (!enabled || typeof window === 'undefined') return

    const monitor = MemoryMonitor.getInstance()

    // Track component render
    monitor.trackComponent(componentName)

    // Cleanup on unmount
    return () => {
        monitor.untrackComponent(componentName)
    }
}

// Auto-start monitoring in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    const monitor = MemoryMonitor.getInstance()
    monitor.startMonitoring()

    // Clean up on page unload
    window.addEventListener('beforeunload', () => {
        monitor.stopMonitoring()
    })
} 