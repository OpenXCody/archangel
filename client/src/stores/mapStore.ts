import { create } from 'zustand';

import type { Bounds } from '@shared/scope';

export type MapEntityType = 'factory' | 'company' | 'occupation' | 'skill' | 'state' | 'area' | 'place';

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

/** A place found by search: a town, a county, a ZIP code, an address. */
/**
 * How much of a phone's screen the detail sheet takes: a bar with the name
 * (the map is all there behind it), its resting height, or nearly all of it.
 */
export type SheetDetent = 'bar' | 'peek' | 'full';

export interface MapPlace {
  /** "Round Rock" */
  name: string;
  /** "Williamson County, TX" */
  context: string;
  /** The box the panel counts factories in and the camera frames. */
  bounds: Bounds;
}

/**
 * What the map is showing.
 *
 * `states` and `industry` are filters from the filter button: pins outside
 * them are not drawn. `company` and `career` are the map's subject, at most
 * one at a time: a company's factories alone, or a career's industries at full
 * strength with the rest stepped back. Every one of them is applied to the
 * one pin source with filter and paint expressions (layers.ts); none refetches.
 */
export interface MapFilters {
  states: string[];
  industry: string | null;
  company: string | null;
  companyName: string | null;
  career: string | null;
  careerTitle: string | null;
}

/** The company or career the map is about, if any. */
type Subject = Pick<MapFilters, 'company' | 'companyName' | 'career' | 'careerTitle'>;

const NO_SUBJECT: Subject = { company: null, companyName: null, career: null, careerTitle: null };
const NO_FILTERS: MapFilters = { states: [], industry: null, ...NO_SUBJECT };

interface NavigationEntry {
  type: MapEntityType;
  id: string;
  /** The subject at the time, so Back in the panel restores the map as it was. */
  subject: Subject;
  place: MapPlace | null;
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

/**
 * Everything about the map that lives in the address (MapView keeps the two
 * in step): what is selected, the subject and the industry filter.
 */
export interface MapAddress {
  factory: string | null;
  state: string | null;
  area: string | null;
  skill: string | null;
  place: MapPlace | null;
  company: string | null;
  career: string | null;
  industry: string | null;
}

interface MapStore {
  // Selection state
  selectedEntityType: MapEntityType | null;
  selectedEntityId: string | null;
  /** The place the panel is about, while selectedEntityType is 'place'. */
  selectedPlace: MapPlace | null;
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
  /** Phone only: where the detail sheet rests. */
  sheetDetent: SheetDetent;
  /** One line said beside the search: a link that named something we do not have. */
  notice: string | null;

  // Pending camera request, consumed by the map
  flyToTarget: CameraRequest | null;

