const METERS_PER_DEG_LAT = 111_320;

/** Closed ring of [lng, lat] points for an axis-aligned rectangle centered on a point. */
export function rectFootprint(lng: number, lat: number, widthM: number, depthM: number): [number, number][] {
  const dLat = depthM / 2 / METERS_PER_DEG_LAT;
  const dLng = widthM / 2 / (METERS_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [
    [lng - dLng, lat - dLat],
    [lng + dLng, lat - dLat],
    [lng + dLng, lat + dLat],
    [lng - dLng, lat + dLat],
    [lng - dLng, lat - dLat],
  ];
}
