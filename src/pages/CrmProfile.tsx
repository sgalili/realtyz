import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, ExternalLink, Mail, Phone, User } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/formatPhone';

type Profile = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  profile_type: string;
  social_links: Record<string, string | null> | null;
  professional_info: Record<string, unknown> | null;
  enrichment_status: string;
  notes: string | null;
};

export default function CrmProfile() {
  const { id } = useParams<{ id: string }>();

  const { data: profile, isLoading } = useQuery({
    queryKey: ['crm_profile', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('crm_profiles' as any)
        .select('*')
        .eq('id', id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as Profile | null;
    },
  });

  const { data: listings } = useQuery({
    queryKey: ['crm_profile_listings', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('listings')
        .select('id, property_title, city, address, deal_type, asking_price, status')
        .eq('owner_id', id!)
        .order('created_at', { ascending: false });
      return (data || []) as any[];
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4" dir="rtl">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="p-6 max-w-3xl mx-auto" dir="rtl">
        <Link to="/properties" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowRight className="h-4 w-4" /> חזרה
        </Link>
        <p className="mt-6 text-muted-foreground">פרופיל לא נמצא.</p>
      </div>
    );
  }

  const social = profile.social_links || {};

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6" dir="rtl">
      <Link to="/properties" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowRight className="h-4 w-4" /> חזרה לנכסים
      </Link>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            <User className="h-8 w-8" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-foreground">{profile.full_name}</h1>
            <p className="text-sm text-muted-foreground">
              {profile.profile_type} · סטטוס העשרה: {profile.enrichment_status}
            </p>
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              {profile.phone && (
                <a href={`tel:${profile.phone}`} className="inline-flex items-center gap-1.5 text-foreground hover:text-primary">
                  <Phone className="h-4 w-4" /> <span dir="ltr">{formatPhoneDisplay(profile.phone)}</span>
                </a>
              )}
              {profile.email && (
                <a href={`mailto:${profile.email}`} className="inline-flex items-center gap-1.5 text-foreground hover:text-primary">
                  <Mail className="h-4 w-4" /> {profile.email}
                </a>
              )}
            </div>
          </div>
        </div>
      </Card>

      {Object.keys(social).length > 0 && (
        <Card className="p-5">
          <h2 className="text-base font-bold text-primary mb-3">קישורים חברתיים ומקצועיים</h2>
          <ul className="space-y-1.5 text-sm">
            {Object.entries(social).map(([k, v]) =>
              v ? (
                <li key={k}>
                  <a
                    href={v}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> {k}
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="text-base font-bold text-primary mb-3">נכסים משויכים</h2>
        {(!listings || listings.length === 0) ? (
          <p className="text-sm text-muted-foreground">אין נכסים משויכים.</p>
        ) : (
          <ul className="space-y-2">
            {listings.map((l) => (
              <li key={l.id}>
                <Link to={`/properties/${l.id}`} className="text-sm text-primary hover:underline">
                  {l.property_title || l.address || l.city || 'נכס'}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
