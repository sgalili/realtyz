import { concisePublicText, ritaPropertySearchSchema, type RitaPropertySearchInput } from './ritaVoice';
import type { RitaAdmin } from './ritaVoiceSecurity.server';

const PROPERTY_COLUMNS = 'id,property_title,city,neighborhood,address,asking_price,rooms,deal_type,sqm,floor,parking,elevator,short_description,description,workspace_owner_id,updated_at';

type PropertyRow = Record<string, unknown>;

function safeArea(value: string): string {
  return value.replace(/[%_,()"']/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
}

function mapMatch(row: PropertyRow) {
  return {
    property_id: String(row['id']),
    broker_id: String(row['workspace_owner_id'] ?? ''),
    title: concisePublicText(row['property_title'] ?? row['address'], 140),
    city: concisePublicText(row['city'], 80),
    neighborhood: concisePublicText(row['neighborhood'], 80),
    rooms: row['rooms'] == null ? null : Number(row['rooms']),
    price: row['asking_price'] == null ? null : Number(row['asking_price']),
    deal_type: concisePublicText(row['deal_type'], 20),
    sqm: row['sqm'] == null ? null : Number(row['sqm']),
    floor: row['floor'] == null ? null : Number(row['floor']),
    parking: typeof row['parking'] === 'boolean' ? row['parking'] : null,
    elevator: typeof row['elevator'] === 'boolean' ? row['elevator'] : null,
    description: concisePublicText(row['short_description'] ?? row['description'], 320),
  };
}

async function queryProperties(admin: RitaAdmin, input: ReturnType<typeof ritaPropertySearchSchema.parse>, brokerId: string | null): Promise<PropertyRow[]> {
  let query = admin.from('listings').select(PROPERTY_COLUMNS)
    .eq('status', 'live')
    .is('canonical_duplicate_of', null)
    .or('is_published.eq.true,affiliate_enabled.eq.true')
    .order('updated_at', { ascending: false })
    .limit(5);
  if (brokerId) query = query.eq('workspace_owner_id', brokerId);
  if (input.property_id) query = query.eq('id', input.property_id);
  if (input.min_rooms != null) query = query.gte('rooms', input.min_rooms);
  if (input.max_price != null && input.max_price > 0) query = query.lte('asking_price', input.max_price);
  if (input.property_type === 'sale' || input.property_type === 'rent') query = query.eq('deal_type', input.property_type);
  else if (input.property_type) query = query.ilike('property_title', `%${safeArea(input.property_type)}%`);
  const area = safeArea(input.city_or_area ?? '');
  if (area && !input.property_id) query = query.or(`city.ilike.%${area}%,neighborhood.ilike.%${area}%,address.ilike.%${area}%`);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as unknown as PropertyRow[];
}

export async function searchRitaProperties(admin: RitaAdmin, rawInput: RitaPropertySearchInput) {
  const input = ritaPropertySearchSchema.parse(rawInput);
  const brokerId = input.broker_id || null;
  const own = brokerId ? await queryProperties(admin, input, brokerId) : [];
  const expanded = own.length === 0;
  const rows = expanded ? await queryProperties(admin, input, null) : own;
  const matches = rows.map(mapMatch);
  return {
    search_scope: expanded && brokerId ? 'cross_broker' : brokerId ? 'broker' : 'public',
    broker_id: brokerId ?? '',
    count: matches.length,
    property_ids: matches.map(match => match.property_id),
    matches,
    message: matches.length === 0
      ? 'לא נמצאו נכסים פעילים ופומביים התואמים את החיפוש.'
      : expanded && brokerId
        ? 'לא נמצאה התאמה במלאי המשרד, ולכן הוצגו התאמות פומביות ממלאי TORAFF הרחב.'
        : 'ההתאמות נמצאו תחילה במלאי המשרד.',
  };
}
