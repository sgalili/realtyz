import { useEffect, useMemo, useRef, useState } from 'react';
import { MapPin, Navigation } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { fmtILS } from '@/lib/formatCurrency';
import 'mapbox-gl/dist/mapbox-gl.css';

export type WorkspaceMapProperty = {
  id: string;
  title: string;
  latitude?: number | null;
  longitude?: number | null;
  price?: number | null;
  dealType?: string | null;
  imageUrl?: string | null;
  rooms?: number | null;
};

type Props = {
  properties: WorkspaceMapProperty[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Full geocodable address from the saved property row. */
  fallbackAddress?: string | null;
  addressLabel?: string | null;
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
  return fmtILS(n);
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
    ? 'flex h-12 w-14 items-center justify-center overflow-hidden rounded-md border-2 border-primary bg-card text-primary shadow-lg'
    : 'flex h-12 w-14 items-center justify-center overflow-hidden rounded-md border-2 border-background bg-card text-primary shadow-md';
  wrapper.setAttribute('aria-label', property.title || 'נכס במפה');
  if (property.imageUrl && /^https?:\/\//i.test(property.imageUrl)) {
    const image = document.createElement('img');
    image.src = property.imageUrl;
    image.alt = '';
    image.className = 'h-full w-full object-cover';
    image.addEventListener('error', () => { image.remove(); wrapper.textContent = '⌂'; }, { once: true });
    wrapper.appendChild(image);
    return wrapper;
  }
  const icon = document.createElement('span');
  icon.className = 'h-3 w-3 rounded-full bg-current';
  wrapper.appendChild(icon);
  return wrapper;
}

export default function WorkspacePropertiesMap({ properties, selectedId, onSelect, fallbackAddress, addressLabel }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markersRef = useRef<MapboxMarker[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
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
    <div className="absolute left-2 top-2 z-10 flex flex-col gap-1">
      <Button asChild variant="outline" size="sm" className="h-7 bg-card px-2 text-xs shadow-sm">
        <a
          href={selected ? `https://waze.com/ul?ll=${selected.latitude},${selected.longitude}&navigate=yes` : `https://waze.com/ul?q=${navTargetEncoded}&navigate=yes`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Navigation className="h-3.5 w-3.5 text-primary" /> ניווט בוויז
        </a>
      </Button>
      <Button asChild variant="outline" size="sm" className="h-7 bg-card px-2 text-xs shadow-sm">
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${navTargetEncoded}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MapPin className="h-3.5 w-3.5 text-success" /> גוגל מפות
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
          mapRef.current.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'bottom-right');
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
    if (!map || !selected || !ready) return;
    map.resize();
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    const mapboxMarkers = async () => {
      const mapboxgl = (await import('mapbox-gl')).default;
      const nextMarkers = displayPoints.map((property) => {
        const element = makeMarkerElement(property, property.id === selected.id);
        const marker = new mapboxgl.Marker({ element, anchor: 'center' })
          .setLngLat([property.longitude, property.latitude]);
        const price = formatPrice(property.price);
        const priceLabel = price ? `${price}${property.dealType === 'rent' ? ' / לחודש' : ''}` : null;
        if (property.title || price) {
          const content = document.createElement('div');
          content.dir = 'rtl';
          content.className = 'space-y-2 text-sm text-foreground';
          const heading = document.createElement('strong');
          heading.textContent = property.title;
          content.appendChild(heading);
          for (const label of [property.rooms ? `${property.rooms} חדרים` : null, priceLabel]) {
            if (!label) continue;
            const line = document.createElement('p');
            line.textContent = label;
            content.appendChild(line);
          }
          const link = document.createElement('a');
          link.href = '#';
          link.textContent = 'לצפייה בנכס';
          link.className = 'inline-flex font-semibold text-primary underline';
          link.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            marker.getPopup()?.remove();
            onSelectRef.current(property.id);
            requestAnimationFrame(() => {
              document.querySelectorAll('.realtyz-main-surface, [data-scroll-restoration], main').forEach((surface) => surface.scrollTo({ top: 0, behavior: 'instant' }));
              window.scrollTo({ top: 0, behavior: 'instant' });
            });
          });
          content.appendChild(link);
          marker.setPopup(new mapboxgl.Popup({ offset: 28, maxWidth: '260px' }).setDOMContent(content));
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
  }, [displayPoints, selected?.id, selected?.latitude, selected?.longitude, ready]);

  useEffect(() => () => {
    markersRef.current.forEach((marker) => marker.remove());
    mapRef.current?.remove();
    mapRef.current = null;
  }, []);

  if (!token || failed || !selected) {
    return (
      <div className="space-y-2">
        {(addressLabel || address) && <p className="text-sm font-medium text-foreground">{addressLabel || address}</p>}
        <div className="relative flex min-h-40 items-end gap-2 rounded-lg border bg-muted/30 p-4 text-sm font-medium text-foreground">
          <MapPin className="h-5 w-5 shrink-0 text-primary" />
          <span>{address || 'מיקום הנכס עדיין אינו זמין במפה'}</span>
          {navigationButtons}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {(addressLabel || address) && <p className="text-sm font-medium text-foreground">{addressLabel || address}</p>}
      <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-muted/20">
        {!ready ? <Skeleton className="absolute inset-0 z-10 h-full w-full rounded-none" /> : null}
        <div ref={containerRef} className="h-full w-full" aria-label="מפת נכסי המשרד" />
        {navigationButtons}
      </div>
    </div>
  );
}
