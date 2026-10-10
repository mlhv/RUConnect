/** The only way other slices drive the map. Implemented in client/src/map/. */
export interface MapController {
  flyTo(buildingId: string): void;
  highlight(buildingIds: string[]): void;
  clearHighlight(): void;
  setTime(iso: string): void;
}
