"use client";

import { useEffect, useCallback, useRef, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { driver } from "driver.js";
import "driver.js/dist/driver.css";
import "./tour-overlay.css";
import { TourContext } from "./use-tour";
import { getTourPhases, getTotalStepCount } from "./tour-steps";
import {
  getTourProgress,
  saveTourStep,
  clearTourProgress,
  completeTourInSupabase,
  resetTourInSupabase,
} from "@/lib/tour-state";
import { useAuth } from "@/components/auth-provider";

const TOUR_PHASE_KEY = "harv-tour-phase";

function getCurrentPhase(): number {
  if (typeof window === "undefined") return 0;
  return parseInt(localStorage.getItem(TOUR_PHASE_KEY) || "0", 10);
}

function setCurrentPhase(phase: number): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(TOUR_PHASE_KEY, String(phase));
}

function clearPhase(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOUR_PHASE_KEY);
}

/** Wait for an element to appear in the DOM */
function waitForElement(selector: string, timeout = 4000): Promise<Element | null> {
  return new Promise((resolve) => {
    const el = document.querySelector(selector);
    if (el) return resolve(el);

    const observer = new MutationObserver(() => {
      const found = document.querySelector(selector);
      if (found) {
        observer.disconnect();
        resolve(found);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      observer.disconnect();
      resolve(document.querySelector(selector));
    }, timeout);
  });
}

/** Inject/remove a <style> tag that forces bright colors on the active element */
function injectBrightStyles() {
  if (document.getElementById("harv-tour-bright-style")) return;
  const style = document.createElement("style");
  style.id = "harv-tour-bright-style";
  style.textContent = `
    .driver-active-element:not(button):not(a) {
      background: oklch(0.25 0.04 210) !important;
    }
    .driver-active-element *:not(.driver-popover):not(.driver-popover *):not(button):not(button *) {
      color: white !important;
      opacity: 1 !important;
    }
    .driver-active-element svg:not(.driver-popover svg):not(button svg) {
      color: oklch(0.85 0.15 192) !important;
    }
  `;
  document.head.appendChild(style);
}

function removeBrightStyles() {
  document.getElementById("harv-tour-bright-style")?.remove();
}

/** Create or get the glow overlay */
function getGlow(): HTMLElement {
  let glow = document.getElementById("harv-tour-glow");
  if (!glow) {
    glow = document.createElement("div");
    glow.id = "harv-tour-glow";
    glow.style.opacity = "0";
    document.body.appendChild(glow);
  }
  return glow;
}

/** Currently tracked glow element + scroll listener cleanup */
let _glowTarget: Element | null = null;
let _glowScrollCleanup: (() => void) | null = null;

/** Position glow overlay over an element, and keep it synced on scroll */
function moveGlowTo(el: Element | null) {
  const glow = getGlow();

  // Clean up previous scroll listener
  if (_glowScrollCleanup) {
    _glowScrollCleanup();
    _glowScrollCleanup = null;
  }
  _glowTarget = el;

  if (!el) {
    glow.style.opacity = "0";
    return;
  }

  const positionGlow = () => {
    if (!_glowTarget) return;
    const rect = _glowTarget.getBoundingClientRect();
    const pad = 10;
    glow.style.top = `${rect.top - pad}px`;
    glow.style.left = `${rect.left - pad}px`;
    glow.style.width = `${rect.width + pad * 2}px`;
    glow.style.height = `${rect.height + pad * 2}px`;
    glow.style.opacity = "1";
  };

  // Hide glow first, position after scroll settles, then fade in
  glow.style.opacity = "0";
  // Use rAF to get the final position after driver.js scrolls
  requestAnimationFrame(() => {
    positionGlow();
    // Fade in after a brief delay for scroll to settle
    setTimeout(() => {
      positionGlow();
      glow.style.opacity = "1";
    }, 400);
  });

  // Keep glow synced on scroll
  const scrollTarget = document.querySelector("main") || window;
  const onScroll = () => requestAnimationFrame(positionGlow);
  scrollTarget.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  _glowScrollCleanup = () => {
    scrollTarget.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  };
}

function removeGlow() {
  if (_glowScrollCleanup) {
    _glowScrollCleanup();
    _glowScrollCleanup = null;
  }
  _glowTarget = null;
  document.getElementById("harv-tour-glow")?.remove();
}

export function TourProvider({ children }: { children: ReactNode }) {
  const { user, profile, isLoading, refreshProfile } = useAuth();
  const driverRef = useRef<ReturnType<typeof driver> | null>(null);
  const hasStarted = useRef(false);
  const navigatingRef = useRef(false);
  const isActive = useRef(false);
  const router = useRouter();
  const pathname = usePathname();

  const isKachow = () =>
    typeof document !== "undefined" &&
    document.documentElement.classList.contains("kachow");

  const runPhase = useCallback(
    async (phaseIdx: number) => {
      const phases = getTourPhases(isKachow());
      if (phaseIdx >= phases.length) {
        clearPhase();
        clearTourProgress();
        if (user?.id) {
          completeTourInSupabase(user.id).then(() => refreshProfile());
        }
        router.push("/chat");
        return;
      }

      const phase = phases[phaseIdx];

      // Client-side navigate if needed
      if (window.location.pathname !== phase.path) {
        setCurrentPhase(phaseIdx);
        navigatingRef.current = true;
        router.push(phase.path);
        return; // useEffect on pathname change will resume
      }

      // Wait for main content to render
      await waitForElement("main");

      // Calculate global step offset
      let globalOffset = 0;
      for (let i = 0; i < phaseIdx; i++) {
        globalOffset += phases[i].steps.length;
      }
      const totalSteps = getTotalStepCount(isKachow());
      const isLastPhase = phaseIdx >= phases.length - 1;

      // Destroy previous instance
      if (driverRef.current) {
        try { driverRef.current.destroy(); } catch {}
      }

      // Small delay for page content to settle after navigation
      await new Promise((r) => setTimeout(r, 400));

      let phaseCompleted = false;

      const driverInstance = driver({
        showProgress: true,
        animate: true,
        smoothScroll: true,
        allowClose: false,
        overlayOpacity: 0.4,
        stagePadding: 18,
        stageRadius: 16,
        popoverOffset: 18,
        progressText: `Step {{current}} of ${totalSteps}`,
        nextBtnText: "Next →",
        prevBtnText: "← Back",
        doneBtnText: isLastPhase ? "Start Chatting! 🚀" : "Continue →",
        steps: phase.steps,
        onHighlightStarted: (element, step) => {
          const localIdx = phase.steps.indexOf(step);
          const globalIdx = globalOffset + localIdx;
          saveTourStep(globalIdx);

          // Restore overflow from previous step
          document.querySelectorAll("[data-tour-overflow]").forEach((el) => {
            (el as HTMLElement).style.overflow = (el as HTMLElement).dataset.tourOverflow || "";
            delete (el as HTMLElement).dataset.tourOverflow;
          });

          // Fix overflow clipping on ancestor elements so outline isn't cut off
          if (element) {
            let parent = element.parentElement;
            while (parent && parent !== document.body) {
              const overflow = getComputedStyle(parent).overflow;
              if (overflow !== "visible") {
                (parent as HTMLElement).style.overflow = "visible";
                (parent as HTMLElement).dataset.tourOverflow = overflow;
              }
              parent = parent.parentElement;
            }
          }

          // Scroll chat input elements into better view so popover doesn't cover them
          const stepSelector = (step as { element?: string }).element || "";
          if (stepSelector.includes("chat-attach") || stepSelector.includes("chat-send") || stepSelector.includes("chat-input-area")) {
            const target = document.querySelector(stepSelector);
            if (target) {
              target.scrollIntoView({ behavior: "smooth", block: "center" });
              // Re-position glow after scroll settles
              setTimeout(() => moveGlowTo(target), 400);
            }
          }

          // Add pulse animation to sidebar nav links during transition steps
          document.querySelectorAll(".tour-nav-pulse").forEach((el) => el.classList.remove("tour-nav-pulse"));
          if (element) {
            const tourAttr = (element as HTMLElement).getAttribute("data-tour");
            const sidebarNavs = ["chat", "calendar", "agents", "documents", "projects", "settings", "crons"];
            if (tourAttr && sidebarNavs.includes(tourAttr)) {
              (element as HTMLElement).classList.add("tour-nav-pulse");
            }
          }

          // Position glow overlay over the highlighted element
          moveGlowTo(element || null);

          const el = document.querySelector(".driver-popover-progress-text");
          if (el) el.textContent = `Step ${globalIdx + 1} of ${totalSteps}`;
        },
        onNextClick: (_el, step) => {
          const localIdx = phase.steps.indexOf(step);
          if (localIdx >= phase.steps.length - 1) {
            phaseCompleted = true;
          }

          const currentEl = (step as { element?: string }).element || "";

          // Agents: expand Harv card before Last Activity step
          if (currentEl.includes("agent-model")) {
            const target = '[data-tour="agent-last-activity"]';
            if (!document.querySelector(target)) {
              window.dispatchEvent(new Event("tour-expand-harv"));
              waitForElement(target, 2000).then(() => {
                driverInstance.moveNext();
              });
              return;
            }
          }

          // Automations: open templates modal before templates step
          if (currentEl.includes("crons-new-button")) {
            window.dispatchEvent(new Event("tour-open-templates"));
            waitForElement('[data-tour="crons-templates"]', 2000).then(() => {
              driverInstance.moveNext();
            });
            return;
          }

          // Automations: close modal + inject demo before demo card step
          if (currentEl.includes("crons-templates")) {
            window.dispatchEvent(new Event("tour-close-templates"));
            // Inject demo automation
            const DEMO_KEY = "harv-custom-automations";
            try {
              const current = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
              if (!current.find((a: { id: string }) => a.id === "tour-demo")) {
                current.push({
                  id: "tour-demo",
                  name: "Daily Motivation",
                  description: "Send a motivational quote every morning at 9 AM",
                  schedule: "Every day at 9:00 AM",
                  agent: "Harv",
                  action: "send_motivation",
                  enabled: true,
                  createdAt: new Date().toISOString(),
                });
                localStorage.setItem(DEMO_KEY, JSON.stringify(current));
              }
            } catch {}
            // Tell crons page to refresh its state
            setTimeout(() => {
              window.dispatchEvent(new Event("tour-refresh-automations"));
              waitForElement('[data-tour="crons-demo-card"]', 2000).then(() => {
                driverInstance.moveNext();
              });
            }, 300);
            return;
          }

          driverInstance.moveNext();
        },
        onPrevClick: () => {
          driverInstance.movePrevious();
        },
        onDestroyStarted: () => {
          if (!driverInstance.hasNextStep()) {
            phaseCompleted = true;
          }
          driverInstance.destroy();
        },
        onDestroyed: () => {
          // Restore overflow on all elements we modified
          document.querySelectorAll("[data-tour-overflow]").forEach((el) => {
            (el as HTMLElement).style.overflow = (el as HTMLElement).dataset.tourOverflow || "";
            delete (el as HTMLElement).dataset.tourOverflow;
          });
          document.querySelectorAll(".tour-nav-pulse").forEach((el) => el.classList.remove("tour-nav-pulse"));
          removeGlow();
          removeBrightStyles();
          isActive.current = false;

          // Clean up demo automation
          try {
            const DEMO_KEY = "harv-custom-automations";
            const current = JSON.parse(localStorage.getItem(DEMO_KEY) || "[]");
            const cleaned = current.filter((a: { id: string }) => a.id !== "tour-demo");
            localStorage.setItem(DEMO_KEY, JSON.stringify(cleaned));
          } catch {}
          if (!phaseCompleted) return;

          const nextPhase = phaseIdx + 1;
          if (nextPhase < phases.length) {
            setCurrentPhase(nextPhase);
            navigatingRef.current = true;
            router.push(phases[nextPhase].path);
          } else {
            clearPhase();
            clearTourProgress();
            if (user?.id) {
              completeTourInSupabase(user.id).then(() => refreshProfile());
            }
            router.push("/chat");
          }
        },
      });

      driverRef.current = driverInstance;
      isActive.current = true;
      injectBrightStyles();
      driverInstance.drive(0);
    },
    [user?.id, refreshProfile, router]
  );

  const startTour = useCallback(
    (fromPhase = 0) => {
      setCurrentPhase(fromPhase);
      saveTourStep(0);
      runPhase(fromPhase);
    },
    [runPhase]
  );

  const resetTour = useCallback(async () => {
    if (!user?.id) return;
    if (driverRef.current) {
      try { driverRef.current.destroy(); } catch {}
    }
    hasStarted.current = false;
    isActive.current = false;
    setCurrentPhase(0);
    saveTourStep(0);
    resetTourInSupabase(user.id).catch(() => {});

    if (window.location.pathname !== "/dashboard") {
      navigatingRef.current = true;
      router.push("/dashboard");
    } else {
      runPhase(0);
    }
  }, [user?.id, router, runPhase]);

  // Resume tour after client-side navigation
  useEffect(() => {
    const hasActiveTour = localStorage.getItem(TOUR_PHASE_KEY) !== null;
    if (!hasActiveTour) return;

    const savedPhase = getCurrentPhase();
    const phases = getTourPhases(isKachow());

    if (savedPhase < phases.length && pathname === phases[savedPhase].path) {
      if (navigatingRef.current || !hasStarted.current) {
        navigatingRef.current = false;
        hasStarted.current = true;
        runPhase(savedPhase);
      }
    }
  }, [pathname, runPhase]);

  // Auto-start tour for new (non-owner) users
  useEffect(() => {
    if (isLoading || !user || !profile) return;
    if (profile.onboarded || profile.role === "owner") return;
    if (hasStarted.current) return;
    if (localStorage.getItem(TOUR_PHASE_KEY) !== null) return;

    hasStarted.current = true;
    setCurrentPhase(0);
    saveTourStep(0);
    if (window.location.pathname !== "/dashboard") {
      navigatingRef.current = true;
      router.push("/dashboard");
    } else {
      runPhase(0);
    }
  }, [isLoading, profile, user, runPhase, router]);

  return (
    <TourContext.Provider value={{ startTour, resetTour, isTourActive: isActive.current }}>
      {children}
    </TourContext.Provider>
  );
}
