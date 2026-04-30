import { useEffect, useRef, useState, useCallback } from 'react';
import { Skeleton } from '@/components/ui/skeleton';

const CITY_COORDS: Record<string, [number, number]> = {
  'ירושלים': [35.2137, 31.7683], 'תל אביב': [34.7818, 32.0853], 'חיפה': [34.9896, 32.7940],
  'ראשון לציון': [34.7913, 31.9730], 'פתח תקווה': [34.8878, 32.0841], 'אשדוד': [34.6553, 31.8040],
  'נתניה': [34.8571, 32.3215], 'באר שבע': [34.7913, 31.2518], 'חולון': [34.7748, 32.0158],
  'בני ברק': [34.8338, 32.0834], 'רמת גן': [34.8112, 32.0680], 'אשקלון': [34.5713, 31.6688],
  'רחובות': [34.8113, 31.8928], 'בת ים': [34.7515, 32.0171], 'הרצליה': [34.7913, 32.1663],
  'כפר סבא': [34.9065, 32.1752], 'רעננה': [34.8706, 32.1836], 'מודיעין': [35.0081, 31.8969],
  'לוד': [34.8951, 31.9514], 'רמלה': [34.8626, 31.9275], 'נצרת': [35.3033, 32.6996],
  'עפולה': [35.2893, 32.6100], 'טבריה': [35.5328, 32.7940], 'אילת': [34.9519, 29.5577],
  'עכו': [35.0764, 32.9272], 'קריית גת': [34.7643, 31.6100], 'נהריה': [35.0979, 33.0078],
  'דימונה': [35.0333, 31.0680], 'קריית שמונה': [35.5741, 33.2083], 'צפת': [35.4967, 32.9646],
};

interface CityCluster {
  city: string;
  count: number;
  positive: number;
  negative: number;
  neutral: number;
}

interface Props {
  mapboxToken: string;
  cityClusters: CityCluster[];
  isLoading: boolean;
}

function isWebGLSupported(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch {
    return false;
  }
}

function StaticMapFallback({ mapboxToken, cityClusters }: { mapboxToken: string; cityClusters: CityCluster[] }) {
  // Build marker pins for top cities
  const sorted = cityClusters.filter(c => c.count > 0 && CITY_COORDS[c.city]).sort((a, b) => b.count - a.count).slice(0, 10);
  const markers = sorted.map(c => {
    const [lng, lat] = CITY_COORDS[c.city];
    const color = c.positive > c.negative ? '2ecc71' : c.negative > c.positive ? 'e74c3c' : '3498db';
    return `pin-s+${color}(${lng},${lat})`;
  }).join(',');

  const staticUrl = `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${markers ? markers + '/' : ''}34.85,31.5,6.5,0/800x400@2x?access_token=${mapboxToken}`;

  return (
    <div className="space-y-3">
      <div className="relative rounded-lg overflow-hidden border border-border/40">
        <img
          src={staticUrl}
          alt="מפת ישראל"
          className="w-full h-[300px] object-cover"
          loading="lazy"
        />
        <div className="absolute bottom-2 left-2 bg-background/80 backdrop-blur-sm rounded px-2 py-1 text-[10px] text-muted-foreground">
          מפה סטטית - הדפדפן אינו תומך ב-WebGL
        </div>
      </div>
      <CityGrid cityClusters={cityClusters} />
    </div>
  );
}

