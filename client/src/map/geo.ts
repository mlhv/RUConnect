import type { Building } from '@ruconnect/shared';
import type { FeatureCollection, Polygon } from 'geojson';

export function buildingsToGeoJSON(buildings: Building[]): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: buildings.map((b) => ({
      type: 'Feature',
      properties: { id: b.id, name: b.name, heightM: b.heightM },
      geometry: { type: 'Polygon', coordinates: [b.footprint] },
    })),
  };
}

/** Right edge offset plus width plus gap of the sidebar in `app.css`. */
const SIDEBAR_PX = 352;
/** Below this width the sidebar spans the screen, so there is no clear side to shift towards. */
const WIDE_PX = 720;

/** Camera padding that keeps a fly-to target out from under the sidebar. */
export function cameraPadding(viewportWidth: number): { top: number; bottom: number; left: number; right: number } {
  return { top: 0, bottom: 0, left: 0, right: viewportWidth >= WIDE_PX ? SIDEBAR_PX : 0 };
}
