import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Combines multiple class names or class name objects into a single string.
 * Uses clsx for conditional class logic and twMerge for Tailwind CSS class deduplication.
 * 
 * @param inputs - Class values to be combined (strings, objects, arrays)
 * @returns A string of combined and optimized class names
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}