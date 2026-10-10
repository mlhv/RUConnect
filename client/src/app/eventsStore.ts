import { create } from 'zustand';
import { parseSeedBuildings, parseSeedEvents, type Building, type CampusEvent } from '@ruconnect/shared';
import seedBuildings from '../../../data/buildings.json';
import seedEvents from '../../../data/events.seed.json';
import { api } from './api';

interface EventsState {
  buildings: Building[];
  events: CampusEvent[];
  /** The instant the map is showing, as an ISO string. */
  selectedTime: string;
  /** True when the API could not be reached and bundled seed data is shown. */
  offline: boolean;
  load(): Promise<void>;
  setSelectedTime(iso: string): void;
  upsertEvent(event: CampusEvent): void;
}

export const useEventsStore = create<EventsState>((set) => ({
  buildings: [],
  events: [],
  selectedTime: new Date().toISOString(),
  offline: false,

  async load() {
    try {
      const [buildings, events, config] = await Promise.all([api.buildings(), api.events(), api.config()]);
      set({ buildings, events, offline: false, selectedTime: config.now ?? new Date().toISOString() });
    } catch {
      set({ buildings: parseSeedBuildings(seedBuildings), events: parseSeedEvents(seedEvents), offline: true });
    }
  },

  setSelectedTime(iso) {
    set({ selectedTime: iso });
  },

  upsertEvent(event) {
    set((s) => ({ events: [...s.events.filter((e) => e.id !== event.id), event] }));
  },
}));
