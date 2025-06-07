"use client"

import { useState, memo, forwardRef } from 'react'
import Image, { ImageProps } from 'next/image'

interface OptimizedImageProps extends Omit<ImageProps, 'placeholder' | 'blurDataURL'> {
    fallbackSrc?: string
    showLoader?: boolean
    className?: string
}

const OptimizedImage = memo(forwardRef<HTMLImageElement, OptimizedImageProps>(
    ({
        src,
        alt,
        fallbackSrc,
        showLoader = true,
        className = '',
        onError,
        onLoad,
        ...props
    }, ref) => {
        const [isLoading, setIsLoading] = useState(true)
        const [hasError, setHasError] = useState(false)
        const [currentSrc, setCurrentSrc] = useState(src)

        const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
            setIsLoading(false)
            onLoad?.(e)
        }

        const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
            setHasError(true)
            setIsLoading(false)

            if (fallbackSrc && currentSrc !== fallbackSrc) {
                setCurrentSrc(fallbackSrc)
                setHasError(false)
                setIsLoading(true)
            }

            onError?.(e)
        }

        // Generate blur placeholder for better UX
        const blurDataURL = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiNmM2Y0ZjYiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiNlNWU3ZWIiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSJ1cmwoI2cpIi8+PC9zdmc+"

        if (hasError && !fallbackSrc) {
            return (
                <div
                    className={`flex items-center justify-center bg-gray-100 text-gray-400 ${className}`}
                    style={{ width: props.width || 'auto', height: props.height || 'auto' }}
                >
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                    </svg>
                </div>
            )
        }

        return (
            <div className={`relative ${className}`}>
                <Image
                    ref={ref}
                    src={currentSrc}
                    alt={alt}
                    placeholder="blur"
                    blurDataURL={blurDataURL}
                    onLoad={handleLoad}
                    onError={handleError}
                    className={`transition-opacity duration-300 ${isLoading ? 'opacity-0' : 'opacity-100'}`}
                    loading="lazy"
                    quality={85}
                    {...props}
                />

                {showLoader && isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
                    </div>
                )}
            </div>
        )
    }
))

OptimizedImage.displayName = 'OptimizedImage'

export default OptimizedImage 