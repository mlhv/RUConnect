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
