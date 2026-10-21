import { savedProjectHierarchy, sourceRecord } from './projectHierarchy.ts';

export const isProjectTarget = (id: string | null | undefined) => !!id?.startsWith('project:');
export function projectCampaignTargets(project: Record<string, unknown>) {
  const details = sourceRecord(project.source_details);
  const photos = [...new Set([...(Array.isArray(project.images) ? project.images : []), project.image_url].filter((v): v is string => typeof v === 'string' && /^https:\/\//.test(v)))];
  const base = {
    id: `project:${project.id}`, property_title: String(project.name || 'פרויקט'),
    description: typeof project.description === 'string' ? project.description : null,
    city: project.city ?? null, neighborhood: project.neighborhood ?? null, address: project.address ?? null,
    rooms: null, sqm: null, floor: null, asking_price: project.price_from ?? null,
    features: [], source_metadata: { ...details, developer_project_id: project.id, property_type: 'פרויקט' },
    media_photos: photos, status: project.status ?? null, is_published: false, created_at: project.created_at ?? null,
    deal_type: details.deal_type === 'rent' ? 'rent' : 'sale',
  };
  const hierarchy = savedProjectHierarchy(project);
  return [base, ...hierarchy.buildings.map(b => ({ ...base,
    id: `${base.id}:building:${encodeURIComponent(b.source_building_id)}`,
    property_title: `${base.property_title} · בניין ${b.name || b.source_building_id}`,
    source_metadata: { ...base.source_metadata, building_id: b.source_building_id },
  })), ...hierarchy.apartments.map((u, i) => ({ ...base,
    id: `${base.id}:unit:${encodeURIComponent(`${u.building_id ?? ''}:${u.source_unit_id}`)}`,
    property_title: `${base.property_title}${u.building_name ? ` · בניין ${u.building_name}` : ''} · ${u.rooms ? `${u.rooms} חדרים` : `דגם ${i + 1}`}`,
    rooms: u.rooms, sqm: u.size_sqm, floor: u.floor == null ? null : Number(u.floor) || null,
    asking_price: u.price ?? base.asking_price,
    media_photos: u.images.length ? u.images : photos,
    source_metadata: { ...base.source_metadata, ...u, property_type: u.type ?? 'דירה' },
  }))];
}