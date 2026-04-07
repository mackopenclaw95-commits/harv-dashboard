import { createBrowserSupabase } from "./supabase";

const TOUR_KEY = "harv-tour";

interface TourProgress {
  step: number;
  startedAt: string;
}

export function getTourProgress(): TourProgress | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(TOUR_KEY);
    if (!stored) return null;
    return JSON.parse(stored);
  } catch {
    return null;
  }
}

export function saveTourStep(step: number): void {
  if (typeof window === "undefined") return;
  const progress: TourProgress = {
    step,
    startedAt: getTourProgress()?.startedAt || new Date().toISOString(),
  };
  localStorage.setItem(TOUR_KEY, JSON.stringify(progress));
}

export function clearTourProgress(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOUR_KEY);
}

export async function completeTourInSupabase(userId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase
    .from("profiles")
    .update({ onboarded: true })
    .eq("id", userId);
  clearTourProgress();
}

export async function resetTourInSupabase(userId: string): Promise<void> {
  const supabase = createBrowserSupabase();
  await supabase
    .from("profiles")
    .update({ onboarded: false })
    .eq("id", userId);
  clearTourProgress();
}
