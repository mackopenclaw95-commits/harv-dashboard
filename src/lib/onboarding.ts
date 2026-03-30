/**
 * Onboarding state management.
 * Tracks whether the user has completed the initial setup wizard.
 * Uses localStorage for now — will migrate to Supabase with multi-user auth.
 */

const ONBOARDING_KEY = "harv-onboarding";

export interface OnboardingState {
  completed: boolean;
  completedAt?: string;
  personality: "cars1" | "default";
  googleConnected: boolean;
  spotifyConnected: boolean;
  permissions: {
    emailAutoSend: boolean;
    emailAutoDelete: boolean;
    schedulerAutoAdd: boolean;
  };
}

const DEFAULT_STATE: OnboardingState = {
  completed: false,
  personality: "cars1",
  googleConnected: false,
  spotifyConnected: false,
  permissions: {
    emailAutoSend: false,
    emailAutoDelete: false,
    schedulerAutoAdd: true,
  },
};

export function getOnboardingState(): OnboardingState {
  if (typeof window === "undefined") return DEFAULT_STATE;
  const stored = localStorage.getItem(ONBOARDING_KEY);
  if (!stored) return DEFAULT_STATE;
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_STATE;
  }
}

export function saveOnboardingState(state: Partial<OnboardingState>): void {
  const current = getOnboardingState();
  const updated = { ...current, ...state };
  localStorage.setItem(ONBOARDING_KEY, JSON.stringify(updated));
}

export function completeOnboarding(): void {
  saveOnboardingState({
    completed: true,
    completedAt: new Date().toISOString(),
  });
}

export function isOnboardingComplete(): boolean {
  return getOnboardingState().completed;
}

export function resetOnboarding(): void {
  localStorage.removeItem(ONBOARDING_KEY);
}
