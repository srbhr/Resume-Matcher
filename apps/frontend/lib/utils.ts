import { type ClassValue, clsx } from "clsx";

/**
 * Combines multiple class names or class name objects into a single string.
 * Uses clsx for conditional class logic.
 * 
 * @param inputs - Class values to be combined (strings, objects, arrays)
 * @returns A string of combined class names
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(inputs);
}