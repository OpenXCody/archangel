import { create } from 'zustand';

export type MapEntityType = 'factory' | 'company' | 'occupation' | 'skill' | 'state';

interface NavigationEntry {
  type: MapEntityType;
  id: string;
}

export interface MapFilters {
  states: string[];
  company: string | null;
  companyName: string | null;
  industry: string | null;
}

interface FlyToTarget {
  lng: number;
  lat: number;
  zoom?: number;
  // Padding to account for UI elements (sidebar, etc.)
  padding?: {
    top?: number;
    bottom?: number;
    left?: number;
    right?: number;
  };
}

interface MapStore {
  // Selection state
  selectedEntityType: MapEntityType | null;
  selectedEntityId: string | null;
  hoveredFactoryId: string | null;

  // Navigation history for back button
  navigationHistory: NavigationEntry[];

  // Filter state
  filters: MapFilters;

  // UI state
  sidebarOpen: boolean;

  // Map navigation
  flyToTarget: FlyToTarget | null;

  // Actions
  selectEntity: (type: MapEntityType, id: string) => void;
  selectFactory: (id: string | null) => void;
  selectState: (code: string | null) => void;
  setHoveredFactory: (id: string | null) => void;
  setSidebarOpen: (open: boolean) => void;
  clearSelection: () => void;
  goBack: () => void;
  canGoBack: () => boolean;
  setFilters: (filters: Partial<MapFilters>) => void;
  clearFilters: () => void;
  flyTo: (target: FlyToTarget) => void;
  resetView: () => void;
  clearFlyTo: () => void;
}

// Initial view state for reset
const INITIAL_VIEW = {
  lng: -98.5,
  lat: 39.8,
  zoom: 4,
};

export const useMapStore = create<MapStore>((set, get) => ({
  // Initial state
  selectedEntityType: null,
  selectedEntityId: null,
  hoveredFactoryId: null,
  navigationHistory: [],
  filters: {
    states: [],
    company: null,
    companyName: null,
    industry: null,
  },
  sidebarOpen: false,
  flyToTarget: null,

  // Actions
  selectEntity: (type, id) => set((state) => {
    // Add current selection to history if there is one
    const history = [...state.navigationHistory];
    if (state.selectedEntityType && state.selectedEntityId) {
      // Don't add if it's the same entity
      if (state.selectedEntityType !== type || state.selectedEntityId !== id) {
        history.push({ type: state.selectedEntityType, id: state.selectedEntityId });
        // Keep history limited to 10 entries
        if (history.length > 10) history.shift();
      }
    }
    return {
      selectedEntityType: type,
      selectedEntityId: id,
      navigationHistory: history,
      sidebarOpen: true,
    };
  }),

  selectFactory: (id) => set((state) => {
    const history = [...state.navigationHistory];
    if (id && state.selectedEntityType && state.selectedEntityId) {
      if (state.selectedEntityType !== 'factory' || state.selectedEntityId !== id) {
        history.push({ type: state.selectedEntityType, id: state.selectedEntityId });
        if (history.length > 10) history.shift();
      }
    }
    return {
      selectedEntityType: id ? 'factory' : null,
      selectedEntityId: id,
      navigationHistory: id ? history : [],
      sidebarOpen: id !== null,
    };
  }),

  // State click — select state, scope pins/fills to it, open the overview sidebar.
  // Passing null clears the state selection.
  selectState: (code) => set((state) => ({
    selectedEntityType: code ? 'state' : null,
    selectedEntityId: code,
    navigationHistory: code ? state.navigationHistory : [],
    sidebarOpen: code !== null,
    filters: { ...state.filters, states: code ? [code] : [] },
  })),

  setHoveredFactory: (id) => set({ hoveredFactoryId: id }),

  setSidebarOpen: (open) => set({
    sidebarOpen: open,
    // Clear selection and history when closing sidebar (but don't reset view position)
    ...(open ? {} : {
      selectedEntityType: null,
      selectedEntityId: null,
      navigationHistory: [],
    }),
  }),

  clearSelection: () => set({
    selectedEntityType: null,
    selectedEntityId: null,
    hoveredFactoryId: null,
    navigationHistory: [],
    sidebarOpen: false,
  }),

  goBack: () => set((state) => {
    const history = [...state.navigationHistory];
    const prev = history.pop();
    if (prev) {
      return {
        selectedEntityType: prev.type,
        selectedEntityId: prev.id,
        navigationHistory: history,
        sidebarOpen: true,
      };
    }
    return state;
  }),

  canGoBack: () => get().navigationHistory.length > 0,

  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters },
  })),

  clearFilters: () => set({
    filters: { states: [], company: null, companyName: null, industry: null },
  }),

  flyTo: (target) => set({ flyToTarget: target }),

  // Reset view — fly back to continental US AND clear selection + filters so
  // a persistent selected ring / filter chip doesn't stick around.
  resetView: () => set((state) => ({
    flyToTarget: { ...INITIAL_VIEW },
    selectedEntityType: null,
    selectedEntityId: null,
    hoveredFactoryId: null,
    navigationHistory: [],
    sidebarOpen: false,
    filters: { ...state.filters, states: [], company: null, companyName: null, industry: null },
  })),

  clearFlyTo: () => set({ flyToTarget: null }),
}));
