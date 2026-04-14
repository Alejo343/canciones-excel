import { create } from "zustand";

const useStore = create((set) => ({
  // Datos principales
  luminateData: null,
  colombiaData: null,
  calculatedFile: null,
  matchReport: [],

  // Proceso de revisión
  zeroRows: [], // filas que quedaron en 0 dentro de las primeras 100
  currentIndex: 0, // canción actual en revisión
  resolutions: {}, // { rowNum: { impactos, sonadas, top } }

  // Setters datos
  setLuminateData: (data) => set({ luminateData: data }),
  setColombaData: (data) => set({ colombiaData: data }),
  setCalculatedFile: (file) => set({ calculatedFile: file }),
  setMatchReport: (report) => set({ matchReport: report }),

  // Setters revisión
  setZeroRows: (rows) => set({ zeroRows: rows }),
  setCurrentIndex: (index) => set({ currentIndex: index }),

  resolveRow: (rowNum, values) =>
    set((state) => ({
      resolutions: { ...state.resolutions, [rowNum]: values },
    })),

  nextRow: () => set((state) => ({ currentIndex: state.currentIndex + 1 })),
  prevRow: () =>
    set((state) => ({ currentIndex: Math.max(0, state.currentIndex - 1) })),

  reset: () =>
    set({
      luminateData: null,
      colombiaData: null,
      calculatedFile: null,
      matchReport: [],
      zeroRows: [],
      currentIndex: 0,
      resolutions: {},
    }),
}));

export default useStore;
