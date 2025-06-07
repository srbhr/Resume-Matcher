"use client"

import { useState, useEffect, useCallback, memo, forwardRef } from 'react'

interface DebouncedInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
    onDebouncedChange: (value: string) => void
    debounceMs?: number
    immediate?: boolean
}

const DebouncedInput = memo(forwardRef<HTMLInputElement, DebouncedInputProps>(
    ({ onDebouncedChange, debounceMs = 300, immediate = false, value: controlledValue, ...props }, ref) => {
        const [internalValue, setInternalValue] = useState(String(controlledValue || ''))
        const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null)

        // Update internal value when controlled value changes
        useEffect(() => {
            if (controlledValue !== undefined) {
                setInternalValue(String(controlledValue))
            }
        }, [controlledValue])

        // Cleanup timeout on unmount
        useEffect(() => {
            return () => {
                if (timeoutId) {
                    clearTimeout(timeoutId)
                }
            }
        }, [timeoutId])

        const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
            const newValue = e.target.value
            setInternalValue(newValue)

            // Clear existing timeout
            if (timeoutId) {
                clearTimeout(timeoutId)
            }

            // Call immediately if requested and this is the first character
            if (immediate && internalValue.length === 0 && newValue.length === 1) {
                onDebouncedChange(newValue)
                return
            }

            // Set new timeout
            const newTimeoutId = setTimeout(() => {
                onDebouncedChange(newValue)
            }, debounceMs)

            setTimeoutId(newTimeoutId)
        }, [onDebouncedChange, debounceMs, immediate, internalValue.length, timeoutId])

        // Force immediate call when value is cleared
        useEffect(() => {
            if (internalValue === '' && controlledValue !== '') {
                onDebouncedChange('')
            }
        }, [internalValue, controlledValue, onDebouncedChange])

        return (
            <input
                ref={ref}
                {...props}
                value={internalValue}
                onChange={handleChange}
            />
        )
    }
))

DebouncedInput.displayName = 'DebouncedInput'

export default DebouncedInput 