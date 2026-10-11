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

const BEACON_RADIUS_M = 3;
const BEACON_SIDES = 16;
const M_PER_DEG_LAT = 111_320;

export interface Beacon {
  heightM: number;
  color: string;
}

/** A thin column standing on the roof of each building that has a beacon, at the building's centre. */
export function beaconsToGeoJSON(buildings: Building[], beacons: Map<string, Beacon>): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: buildings.flatMap((b) => {
      const beacon = beacons.get(b.id);
      if (!beacon) return [];
      const mPerDegLng = M_PER_DEG_LAT * Math.cos((b.lat * Math.PI) / 180);
      const ring = Array.from({ length: BEACON_SIDES + 1 }, (_, i) => {
        const angle = ((i % BEACON_SIDES) / BEACON_SIDES) * 2 * Math.PI;
        return [
          b.lng + (BEACON_RADIUS_M * Math.cos(angle)) / mPerDegLng,
          b.lat + (BEACON_RADIUS_M * Math.sin(angle)) / M_PER_DEG_LAT,
        ];
      });
      return [{
        type: 'Feature' as const,
        properties: { id: b.id, baseM: b.heightM, topM: b.heightM + beacon.heightM, color: beacon.color },
        geometry: { type: 'Polygon' as const, coordinates: [ring] },
      }];
    }),
  };
}
