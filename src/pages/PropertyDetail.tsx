import { useMemo, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  BedDouble, Ruler, MapPin, Building2, ArrowRight, Phone, Mail,
  Calendar, Layers, Send, Home,
} from 'lucide-react';
import {
  MOCK_HOMELY_PROPERTIES,
  PROPERTY_TYPE_LABELS_HE,
  LISTING_TYPE_LABELS_HE,
  type HomelyProperty,
} from '@/lib/homelyMockProperties';
import { ShareWithLeadDialog } from '@/components/properties/ShareWithLeadDialog';

function formatPrice(n: number) {
  return `₪${n.toLocaleString('he-IL')}`;
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activePhoto, setActivePhoto] = useState(0);
  const [shareOpen, setShareOpen] = useState(false);

  const property = useMemo<HomelyProperty | undefined>(
    () => MOCK_HOMELY_PROPERTIES.find((p) => p.id === id),
    [id],
  );

  if (!property) {
    return (
      <div className="p-6 space-y-4 text-center" dir="rtl">
        <h1 className="text-2xl font-bold tracking-tight text-primary">הנכס לא נמצא</h1>
        <p className="text-muted-foreground">ייתכן שהקישור פג תוקף או שהנכס הוסר מהקטלוג.</p>
        <Button onClick={() => navigate('/properties')} variant="outline" className="gap-2">
          <ArrowRight className="h-4 w-4" /> חזרה לקטלוג
        </Button>
      </div>
    );
  }

  const isRent = property.listing_type === 'rent';
  const photos = property.photos.length ? property.photos : [];
  const main = photos[activePhoto];

  return (
    <div className="p-3 sm:p-6 space-y-6" dir="rtl">
      {/* Top breadcrumb / back */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Button variant="ghost" size="sm" asChild className="gap-1.5">
          <Link to="/properties">
            <ArrowRight className="h-4 w-4" /> חזרה לקטלוג הנכסים
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          {property.listing_type && (
            <Badge className={`border ${isRent ? 'bg-amber-500 text-white' : 'bg-primary text-primary-foreground'}`}>
              {LISTING_TYPE_LABELS_HE[property.listing_type]}
            </Badge>
          )}
          <Badge variant="secondary">{PROPERTY_TYPE_LABELS_HE[property.property_type]}</Badge>
        </div>
      </div>

      {/* Header — title + price */}
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-primary">{property.title}</h1>
          {property.address && (
            <p className="text-sm text-muted-foreground mt-1 inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {property.address}
            </p>
          )}
        </div>
        <div className="text-right">
          <div className="text-3xl font-extrabold text-success tabular-nums">
            {formatPrice(property.price)}
            {isRent && <span className="text-base font-normal text-muted-foreground"> /חודש</span>}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {property.size_sqm ? `${formatPrice(Math.round(property.price / property.size_sqm))} למ"ר` : ''}
          </p>
        </div>
      </header>

      {/* Gallery + sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Gallery */}
        <div className="lg:col-span-2 space-y-3">
          <Card className="overflow-hidden">
            <div className="aspect-[16/10] bg-muted relative">
              {main ? (
                <img src={main} alt={property.title} className="h-full w-full object-cover" />
              ) : (
                <div className="h-full w-full flex items-center justify-center text-muted-foreground">אין תמונה</div>
              )}
            </div>
          </Card>
          {photos.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {photos.map((p, i) => (
                <button
                  key={i}
                  onClick={() => setActivePhoto(i)}
                  className={`relative h-20 w-32 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                    i === activePhoto ? 'border-primary' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={p} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          )}

          {/* Specs grid */}
          <Card className="p-4 sm:p-5">
            <h2 className="text-base font-bold text-primary mb-4">מאפייני הנכס</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Spec icon={BedDouble} label="חדרים" value={property.rooms ? `${property.rooms}` : '—'} />
              <Spec icon={Ruler} label="שטח" value={property.size_sqm ? `${property.size_sqm} מ"ר` : '—'} />
              <Spec
                icon={Layers}
                label="קומה"
                value={property.floor != null ? `${property.floor}${property.total_floors ? ` / ${property.total_floors}` : ''}` : '—'}
              />
              <Spec icon={Calendar} label="שנת בנייה" value={property.year_built ? `${property.year_built}` : '—'} />
              <Spec icon={Home} label="סוג נכס" value={PROPERTY_TYPE_LABELS_HE[property.property_type]} />
              <Spec icon={MapPin} label="עיר" value={property.city || '—'} />
              <Spec icon={Building2} label="מצב" value={isRent ? 'להשכרה' : 'למכירה'} />
            </div>
          </Card>

          {/* Description */}
          {property.description && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-bold text-primary mb-2">תיאור הנכס</h2>
              <p className="text-sm leading-relaxed text-foreground/80 whitespace-pre-line">{property.description}</p>
            </Card>
          )}

          {/* Features */}
          {property.features?.length > 0 && (
            <Card className="p-4 sm:p-5">
              <h2 className="text-base font-bold text-primary mb-3">מאפיינים נוספים</h2>
              <div className="flex flex-wrap gap-2">
                {property.features.map((f) => (
                  <Badge key={f} variant="secondary" className="text-xs">
                    {f}
                  </Badge>
                ))}
              </div>
            </Card>
          )}
        </div>

        {/* Agent sidebar */}
        <aside className="space-y-4">
          {property.agent && (
            <Card className="p-5">
              <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4">הסוכן המטפל</h2>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-14 w-14 rounded-full bg-primary/10 grid place-items-center text-primary font-bold text-lg">
                  {property.agent.name.charAt(0)}
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-foreground truncate">{property.agent.name}</p>
                  {property.agent.agency && (
                    <p className="text-xs text-muted-foreground truncate">{property.agent.agency}</p>
                  )}
                </div>
              </div>
              <div className="space-y-2">
                <a
                  href={`tel:${property.agent.phone}`}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <Phone className="h-4 w-4 text-primary" /> {property.agent.phone}
                </a>
                <a
                  href={`mailto:${property.agent.email}`}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-primary transition-colors"
                >
                  <Mail className="h-4 w-4 text-primary" /> {property.agent.email}
                </a>
              </div>
              <div className="mt-5 grid gap-2">
                <Button className="w-full gap-2" onClick={() => setShareOpen(true)}>
                  <Send className="h-4 w-4" /> שתף עם מתעניין
                </Button>
                <Button variant="outline" className="w-full gap-2" asChild>
                  <a href={`tel:${property.agent.phone}`}>
                    <Phone className="h-4 w-4" /> התקשר לסוכן
                  </a>
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>

      <ShareWithLeadDialog
        property={property}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </div>
  );
}

function Spec({ icon: Icon, label, value }: { icon: typeof BedDouble; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
      </div>
    </div>
  );
}
