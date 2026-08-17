import { create } from "zustand";

interface UIState {
  activeMvp: string;
  setActiveMvp: (mvp: string) => void;
}

export const useUI = create<UIState>((set) => ({
  activeMvp: "MVP-1",
  setActiveMvp: (mvp) => set({ activeMvp: mvp }),
}));
