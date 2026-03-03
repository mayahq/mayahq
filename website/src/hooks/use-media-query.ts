import { useState, useEffect } from "react";

/**
 * Custom hook that returns a boolean indicating whether the window matches the given media query
 * @param query The media query to check
 * @returns A boolean indicating whether the window matches the given media query
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    // Ensure we're in client-side before using window
    if (typeof window !== "undefined") {
      const media = window.matchMedia(query);
      
      // Set initial value
      setMatches(media.matches);
      
      // Define callback for later
      const listener = () => {
        setMatches(media.matches);
      };
      
      // Add listener
      media.addEventListener("change", listener);
      
      // Cleanup
      return () => {
        media.removeEventListener("change", listener);
      };
    }
    
    // Default to false on server-side
    return () => {};
  }, [query]);

  return matches;
} 