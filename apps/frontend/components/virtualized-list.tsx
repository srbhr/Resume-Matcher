"use client"

import { useState, useEffect, useCallback, useMemo, memo } from 'react'

interface VirtualizedListProps<T> {
    items: T[]
    itemHeight: number
    containerHeight: number
    renderItem: (item: T, index: number) => React.ReactNode
    overscan?: number
    className?: string
    onScroll?: (scrollTop: number) => void
}

function VirtualizedList<T>({
    items,
    itemHeight,
    containerHeight,
    renderItem,
    overscan = 5,
    className = '',
    onScroll
}: VirtualizedListProps<T>) {
    const [scrollTop, setScrollTop] = useState(0)

    // Calculate visible range
    const visibleRange = useMemo(() => {
        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
        const endIndex = Math.min(
            items.length - 1,
            Math.floor((scrollTop + containerHeight) / itemHeight) + overscan
        )

        return { startIndex, endIndex }
    }, [scrollTop, itemHeight, containerHeight, items.length, overscan])

    // Get visible items
    const visibleItems = useMemo(() => {
        return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1)
    }, [items, visibleRange.startIndex, visibleRange.endIndex])

    const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
        const newScrollTop = e.currentTarget.scrollTop
        setScrollTop(newScrollTop)
        onScroll?.(newScrollTop)
    }, [onScroll])

    const totalHeight = items.length * itemHeight
    const offsetY = visibleRange.startIndex * itemHeight

    return (
        <div
            className={`relative overflow-auto ${className}`}
            style={{ height: containerHeight }}
            onScroll={handleScroll}
        >
            {/* Total height container for scrollbar */}
            <div style={{ height: totalHeight, position: 'relative' }}>
                {/* Visible items container */}
                <div style={{ transform: `translateY(${offsetY}px)` }}>
                    {visibleItems.map((item, index) => (
                        <div
                            key={visibleRange.startIndex + index}
                            style={{ height: itemHeight }}
                            className="flex items-center"
                        >
                            {renderItem(item, visibleRange.startIndex + index)}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}

export default memo(VirtualizedList) as typeof VirtualizedList 