  // Actions
  selectEntity: (type: MapEntityType, id: string, name?: string) => void;
  selectFactory: (id: string | null) => void;
  selectState: (code: string | null) => void;
  selectArea: (id: string) => void;
  selectPlace: (place: MapPlace) => void;
  setHoveredFactory: (id: string | null, point?: { x: number; y: number }, info?: PinInfo) => void;
  setSidebarOpen: (open: boolean) => void;
  setSheetDetent: (detent: SheetDetent) => void;
  clearSelection: () => void;
  goBack: () => void;
  canGoBack: () => boolean;
  setFilters: (filters: Partial<MapFilters>) => void;
  clearFilters: () => void;
  /** Stop showing the company or career: every pin comes back. */
  endSubject: () => void;
  /** Open the subject's own panel again (its chip was pressed). */
  openSubject: () => void;
  /** Learn the subject's display name once its record has loaded. */
  nameSubject: (name: string) => void;
  /** Put the store in the state an address describes (a link, Back, Forward). */
  restoreAddress: (address: MapAddress) => void;
  /** Something a link named does not exist: say so and show the country. */
  notFound: (message: string) => void;
  setNotice: (notice: string | null) => void;
  flyTo: (target: CameraRequest) => void;
  resetView: () => void;
  clearFlyTo: () => void;
}

/** The identity of a place, for selectedEntityId and comparisons. */
export function placeKey(place: MapPlace): string {
  return `${place.name}@${place.bounds.flat().map((n) => n.toFixed(4)).join(',')}`;
}

function subjectOf(filters: MapFilters): Subject {
  return {
    company: filters.company,
    companyName: filters.companyName,
    career: filters.career,
    careerTitle: filters.careerTitle,
  };
}

/** Selecting a company or a career makes it the map's subject; anything else leaves the subject alone. */
function subjectFor(type: MapEntityType, id: string, name: string | undefined, current: MapFilters): Subject {
  if (type === 'company') {
    const sameCompany = current.company === id;
    return { ...NO_SUBJECT, company: id, companyName: name ?? (sameCompany ? current.companyName : null) };
  }
  if (type === 'occupation') {
    const sameCareer = current.career === id;
    return { ...NO_SUBJECT, career: id, careerTitle: name ?? (sameCareer ? current.careerTitle : null) };
  }
  return subjectOf(current);
}

export const useMapStore = create<MapStore>((set, get) => ({
  // Initial state
  selectedEntityType: null,
  selectedEntityId: null,
  selectedPlace: null,
  hoveredFactoryId: null,
  hoverPoint: null,
  hoverInfo: null,
  navigationHistory: [],
  filters: NO_FILTERS,
  sidebarOpen: false,
  sheetDetent: 'peek',
  notice: null,
  flyToTarget: null,

  // Actions
  selectEntity: (type, id, name) => set((state) => {
    // Add current selection to history if there is one
    const history = [...state.navigationHistory];
    if (state.selectedEntityType && state.selectedEntityId) {
      // Don't add if it's the same entity
      if (state.selectedEntityType !== type || state.selectedEntityId !== id) {
        history.push({
          type: state.selectedEntityType,
          id: state.selectedEntityId,
          subject: subjectOf(state.filters),
          place: state.selectedPlace,
        });
        // Keep history limited to 10 entries
        if (history.length > 10) history.shift();
      }
    }
    return {
      selectedEntityType: type,
      selectedEntityId: id,
      selectedPlace: null,
      navigationHistory: history,
      sidebarOpen: true,
      filters: { ...state.filters, ...subjectFor(type, id, name, state.filters) },
    };
  }),

  selectFactory: (id) => set((state) => {
    const history = [...state.navigationHistory];
    if (id && state.selectedEntityType && state.selectedEntityId) {
      if (state.selectedEntityType !== 'factory' || state.selectedEntityId !== id) {
        history.push({
          type: state.selectedEntityType,
          id: state.selectedEntityId,
          subject: subjectOf(state.filters),
          place: state.selectedPlace,
        });
        if (history.length > 10) history.shift();
      }
    }
    return {
      selectedEntityType: id ? 'factory' : null,
      selectedEntityId: id,
      selectedPlace: null,
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
    selectedPlace: null,
    navigationHistory: code ? state.navigationHistory : [],
    sidebarOpen: code !== null,
    flyToTarget: code ? { kind: 'state', code } : state.flyToTarget,
  })),

  // Select a focus area: open its overview and frame its boundary. Same rule
  // as selectState: the map label, the area chip and /map?area= all call this.
  selectArea: (id) => set({
    selectedEntityType: 'area',
    selectedEntityId: id,
    selectedPlace: null,
    navigationHistory: [],
    sidebarOpen: true,
    flyToTarget: { kind: 'area', id },
  }),

  // Select a place found by search: frame it and open what is there.
  selectPlace: (place) => set({
    selectedEntityType: 'place',
    selectedEntityId: placeKey(place),
    selectedPlace: place,
    navigationHistory: [],
    sidebarOpen: true,
    flyToTarget: { kind: 'bounds', bounds: place.bounds },
  }),

  setHoveredFactory: (id, point, info) => set({
    hoveredFactoryId: id,
    hoverPoint: id && point ? point : null,
    hoverInfo: id && info ? info : null,
  }),

  setSidebarOpen: (open) => set((state) => {
    if (open) return { sidebarOpen: true };
    // Closing the subject's own panel is being done with it: the rest of the
    // map comes back. Closing a factory's or a state's panel leaves the subject
    // on; its chip under the search is how it is turned off.
    const closingSubject =
      (state.selectedEntityType === 'company' && state.filters.company === state.selectedEntityId) ||
      (state.selectedEntityType === 'occupation' && state.filters.career === state.selectedEntityId);
    return {
      sidebarOpen: false,
      selectedEntityType: null,
      selectedEntityId: null,
      selectedPlace: null,
      navigationHistory: [],
      ...(closingSubject ? { filters: { ...state.filters, ...NO_SUBJECT } } : {}),
    };
  }),

  setSheetDetent: (detent) => set({ sheetDetent: detent }),

  clearSelection: () => set({
    selectedEntityType: null,
    selectedEntityId: null,
    selectedPlace: null,
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
        selectedPlace: prev.place,
        navigationHistory: history,
        sidebarOpen: true,
        filters: { ...state.filters, ...prev.subject },
      };
    }
    return state;
  }),

  canGoBack: () => get().navigationHistory.length > 0,

  setFilters: (newFilters) => set((state) => ({
    filters: { ...state.filters, ...newFilters },
  })),

  clearFilters: () => set((state) => {
    const showingSubject = state.selectedEntityType === 'company' || state.selectedEntityType === 'occupation';
    return {
      filters: NO_FILTERS,
      ...(showingSubject
        ? { selectedEntityType: null, selectedEntityId: null, navigationHistory: [], sidebarOpen: false }
        : {}),
    };
  }),

  endSubject: () => set((state) => {
    const showingSubject = state.selectedEntityType === 'company' || state.selectedEntityType === 'occupation';
    return {
      filters: { ...state.filters, ...NO_SUBJECT },
      // A panel that was reached through the subject must not lead back to it.
      navigationHistory: state.navigationHistory.filter((entry) => entry.type !== 'company' && entry.type !== 'occupation'),
      ...(showingSubject
        ? { selectedEntityType: null, selectedEntityId: null, navigationHistory: [], sidebarOpen: false }
        : {}),
    };
  }),

  openSubject: () => {
    const { filters, selectEntity } = get();
    if (filters.company) selectEntity('company', filters.company);
    else if (filters.career) selectEntity('occupation', filters.career);
  },

  nameSubject: (name) => set((state) => {
    if (state.filters.company && state.filters.companyName !== name) {
      return { filters: { ...state.filters, companyName: name } };
    }
    if (state.filters.career && state.filters.careerTitle !== name) {
      return { filters: { ...state.filters, careerTitle: name } };
    }
    return state;
  }),

  restoreAddress: (address) => set((state) => {
    const subject: Subject = address.company
      ? { ...NO_SUBJECT, company: address.company, companyName: state.filters.company === address.company ? state.filters.companyName : null }
      : address.career
        ? { ...NO_SUBJECT, career: address.career, careerTitle: state.filters.career === address.career ? state.filters.careerTitle : null }
        : NO_SUBJECT;
    const filters: MapFilters = { ...state.filters, ...subject, industry: address.industry };

    // What the panel shows: the thing selected, or else the subject itself.
    let type: MapEntityType | null = null;
    let id: string | null = null;
    let camera: CameraRequest | null = state.flyToTarget;
    if (address.factory) {
      [type, id] = ['factory', address.factory];
    } else if (address.area) {
      [type, id] = ['area', address.area];
      camera = { kind: 'area', id: address.area };
    } else if (address.state) {
      [type, id] = ['state', address.state];
      camera = { kind: 'state', code: address.state };
    } else if (address.place) {
      [type, id] = ['place', placeKey(address.place)];
      camera = { kind: 'bounds', bounds: address.place.bounds };
    } else if (address.skill) {
      [type, id] = ['skill', address.skill];
    } else if (subject.company) {
      [type, id] = ['company', subject.company];
    } else if (subject.career) {
      [type, id] = ['occupation', subject.career];
    }

    const sameSelection = state.selectedEntityType === type && state.selectedEntityId === id;
    return {
      filters,
      selectedEntityType: type,
      selectedEntityId: id,
      selectedPlace: address.place && type === 'place' ? address.place : null,
      navigationHistory: sameSelection ? state.navigationHistory : [],
      sidebarOpen: sameSelection ? state.sidebarOpen : type !== null,
      flyToTarget: sameSelection ? state.flyToTarget : camera,
    };
  }),

  notFound: (message) => set((state) => ({
    notice: message,
    selectedEntityType: null,
    selectedEntityId: null,
    selectedPlace: null,
    navigationHistory: [],
    sidebarOpen: false,
    filters: { ...state.filters, ...NO_SUBJECT },
    flyToTarget: { kind: 'us' },
  })),

  setNotice: (notice) => set({ notice }),

  flyTo: (target) => set({ flyToTarget: target }),

  // Reset view — back to the whole country AND clear selection + filters so
  // a persistent selected ring / filter chip doesn't stick around.
  resetView: () => set({
    flyToTarget: { kind: 'us' },
    selectedEntityType: null,
    selectedEntityId: null,
    selectedPlace: null,
    hoveredFactoryId: null,
    hoverPoint: null,
    hoverInfo: null,
    navigationHistory: [],
    sidebarOpen: false,
    filters: NO_FILTERS,
  }),

  clearFlyTo: () => set({ flyToTarget: null }),
}));
