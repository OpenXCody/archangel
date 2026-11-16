import { create } from 'zustand';

import type { Bounds } from '@shared/scope';

export type MapEntityType = 'factory' | 'company' | 'occupation' | 'skill' | 'state' | 'area';

/** What the map already knows about a pin (its GeoJSON properties): enough for the hover card. */
export interface PinInfo {
  id: string;
  name: string;
  companyName: string | null;
  /** 2 featured employer, 1 established company, 0 other. */
  tier: number;
  city: string | null;
  state: string | null;
  industry: string | null;
  openJobs: number;
}

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
  /** The home view: the whole country. */
  | { kind: 'us' }
  /** A focus area (an id from FOCUS_AREAS), framed by its boundary. */
  | { kind: 'area'; id: string }
  /** A state, framed by its shape. `code` is the two-letter code. */
  | { kind: 'state'; code: string }
  /** A box, e.g. a place found by address search. */
  | { kind: 'bounds'; bounds: Bounds }
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
  /** The hovered pin's own properties. Set only when the hover came from the map. */
  hoverInfo: PinInfo | null;

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
  selectArea: (id: string) => void;
  setHoveredFactory: (id: string | null, point?: { x: number; y: number }, info?: PinInfo) => void;
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
  hoverInfo: null,
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

  // Select a state: open its overview and ask the camera to frame it. Every
  // way in (a click on the map, search, a shared link) goes through here, so
  // they all end on the same view. Passing null clears the selection.
  selectState: (code) => set((state) => ({
    selectedEntityType: code ? 'state' : null,
    selectedEntityId: code,
    navigationHistory: code ? state.navigationHistory : [],
    sidebarOpen: code !== null,
    flyToTarget: code ? { kind: 'state', code } : state.flyToTarget,
  })),

  // Select a focus area: open its overview and frame its boundary. Same rule
  // as selectState: the map label, the area chip and /map?area= all call this.
  selectArea: (id) => set({
    selectedEntityType: 'area',
    selectedEntityId: id,
    navigationHistory: [],
    sidebarOpen: true,
    flyToTarget: { kind: 'area', id },
  }),

  setHoveredFactory: (id, point, info) => set({
    hoveredFactoryId: id,
    hoverPoint: id && point ? point : null,
    hoverInfo: id && info ? info : null,
  }),

  setSidebarOpen: (open) => set((state) => ({
    sidebarOpen: open,
    // Clear selection and history when closing sidebar (but don't reset view position)
    ...(open ? {} : {
      selectedEntityType: null,
      selectedEntityId: null,
      navigationHistory: [],
      // Choosing a company narrows the map to its sites. Closing that
      // company's panel ends it: the rest of the map comes back.
      ...(state.selectedEntityType === 'company' && state.filters.company === state.selectedEntityId
        ? { filters: { ...state.filters, company: null, companyName: null } }
        : {}),
    }),
  })),

  clearSelection: () => set({
    selectedEntityType: null,
    selectedEntityId: null,
    hoveredFactoryId: null,
    hoverPoint: null,
    hoverInfo: null,
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

  // Reset view — back to the whole country AND clear selection + filters so
  // a persistent selected ring / filter chip doesn't stick around.
  resetView: () => set((state) => ({
    flyToTarget: { kind: 'us' },
    selectedEntityType: null,
    selectedEntityId: null,
    hoveredFactoryId: null,
    hoverPoint: null,
    hoverInfo: null,
    navigationHistory: [],
    sidebarOpen: false,
    filters: { ...state.filters, states: [], company: null, companyName: null, industry: null },
  })),

  clearFlyTo: () => set({ flyToTarget: null }),
}));
