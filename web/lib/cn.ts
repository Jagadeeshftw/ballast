import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** The class merger every Aceternity component expects. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
