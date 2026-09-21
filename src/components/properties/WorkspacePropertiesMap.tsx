import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import 'mapbox-gl/dist/mapbox-gl.css';

export type WorkspaceMapProperty = {
  id: string;
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  price?: number | null;
};

type Props = {
  properties: WorkspaceMapProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Full geocodable address from the saved property row. */
  fallbackAddress?: string | null;
};

type PointProperty = WorkspaceMapProperty & {
  latitude: number;
  longitude: number;
};

type MapboxMap = import('mapbox-gl').Map;
type MapboxMarker = import('mapbox-gl').Marker;

function validPoint(property: WorkspaceMapProperty): PointProperty | null {
  const latitude = Number(property.latitude);
  const longitude = Number(property.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude === 0 || longitude === 0) return null;
  return { ...property, latitude, longitude };
}

function formatPrice(value?: number | null): string | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return `₪${n.toLocaleString('he-IL', { maximumFractionDigits: 0 })}`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;',
  }[char] ?? char));
}

function getToken(): string {
  return String(import.meta.env['VITE_LOVABLE_CONNECTOR_MAPBOX_PUBLIC_TOKEN'] ?? '').trim();
}

function navigationTarget(point: PointProperty | null, address: string): string {
  if (point) return `${point.latitude},${point.longitude}`;
  return address;
}

function makeMarkerElement(property: PointProperty, selected: boolean) {
  const wrapper = document.createElement('button');
  wrapper.type = 'button';
  wrapper.dir = 'rtl';
  wrapper.className = selected
    ? 'group flex h-9 w-9 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg ring-2 ring-primary/25 transition-transform hover:scale-105'
    : 'group flex h-8 w-8 items-center justify-center rounded-full border-2 border-background bg-card text-primary shadow-md ring-1 ring-border transition-transform hover:scale-105';
  wrapper.setAttribute('aria-label', property.title || 'נכס במפה');

  const icon = document.createElement('span');
  icon.className = 'h-3 w-3 rounded-full bg-current';
  wrapper.appendChild(icon);
  return wrapper;
}

export default function WorkspacePropertiesMap({ properties, selectedId, onSelect, fallbackAddress }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const address = (fallbackAddress ?? '').replace(/\s+/g, ' ').trim();
  const points = useMemo(() => properties.map(validPoint).filter((item): item is PointProperty => Boolean(item)), [properties]);
  const displayPoints = points;
  const selected = displayPoints.find((property) => property.id === selectedId) ?? displayPoints[0] ?? null;
  const token = getToken();
  const navTarget = navigationTarget(selected, address);
  const navTargetEncoded = encodeURIComponent(navTarget);

  const navigationButtons = navTarget ? (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline" size="sm">
        <a
          href={selected ? `https://waze.com/ul?ll=${selected.latitude},${selected.longitude}&navigate=yes` : `https://waze.com/ul?q=${navTargetEncoded}&navigate=yes`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation className="h-4 w-4" /> Waze
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${navTargetEncoded}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation className="h-4 w-4" /> Google Maps
        </a>
      </Button>
    </div>
  ) : null;

  useEffect(() => {
    if (!token || !containerRef.current || !selected) return;
    let cancelled = false;

    const init = async () => {
      try {
        const mapboxgl = (await import('mapbox-gl')).default;
        if (cancelled || !containerRef.current) return;
        mapboxgl.accessToken = token;
        if (!mapboxgl.supported()) {
          setFailed(true);
          return;
        }

        if (!mapRef.current) {
          mapRef.current = new mapboxgl.Map({
            container: containerRef.current,
            style: 'mapbox://styles/mapbox/streets-v12',
            center: [selected.longitude, selected.latitude],
            zoom: displayPoints.length > 1 ? 11 : 15,
            attributionControl: false,
            cooperativeGestures: true,
          });
          mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
          mapRef.current.once('load', () => setReady(true));
          mapRef.current.on('error', (event: { error?: Error }) => {
            console.warn('Mapbox render error:', event.error);
            setFailed(true);
          });
        } else {
          mapRef.current.easeTo({ center: [selected.longitude, selected.latitude], zoom: displayPoints.length > 1 ? 11 : 15, duration: 350 });
        }
      } catch (error) {
        console.warn('Mapbox init error:', error);
        if (!cancelled) setFailed(true);
      }
    };

    void init();
    return () => { cancelled = true; };
  }, [token, selected?.id, selected?.latitude, selected?.longitude, displayPoints.length]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !selected) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const mapboxMarkers = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      const nextMarkers = displayPoints.map((property) => {
        const element = makeMarkerElement(property, property.id === selected.id);
        element.addEventListener('click', () => onSelect(property.id));
        const marker = new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat([property.longitude, property.latitude]);
        const price = formatPrice(property.price);
        if (property.title || price) {
          marker.setPopup(new mapboxgl.Popup({ offset: 18 }).setHTML(
            `<div dir="rtl"><strong>${escapeHtml(property.title)}</strong>${price ? `<br>${escapeHtml(price)}` : ''}</div>`,
          ));
        }
        marker.addTo(map);
        return marker;
      });
      markersRef.current = nextMarkers;

      if (displayPoints.length > 1) {
        const bounds = new mapboxgl.LngLatBounds();
        displayPoints.forEach((property) => bounds.extend([property.longitude, property.latitude]));
        map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 350 });
      } else {
        map.easeTo({ center: [selected.longitude, selected.latitude], zoom: 15, duration: 350 });
      }
    };

    void mapboxMarkers().catch((error) => {
      console.warn('Mapbox marker error:', error);
      setFailed(true);
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [displayPoints, selected?.id, selected?.latitude, selected?.longitude, onSelect]);

  useEffect(() => () => {
    markersRef.current.forEach((marker) => marker.remove());
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  if (!token) {
    return (
      <div className="space-y-2">
        <div className="flex min-h-24 items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm font-medium text-foreground">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <span>{address || 'מיקום הנכס יוצג לאחר חיבור Mapbox'}</span>
        </div>
        {navigationButtons}
      </div>
    );
  }

  if (failed || !selected) {
    return (
      <div className="space-y-2">
        <div className="flex min-h-24 items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm font-medium text-foreground">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <span>{address || 'מיקום הנכס עדיין אינו זמין במפה'}</span>
        </div>
        {navigationButtons}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-muted/20">
        {!ready ? <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" /> : null}
        <div ref={containerRef} className="h-full w-full" aria-label="מפת נכסי המשרד" />
      </div>
      {navigationButtons}
    </div>
  );
}
