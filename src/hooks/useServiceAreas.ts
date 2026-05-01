/**
 * useServiceAreas
 * ---------------
 * Loads the current agent's `profiles.service_areas` (the cities/neighborhoods
 * they cover) and exposes helpers for the global hyper-local filter.
 *
 * Used by Dashboard, Deal Room, Properties, the "Add Lead" out-of-area prompt,
 * and the "Area of Expertise" settings panel.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { isInServiceArea } from '@/lib/serviceAreas';

export function useServiceAreas() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['service_areas', user?.id ?? 'anon'],
    enabled: !!user?.id,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('service_areas')
        .eq('id', user!.id)
        .maybeSingle();
      if (error) throw error;
      const raw = (data as any)?.service_areas;
      return Array.isArray(raw) ? (raw as string[]) : [];
    },
  });

  const serviceAreas: string[] = query.data ?? [];

  const isConfigured = serviceAreas.length > 0;

  const checkInArea = useCallback(
    (city: string | null | undefined, neighborhood: string | null | undefined) =>
      isInServiceArea(city, neighborhood, serviceAreas),
    [serviceAreas],
  );

  /** List of unique city labels covered (for substring filters in DB queries). */
  const coveredCities: string[] = Array.from(
    new Set(serviceAreas.map((a) => (a.includes(' - ') ? a.split(' - ')[0].trim() : a.trim()))),
  ).filter(Boolean);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ['service_areas'] });
  }, [qc]);

  return {
    serviceAreas,
    coveredCities,
    isConfigured,
    isLoading: query.isLoading,
    checkInArea,
    invalidate,
  };
}
