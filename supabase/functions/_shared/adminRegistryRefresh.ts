import { assertRegistryNameTarget, fetchRegistryName, RegistryNameError } from './brokerRegistryNameLookup.ts';
export async function refreshAdminRegistryName(admin: any, userId: string, license: string, actor: string, batch?: { id: string; token: string }) {
    const { data: profile, error: profileError } = await admin.from('profiles').select('id,full_name,city,broker_license_number,locked_broker_name').eq('id', userId).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) throw new RegistryNameError('profile_not_found', 'הפרופיל המבוקש לא נמצא', 404);
    const {data: imported,error: importedError} = await admin.from('admin_broker_onboarding').select('imported_license_number').eq('user_id',userId).maybeSingle();
    if(importedError)throw importedError;
    const target = {...profile, imported_license_number:imported?.imported_license_number};
    assertRegistryNameTarget(target, license);
    // Never borrow a license already attached to another account, including silent imports.
    for(const [table,column] of [['profiles','broker_license_number'],['admin_broker_onboarding','imported_license_number'],['admin_approved_broker_licenses','license_number'],['broker_license_verifications','license_number']]) {
      const ownerColumn=table==='profiles'?'id':'user_id';
      const {data: owners,error: ownerError}=await admin.from(table).select(ownerColumn).eq(column,license).neq(ownerColumn,userId).limit(1);
      if(ownerError)throw ownerError;
      if(owners?.length)throw new RegistryNameError('license_owned','מספר הרישיון כבר משויך לחשבון אחר. לא שונו פרטי החשבון.',409);
    }
    const {data: previous, error: previousError} = await admin.from('broker_registry_no_matches').select('license_number').eq('broker_id',userId).eq('license_number',license).maybeSingle();
    if(previousError)throw previousError;
    if(previous)throw new RegistryNameError('license_not_found','מספר הרישיון נבדק ולא נמצא במאגר הלאומי',404);
    let registry;
    try { registry = await fetchRegistryName(license); }
    catch(error) {
      if(error instanceof RegistryNameError && error.code==='license_not_found') {
        const saved = await admin.rpc('save_admin_registry_no_match',{_actor:actor,_user:userId,_license:license,_batch:batch?.id??null,_token:batch?.token??null});
        if(saved.error || saved.data!==true)throw new RegistryNameError('save_failed','לא ניתן לשמור את תוצאת הבדיקה כרגע',503);
      }
      throw error;
    }
    assertRegistryNameTarget(target, license, registry.fullName);

    const { data: saved, error } = await admin.rpc('save_admin_registry_match', { _actor: actor, _user: userId, _license: license, _raw_name: registry.rawName, _display_name: registry.fullName, _city: registry.city, _source: registry.source, _source_updated: registry.updatedAt, _batch: batch?.id ?? null, _token: batch?.token ?? null });
    if (error || !saved || saved.id !== userId || saved.broker_license_number !== license || saved.full_name !== registry.fullName) {
      const reason = new RegistryNameError(error?.code === '40001' ? 'target_changed' : 'save_failed', 'לא ניתן לשמור את האימות כרגע. פרטי החשבון לא הוחלפו.', error?.code === '40001' ? 409 : 503);
      throw Object.assign(reason, { cause: error });
    }
    return { profile: saved, registry: { full_name: registry.fullName, city: registry.city, license_number: license }, message: 'השם המלא נשלף בהצלחה מהמאגר הממשלתי' };
}
