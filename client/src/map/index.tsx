import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { MapController } from '@ruconnect/shared';
import { useEventsStore } from '../app/eventsStore';
import { registerMapController } from '../app/mapController';
import { CATEGORY_COLORS, buildingCategories } from './activity';
import { BuildingPanel } from './BuildingPanel';
import { buildingsToGeoJSON, cameraPadding } from './geo';
import { eventsForBuilding } from './panel';
import { TimeSlider } from './TimeSlider';
import './map.css';

const TOKEN = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;
const SOURCE = 'ru-buildings';
const LAYER = 'ru-buildings-3d';
const CENTER: [number, number] = [-74.449, 40.5015];
const BASE_COLOR = '#3a4a6b';
const HIGHLIGHT_COLOR = '#ffd166';
/** How far a lit building brightens towards white at the top of its pulse. */
const PULSE_DEPTH = 0.35;
const PULSE_PERIOD_MS = 2400;
const PULSE_FRAME_MS = 66;

/**
 * A lit building's colour, brightened towards white by its `pulse` feature state. The pulse is a
 * feature state because changing the paint expression itself makes Mapbox reload the building tiles.
 */
const lit = (color: mapboxgl.ExpressionSpecification | string): mapboxgl.ExpressionSpecification =>
  ['interpolate', ['linear'], ['number', ['feature-state', 'pulse'], 0], 0, color, 1, '#ffffff'];
const BUILDING_COLOR: mapboxgl.ExpressionSpecification = [
  'case',
  ['boolean', ['feature-state', 'highlight'], false], lit(HIGHLIGHT_COLOR),
  ['boolean', ['feature-state', 'active'], false], lit(['to-color', ['feature-state', 'color'], CATEGORY_COLORS.other]),
  BASE_COLOR,
];

export function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  /** Buildings the pulse runs on: active ones and highlighted ones. */
  const activeRef = useRef<string[]>([]);
  const highlightedRef = useRef<string[]>([]);
  const [ready, setReady] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
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

    const controller: MapController = {
      flyTo(buildingId) {
        const b = useEventsStore.getState().buildings.find((x) => x.id === buildingId);
        if (!b) return;
        map.flyTo({
          center: [b.lng, b.lat], zoom: 17.5, pitch: 60, duration: 2000, padding: cameraPadding(window.innerWidth),
        });
      },
      openBuilding(buildingId) {
        setOpenId(buildingId);
      },
      highlight(buildingIds) {
        controller.clearHighlight();
        for (const id of buildingIds) map.setFeatureState({ source: SOURCE, id }, { highlight: true });
        highlightedRef.current = buildingIds;
      },
      clearHighlight() {
        for (const id of highlightedRef.current) map.setFeatureState({ source: SOURCE, id }, { highlight: false });
        highlightedRef.current = [];
      },
      setTime(iso) {
        useEventsStore.getState().setSelectedTime(iso);
      },
    };

    // 'style.load' comes before the basemap tiles, so the controller is not held up by a slow network.
    map.once('style.load', () => {
      map.addSource(SOURCE, { type: 'geojson', data: buildingsToGeoJSON([]), promoteId: 'id' });
      map.addLayer({
        id: LAYER,
        type: 'fill-extrusion',
        source: SOURCE,
        paint: {
          'fill-extrusion-height': ['get', 'heightM'],
          'fill-extrusion-opacity': 0.9,
          'fill-extrusion-color': BUILDING_COLOR,
        },
      });
      map.setPadding(cameraPadding(window.innerWidth));
      map.on('click', (e) => {
        const hit = map.queryRenderedFeatures(e.point, { layers: [LAYER] })[0];
        setOpenId(hit?.id == null ? null : String(hit.id));
      });
      map.on('mouseenter', LAYER, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', LAYER, () => {
        map.getCanvas().style.cursor = '';
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
    const categories = buildingCategories(events, selectedTime);
    activeRef.current = [...categories.keys()];
    for (const b of buildings) {
      const category = categories.get(b.id);
      map.setFeatureState(
        { source: SOURCE, id: b.id },
        { active: category !== undefined, color: category ? CATEGORY_COLORS[category] : null },
      );
    }
  }, [ready, buildings, events, selectedTime]);

  // Lit buildings breathe.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let last = 0;
    const tick = (ms: number) => {
      frame = requestAnimationFrame(tick);
      if (ms - last < PULSE_FRAME_MS) return;
      last = ms;
      const pulse = PULSE_DEPTH * (0.5 - 0.5 * Math.cos((ms / PULSE_PERIOD_MS) * 2 * Math.PI));
      for (const id of new Set([...activeRef.current, ...highlightedRef.current])) {
        map.setFeatureState({ source: SOURCE, id }, { pulse });
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [ready]);

  const openBuilding = buildings.find((b) => b.id === openId);

  if (!TOKEN) {
    return <div className="map-missing">Set VITE_MAPBOX_TOKEN in .env and restart to see the map.</div>;
  }
  return (
    <>
      <div ref={container} className="map" />
      {openBuilding && (
        <BuildingPanel
          building={openBuilding}
          events={eventsForBuilding(events, openBuilding.id, selectedTime)}
          onClose={() => setOpenId(null)}
        />
      )}
      <TimeSlider />
    </>
  );
}
