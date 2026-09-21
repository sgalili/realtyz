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
  }
}

type GoogleMap = { panTo: (position: { lat: number; lng: number }) => void };
type GoogleMarker = { setMap: (map: GoogleMap | null) => void; addListener: (event: string, callback: () => void) => void };

let mapsPromise: Promise<void> | null = null;

function loadGoogleMaps(): Promise<void> {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (mapsPromise) return mapsPromise;
  const key = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY'];
  const channel = import.meta.env['VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID'];
  if (!key) return Promise.reject(new Error('מפת Google אינה מחוברת'));
  mapsPromise = new Promise((resolve, reject) => {
    window.__realtyzGoogleMapsReady = () => resolve();
    const script = document.createElement('script');
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&loading=async&callback=__realtyzGoogleMapsReady${channel ? `&channel=${encodeURIComponent(channel)}` : ''}`;
    script.onerror = () => reject(new Error('טעינת המפה נכשלה'));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

export default function WorkspacePropertiesMap({ properties, selectedId, onSelect, fallbackAddress }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GoogleMap | null>(null);
  const markersRef = useRef<GoogleMarker[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
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
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'טעינת המפה נכשלה'));
    return () => { cancelled = true; };
  }, [properties, selectedId, onSelect]);

  if (properties.length === 0) {
    return (
      <div className="flex h-56 items-center justify-center rounded-lg border bg-muted/30 text-sm text-muted-foreground">
        <MapPin className="me-2 h-5 w-5" /> מיקום הנכס עדיין אינו זמין במפה
      </div>
    );
  }

  if (error) {
    return <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">{error}</div>;
  }

  return <div ref={containerRef} className="h-72 w-full overflow-hidden rounded-lg border" aria-label="מפת נכסי המשרד" />;
}