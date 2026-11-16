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

/**
 * A request for the map camera. The store only carries the message; the map
 * hands it to components/map/camera.ts, which decides framing and padding.
 * Callers say where to look, never how much room the panel needs.
 */
export type CameraRequest =
  /** The home view: the focus area around SCOPE.focus. */
  | { kind: 'focus' }
  /** One place. Without `zoom` the camera keeps its zoom or closes in a little. */
  | { kind: 'point'; lng: number; lat: number; zoom?: number }
  /** Several places, framed together. Each point is [lng, lat]. */
  | { kind: 'points'; points: Array<[number, number]> };

interface MapStore {
  // Selection state
  selectedEntityType: MapEntityType | null;
  selectedEntityId: string | null;
  hoveredFactoryId: string | null;
  /** Screen position (map-container px) of the hovered pin, for the preview card. */
  hoverPoint: { x: number; y: number } | null;

  // Navigation history for back button
  navigationHistory: NavigationEntry[];

  // Filter state
  filters: MapFilters;

  // UI state
  sidebarOpen: boolean;

  // Pending camera request, consumed by the map
  flyToTarget: CameraRequest | null;

  // Actions
  selectEntity: (type: MapEntityType, id: string) => void;
  selectFactory: (id: string | null) => void;
  selectState: (code: string | null) => void;
  setHoveredFactory: (id: string | null, point?: { x: number; y: number }) => void;
  setSidebarOpen: (open: boolean) => void;
  clearSelection: () => void;
  goBack: () => void;
  canGoBack: () => boolean;
  setFilters: (filters: Partial<MapFilters>) => void;
  clearFilters: () => void;
  flyTo: (target: CameraRequest) => void;
  resetView: () => void;
  clearFlyTo: () => void;
}

export const useMapStore = create<MapStore>((set, get) => ({
  // Initial state
  selectedEntityType: null,
  selectedEntityId: null,
  hoveredFactoryId: null,
  hoverPoint: null,
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

  setHoveredFactory: (id, point) => set({ hoveredFactoryId: id, hoverPoint: id && point ? point : null }),

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

  // Reset view — back to the focus area AND clear selection + filters so
  // a persistent selected ring / filter chip doesn't stick around.
  resetView: () => set((state) => ({
    flyToTarget: { kind: 'focus' },
    selectedEntityType: null,
    selectedEntityId: null,
    hoveredFactoryId: null,
    navigationHistory: [],
    sidebarOpen: false,
    filters: { ...state.filters, states: [], company: null, companyName: null, industry: null },
  })),

  clearFlyTo: () => set({ flyToTarget: null }),
}));
