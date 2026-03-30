"use client";

import { useEffect } from "react";

export function PersonalityProvider() {
  useEffect(() => {
    async function loadPersonality() {
      try {
        const res = await fetch("/api/personality");
        if (res.ok) {
          const data = await res.json();
          if (data.personality === "cars1") {
            document.documentElement.classList.add("kachow");
          } else {
            document.documentElement.classList.remove("kachow");
          }
        }
      } catch {
        // default — no kachow class
      }
    }
    loadPersonality();

    // Listen for personality changes from Settings page
    function handlePersonalityChange(e: Event) {
      const detail = (e as CustomEvent).detail;
      if (detail === "cars1") {
        document.documentElement.classList.add("kachow");
      } else {
        document.documentElement.classList.remove("kachow");
      }
    }
    window.addEventListener("personality-change", handlePersonalityChange);
    return () => window.removeEventListener("personality-change", handlePersonalityChange);
  }, []);

  return null;
}