function CityGrid({ cityClusters }: { cityClusters: CityCluster[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto">
      {cityClusters.filter(c => c.count > 0).sort((a, b) => b.count - a.count).map(c => {
        const sentimentColor = c.positive > c.negative ? 'text-emerald-500' : c.negative > c.positive ? 'text-red-500' : 'text-muted-foreground';
        return (
          <div key={c.city} className="p-2.5 rounded-lg border border-border/40 bg-muted/20">
            <p className="text-sm font-medium truncate">{c.city}</p>
            <p className="text-lg font-bold">{c.count.toLocaleString()}</p>
            <p className={`text-[10px] ${sentimentColor}`}>+{c.positive} / -{c.negative}</p>
          </div>
        );
      })}
    </div>
  );
}

export default function VoterHeatmap({ mapboxToken, cityClusters, isLoading }: Props) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const animFrameRef = useRef<number>(0);
  const [mapError, setMapError] = useState<string | null>(null);
  const [webglSupported] = useState(() => isWebGLSupported());

  useEffect(() => {
    // Reset error when inputs change
    setMapError(null);
  }, [mapboxToken, cityClusters]);

  useEffect(() => {
    if (!mapboxToken || !webglSupported || !mapContainer.current || cityClusters.length === 0) return;

    let map: any;
    let cancelled = false;

    const initMap = async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        await import('mapbox-gl/dist/mapbox-gl.css');

        if (cancelled) return;

        // Double-check support via library
        if (!mapboxgl.supported()) {
          setMapError('webgl');
          return;
        }

        (mapboxgl as any).accessToken = mapboxToken;

        map = new mapboxgl.Map({
          container: mapContainer.current!,
          style: 'mapbox://styles/mapbox/dark-v11',
          center: [34.85, 31.5],
          zoom: 7,
          attributionControl: false,
        });

        map.addControl(new mapboxgl.NavigationControl(), 'top-left');

        map.on('load', () => {
          if (cancelled) return;
          const maxCount = Math.max(...cityClusters.map(c => c.count), 1);
          const features = cityClusters
            .map(cluster => {
              const coords = CITY_COORDS[cluster.city];
              if (!coords) return null;
              const sentimentScore = cluster.count > 0 ? (cluster.positive - cluster.negative) / cluster.count : 0;
              return {
                type: 'Feature' as const,
                geometry: { type: 'Point' as const, coordinates: coords },
                properties: { city: cluster.city, count: cluster.count, positive: cluster.positive, negative: cluster.negative, neutral: cluster.neutral, normalizedCount: cluster.count / maxCount, sentimentScore },
              };
            })
            .filter(Boolean);

          map.addSource('voters', { type: 'geojson', data: { type: 'FeatureCollection', features } });

          map.addLayer({
            id: 'voters-heat', type: 'heatmap', source: 'voters',
            paint: {
              'heatmap-weight': ['get', 'normalizedCount'], 'heatmap-intensity': 1.5,
              'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 5, 30, 10, 50],
              'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'hsl(220,70%,50%)', 0.4, 'hsl(180,70%,50%)', 0.6, 'hsl(120,70%,50%)', 0.8, 'hsl(50,90%,55%)', 1, 'hsl(0,80%,55%)'],
              'heatmap-opacity': 0.7,
            },
          });

          map.addLayer({
            id: 'voters-circles', type: 'circle', source: 'voters', minzoom: 8,
            paint: {
              'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 8, 100, 30, 1000, 50],
              'circle-color': ['interpolate', ['linear'], ['get', 'sentimentScore'], -1, 'hsl(0,70%,55%)', 0, 'hsl(220,60%,55%)', 1, 'hsl(140,70%,45%)'],
              'circle-opacity': 0.8, 'circle-stroke-width': 1, 'circle-stroke-color': 'rgba(255,255,255,0.3)',
            },
          });

          // Pulse
          map.addLayer({
            id: 'voters-pulse', type: 'circle', source: 'voters',
            paint: { 'circle-radius': 12, 'circle-color': 'hsl(48,96%,53%)', 'circle-opacity': 0, 'circle-stroke-width': 2, 'circle-stroke-color': 'hsl(48,96%,53%)', 'circle-stroke-opacity': 0 },
          });

          let pulsePhase = 0;
          const animatePulse = () => {
            if (cancelled || !map.getLayer('voters-pulse')) return;
            pulsePhase = (pulsePhase + 1) % 120;
            const t = pulsePhase / 120;
            const scale = 1 + t * 1.2;
            map.setPaintProperty('voters-pulse', 'circle-stroke-opacity', Math.max(0, 0.6 * (1 - t)));
            map.setPaintProperty('voters-pulse', 'circle-radius', ['interpolate', ['linear'], ['get', 'count'], 1, 12 * scale, 100, 35 * scale, 1000, 55 * scale]);
            animFrameRef.current = requestAnimationFrame(animatePulse);
          };
          animFrameRef.current = requestAnimationFrame(animatePulse);

          // Labels
          map.addLayer({
            id: 'voters-labels', type: 'symbol', source: 'voters', minzoom: 8,
            layout: { 'text-field': ['concat', ['get', 'city'], '\n', ['to-string', ['get', 'count']]], 'text-size': 11, 'text-anchor': 'center', 'text-allow-overlap': false },
            paint: { 'text-color': '#fff', 'text-halo-color': 'rgba(0,0,0,0.7)', 'text-halo-width': 1 },
          });

          // Popup
          const popup = new mapboxgl.Popup({ closeButton: false, closeOnClick: false });
          map.on('mouseenter', 'voters-circles', (e: any) => {
            map.getCanvas().style.cursor = 'pointer';
            const p = e.features[0].properties;
            popup.setLngLat(e.features[0].geometry.coordinates).setHTML(
              `<div style="direction:rtl;font-family:sans-serif;padding:4px"><strong>${p.city}</strong><br/>בוחרים: ${p.count}<br/>חיובי: ${p.positive} | ניטרלי: ${p.neutral} | שלילי: ${p.negative}</div>`
            ).addTo(map);
          });
          map.on('mouseleave', 'voters-circles', () => { map.getCanvas().style.cursor = ''; popup.remove(); });
        });

        mapRef.current = map;
      } catch (err) {
      console.error('Map init error:', err);
        if (!cancelled) setMapError('init');
      }
    };

    initMap();
    return () => {
      cancelled = true;
      cancelAnimationFrame(animFrameRef.current);
      map?.remove();
      mapRef.current = null;
    };
  }, [mapboxToken, cityClusters, webglSupported]);

  if (isLoading) return <Skeleton className="h-[400px] w-full rounded-lg" />;

  if (!mapboxToken) return (
    <div className="h-[300px] w-full rounded-lg bg-muted/30 border border-border/40 flex flex-col items-center justify-center gap-3">
      <p className="text-sm text-muted-foreground">רכיב המפה עדיין לא הוגדר</p>
    </div>
  );

  // WebGL unsupported or init failed → static map + city grid
  if (!webglSupported || mapError) {
    return <StaticMapFallback mapboxToken={mapboxToken} cityClusters={cityClusters} />;
  }

  return <div ref={mapContainer} className="h-[400px] w-full rounded-lg overflow-hidden" />;
}
