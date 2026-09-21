import { useEffect, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';

export type WorkspaceMapProperty = {
  id: string;
  title: string;
  latitude: number;
  longitude: number;
  price?: number | null;
};

type Props = {
  properties: WorkspaceMapProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /**
   * Full street address of the shown property. When no coordinates exist we
   * render the embedded map by address instead of hiding the map entirely.
   */
  fallbackAddress?: string | null;
};

declare global {
  interface Window {
    google?: {
      maps: {
        Map: new (element: HTMLElement, options: Record<string, unknown>) => GoogleMap;
        Marker: new (options: Record<string, unknown>) => GoogleMarker;
      };
    };
    __realtyzGoogleMapsReady?: () => void;
    gm_authFailure?: () => void;
  }
}

type GoogleMap = { panTo: (position: { lat: number; lng: number }) => void };
type GoogleMarker = { setMap: (map: GoogleMap | null) => void; addListener: (event: string, callback: () => void) => void };

let mapsPromise: Promise<void> | null = null;

/**
 * Google fires `window.gm_authFailure` when the browser key is rejected (for
 * example HTTP-referrer restrictions on a custom domain). We latch that here so
 * every map instance can hide itself instead of rendering Google's black
 * "this page can't load Google Maps correctly" error box.
 */
let authFailed = false;
const authListeners = new Set<() => void>();

function markAuthFailure() {
  authFailed = true;
  authListeners.forEach((listener) => listener());
}

if (typeof window !== 'undefined') {
  window.gm_authFailure = markAuthFailure;
}

function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  const key = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'];
  const channel = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'];
  if (!key) return Promise.reject(new Error('map_unavailable'));
  mapsPromise = new Promise((resolve, reject) => {
    window.__realtyzGoogleMapsReady = () => resolve();
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__realtyzGoogleMapsReady${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`;
    script.onerror = () => {
      markAuthFailure();
      reject(new Error('map_unavailable'));
    };
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export default function WorkspacePropertiesMap({ properties, selectedId, onSelect, fallbackAddress }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const [failed, setFailed] = useState(authFailed);

  // Any map instance that mounts after a rejection must stay hidden too.
  useEffect(() => {
    if (authFailed) setFailed(true);
    const listener = () => setFailed(true);
    authListeners.add(listener);
    return () => { authListeners.delete(listener); };
  }, []);

  useEffect(() => {
    if (failed) return;
    if (!containerRef.current || properties.length === 0) return;
    let cancelled = false;
    void loadGoogleMaps().then(() => {
      if (cancelled || !containerRef.current || !window.google?.maps) return;
      const selected = properties.find((property) => property.id === selectedId) ?? properties[0];
      if (!mapRef.current) {
        mapRef.current = new window.google.maps.Map(containerRef.current, {
          center: { lat: selected.latitude, lng: selected.longitude },
          zoom: 14,
          clickableIcons: false,
          fullscreenControl: false,
          mapTypeControl: false,
          streetViewControl: false,
        });
      }
      markersRef.current.forEach((marker) => marker.setMap(null));
      markersRef.current = properties.map((property) => {
        const marker = new window.google.maps.Marker({
          map: mapRef.current,
          position: { lat: property.latitude, lng: property.longitude },
          title: property.title,
          label: property.id === selected.id ? '●' : undefined,
          zIndex: property.id === selected.id ? 10 : 1,
        });
        marker.addListener('click', () => onSelect(property.id));
        return marker;
      });
      mapRef.current.panTo({ lat: selected.latitude, lng: selected.longitude });
    }).catch(() => setFailed(true));
    return () => { cancelled = true; };
  }, [properties, selectedId, onSelect, failed]);

  const embedKey = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'];
  const address = (fallbackAddress ?? '').trim();

  // Key rejected / script blocked: no Google surface at all, just a clean
  // address line. The external Waze / Google Maps buttons stay rendered by the
  // parent page underneath.
  if (failed) {
    return (
      <div className="flex min-h-24 items-center gap-2 rounded-lg border bg-muted/30 p-4 text-sm font-medium text-foreground">
        <MapPin className="h-5 w-5 shrink-0 text-primary" />
        <span>{address || 'ניתן לנווט לנכס באמצעות הכפתורים שמתחת'}</span>
      </div>
    );
  }

  // No coordinates: render the embedded map straight from the street address
  // so every property view still shows a pin.
  if (properties.length === 0 && address && embedKey) {
    return (
      <iframe
        title="מפת הנכס"
        className="h-72 w-full overflow-hidden rounded-lg border"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        onError={() => setFailed(true)}
        src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(embedKey)}&q=${encodeURIComponent(address)}&zoom=15&language=he&region=IL`}
      />
    );
  }

  if (properties.length === 0) {
    return (
      <div className="flex h-24 items-center justify-center rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
        <MapPin className="me-2 h-5 w-5" /> {address || 'מיקום הנכס עדיין אינו זמין במפה'}
      </div>
    );
  }

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-lg border" aria-label="מפת נכסי המשרד" />;
}
