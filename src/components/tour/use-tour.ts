"use client";

import { createContext, useContext } from "react";

export interface TourContextType {
  startTour: (fromStep?: number) => void;
  resetTour: () => Promise<void>;
  isTourActive: boolean;
}

export const TourContext = createContext<TourContextType>({
  startTour: () => {},
  resetTour: async () => {},
  isTourActive: false,
});

export function useTour() {
  return useContext(TourContext);
}
