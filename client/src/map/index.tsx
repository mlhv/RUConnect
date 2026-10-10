import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import { activeBuildingIds, type MapController } from '@ruconnect/shared';
import { useEventsStore } from '../app/eventsStore';
import { registerMapController } from '../app/mapController';
import { buildingsToGeoJSON } from './geo';
import { TimeSlider } from './TimeSlider';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const SOURCE = 'ru-buildings';
const LAYER = 'ru-buildings-3d';
const CENTER: [number, number] = [-74.449, 40.5015];

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const buildings = useEventsStore((s) => s.buildings);
  const events = useEventsStore((s) => s.events);
  const selectedTime = useEventsStore((s) => s.selectedTime);

  useEffect(() => {
    if (!TOKEN || !container.current) return;
    mapboxgl.accessToken = TOKEN;
    const map = new mapboxgl.Map({
      container: container.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: CENTER,
      zoom: 15.5,
      pitch: 60,
      bearing: -30,
      antialias: true,
    });
    mapRef.current = map;
    let highlighted: string[] = [];

    const controller: MapController = {
      flyTo(buildingId) {
        const b = useEventsStore.getState().buildings.find((x) => x.id === buildingId);
        if (b) map.flyTo({ center: [b.lng, b.lat], zoom: 17.5, pitch: 60, duration: 2000 });
      },
      openBuilding() {
        // Slice A implements the building panel here.
      },
      highlight(buildingIds) {
        controller.clearHighlight();
        for (const id of buildingIds) map.setFeatureState({ source: SOURCE, id }, { highlight: true });
        highlighted = buildingIds;
      },
      clearHighlight() {
        for (const id of highlighted) map.setFeatureState({ source: SOURCE, id }, { highlight: false });
        highlighted = [];
      },
      setTime(iso) {
        useEventsStore.getState().setSelectedTime(iso);
      },
    };

    map.on('load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: buildingsToGeoJSON([]), promoteId: 'id' });
      map.addLayer({
        id: LAYER,
        type: 'fill-extrusion',
        source: SOURCE,
        paint: {
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-color': [
            'case',
            ['boolean', ['feature-state', 'highlight'], false], '#ffd166',
            ['boolean', ['feature-state', 'active'], false], '#ff5d8f',
            '#3a4a6b',
          ],
        },
      });
      registerMapController(controller);
      setReady(true);
    });

    return () => {
      registerMapController(null);
      setReady(false);
      mapRef.current = null;
      map.remove();
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(SOURCE) as mapboxgl.GeoJSONSource).setData(buildingsToGeoJSON(buildings));
  }, [ready, buildings]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const active = activeBuildingIds(events, selectedTime);
    for (const b of buildings) map.setFeatureState({ source: SOURCE, id: b.id }, { active: active.has(b.id) });
  }, [ready, buildings, events, selectedTime]);

  if (!TOKEN) {
    return <div className="map-missing">Set VITE_MAPBOX_TOKEN in .env and restart to see the map.</div>;
  }
  return (
    <>
      <div ref={container} className="map" />
      <TimeSlider />
    </>
  );
}
