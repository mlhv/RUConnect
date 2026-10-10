import type { MapController } from '@ruconnect/shared';

let current: MapController | null = null;

/** Called by the map slice when the map is ready, and with null when it unmounts. */
export function registerMapController(controller: MapController | null): void {
  current = controller;
}

/** Other slices import this. Calls made before the map is ready are dropped. */
export const mapController: MapController = {
  flyTo: (buildingId) => current?.flyTo(buildingId),
  openBuilding: (buildingId) => current?.openBuilding(buildingId),
  highlight: (buildingIds) => current?.highlight(buildingIds),
  clearHighlight: () => current?.clearHighlight(),
  setTime: (iso) => current?.setTime(iso),
};
