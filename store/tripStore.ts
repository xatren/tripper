'use client';

import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { Trip, Pin, BudgetItem, Profile } from '@/types';

interface NewPinDraft {
  lat: number;
  lng: number;
}

interface TripStore {
  // Auth
  profile: Profile | null;
  setProfile: (profile: Profile | null) => void;

  // Active trip
  activeTrip: Trip | null;
  setActiveTrip: (trip: Trip | null) => void;

  // Pins
  pins: Pin[];
  setPins: (pins: Pin[]) => void;
  addPin: (pin: Pin) => void;
  updatePin: (pin: Pin) => void;
  removePin: (pinId: string) => void;

  // Selected pin (detail panel)
  selectedPin: Pin | null;
  setSelectedPin: (pin: Pin | null) => void;

  // New pin draft (when clicking map)
  newPinDraft: NewPinDraft | null;
  setNewPinDraft: (draft: NewPinDraft | null) => void;

  // Budget
  budgetItems: BudgetItem[];
  setBudgetItems: (items: BudgetItem[]) => void;
  addBudgetItem: (item: BudgetItem) => void;
  removeBudgetItem: (id: string) => void;

  // UI state
  isSidebarOpen: boolean;
  toggleSidebar: () => void;
  activePanel: 'route' | 'budget' | 'members' | null;
  setActivePanel: (panel: 'route' | 'budget' | 'members' | null) => void;

  // Route
  routeWaypoints: Pin[];
  setRouteWaypoints: (pins: Pin[]) => void;
  addWaypoint: (pin: Pin) => void;
  removeWaypoint: (pinId: string) => void;
  clearRoute: () => void;
}

export const useTripStore = create<TripStore>()(
  subscribeWithSelector((set) => ({
    // Auth
    profile: null,
    setProfile: (profile) => set({ profile }),

    // Active trip
    activeTrip: null,
    setActiveTrip: (trip) => set({ activeTrip: trip }),

    // Pins
    pins: [],
    setPins: (pins) => set({ pins }),
    addPin: (pin) => set((state) => ({ pins: [...state.pins, pin] })),
    updatePin: (pin) =>
      set((state) => ({
        pins: state.pins.map((p) => (p.id === pin.id ? pin : p)),
        selectedPin: state.selectedPin?.id === pin.id ? pin : state.selectedPin,
      })),
    removePin: (pinId) =>
      set((state) => ({
        pins: state.pins.filter((p) => p.id !== pinId),
        selectedPin: state.selectedPin?.id === pinId ? null : state.selectedPin,
        routeWaypoints: state.routeWaypoints.filter((p) => p.id !== pinId),
      })),

    // Selected pin
    selectedPin: null,
    setSelectedPin: (pin) => set({ selectedPin: pin }),

    // New pin draft
    newPinDraft: null,
    setNewPinDraft: (draft) => set({ newPinDraft: draft }),

    // Budget
    budgetItems: [],
    setBudgetItems: (items) => set({ budgetItems: items }),
    addBudgetItem: (item) =>
      set((state) => ({ budgetItems: [...state.budgetItems, item] })),
    removeBudgetItem: (id) =>
      set((state) => ({
        budgetItems: state.budgetItems.filter((i) => i.id !== id),
      })),

    // UI state
    isSidebarOpen: true,
    toggleSidebar: () =>
      set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    activePanel: null,
    setActivePanel: (panel) => set({ activePanel: panel }),

    // Route
    routeWaypoints: [],
    setRouteWaypoints: (pins) => set({ routeWaypoints: pins }),
    addWaypoint: (pin) =>
      set((state) => {
        const exists = state.routeWaypoints.some((p) => p.id === pin.id);
        if (exists) return state;
        return { routeWaypoints: [...state.routeWaypoints, pin] };
      }),
    removeWaypoint: (pinId) =>
      set((state) => ({
        routeWaypoints: state.routeWaypoints.filter((p) => p.id !== pinId),
      })),
    clearRoute: () => set({ routeWaypoints: [] }),
  }))
);
