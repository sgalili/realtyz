import type { DeveloperProject } from './developerProjectForm';
import type { UnifiedResult } from './propertySearch';
import { developerProjectImages, projectDeal, savedProjectHierarchy } from './developerProjectBoard';
import type { ProjectUnit } from '../../supabase/functions/_shared/projectHierarchy';

export type PartnerProjectRecord = { project: DeveloperProject; unit?: ProjectUnit; result: UnifiedResult };
export function partnerProjectInventory(projects: DeveloperProject[]): PartnerProjectRecord[] {
  return projects.flatMap(project => {
    const base: UnifiedResult = {
      key: `project:${project.id}`, localId: `project:${project.id}`, source: 'mine', sources: ['mine'],
      title: project.name, description: project.description, price: project.price_from,
      city: project.city, address: project.address, neighborhood: project.neighborhood,
      rooms: null, size_sqm: null, photos: developerProjectImages(project), url: null,
      listing_type: projectDeal(project), property_type: 'פרויקט', raw: { ...project, property_title: project.name, deal_type: projectDeal(project) },
      created_at: project.created_at, updated_at: project.updated_at,
    };
    return [{ project, result: base }, ...savedProjectHierarchy(project).apartments.map(unit => {
      const id = `project:${project.id}:unit:${encodeURIComponent(`${unit.building_id ?? ''}:${unit.source_unit_id}`)}`;
      return { project, unit, result: { ...base, key: id, localId: id,
        title: [project.name, unit.building_name ? `בניין ${unit.building_name}` : '', unit.rooms != null ? `${unit.rooms} חדרים` : `יחידה ${unit.source_unit_id}`].filter(Boolean).join(' · '),
        price: unit.price, rooms: unit.rooms, size_sqm: unit.size_sqm,
        photos: unit.images.length ? unit.images : base.photos, property_type: typeof unit.type === 'string' ? unit.type : 'דירה',
        raw: { ...unit, deal_type: base.listing_type, city: project.city, neighborhood: project.neighborhood },
      } };
    })];
  });
}