import type { DemoType } from '@/pages/demo/demoData';
import { DEMO_TYPES } from '@/pages/demo/demoData';
import avatar from '@/assets/demo-headshots/voter-01.jpg';
import logo from '@/assets/realtyz-logo.png';
import type { PlatformMode } from '@/hooks/usePlatformMode';
import { demoPersona } from './brokerDemoPolicy';

export type DemoRow = Record<string, any>;
export const demoRoles: Record<DemoType, string[]> = {
  broker: ['agent', 'affiliate'], developer: ['developer', 'affiliate'], marketing: ['marketing_company'],
  owner: ['property_owner', 'affiliate'], buyer: ['property_seeker', 'affiliate'], affiliate: ['affiliate'],
};
export const demoId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export const demoOwner = (role: DemoType) => demoId(DEMO_TYPES.findIndex(t => t.id === role) + 1);

/** Entirely invented records. No board, tenant, contact or provider data is fetched. */
export function createPublicWorkspaceData(requestedRole: DemoType, platformMode: PlatformMode = 'full_marketplace') {
  const role = demoPersona(requestedRole, platformMode);
  const owner = demoOwner(role);
  const now = new Date().toISOString();
  const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
  const name = `חשבון הדגמה · ${DEMO_TYPES.find(t => t.id === role)?.label}`;
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', created_at: now, app_metadata: {}, user_metadata: { full_name: name } };
  const workspaces = DEMO_TYPES.map(t => ({ workspace_owner_id: demoOwner(t.id), user_id: owner, role: 'owner', account_type: t.id === 'broker' ? 'broker' : t.id === 'marketing' ? 'marketing_company' : t.id, workspace_name: `חשבון הדגמה · ${t.label}`, workspace_logo_url: logo, owner_full_name: t.label, owner_email: null, owner_phone: null, owner_avatar_url: avatar, is_self: t.id === role, is_office: false, last_accessed_at: now }));
  const profile = { id: owner, full_name: name, email: user.email, phone: null, gender: 'male', avatar_url: avatar, city: 'הרצליה', professional_role: role === 'broker' ? 'broker' : role, user_type: role === 'broker' ? 'broker' : role, broker_license_number: role === 'broker' ? '123456' : null, license_verified: role === 'broker', license_verified_at: role === 'broker' ? now : null, active_workspace_owner_id: owner, signup_completed_at: now, terms_accepted_at: now, partner_terms_accepted_at: now, ai_disclosure_accepted_at: now, marketing_consent: false, bio: 'פרופיל מומצא להדגמת סביבת העבודה', office_name: null, created_at: now };
  const listings = ['הרצליה', 'רמת גן', 'רעננה', 'תל אביב', 'חיפה', 'נתניה'].map((city, i) => ({
    id: demoId(100 + i), workspace_owner_id: owner, user_id: owner, owner_id: owner, slug: `demo-property-${i}`, city, neighborhood: 'שכונת הגנים', street: 'הגנים', street_number: 10 + i, address: `הגנים ${10 + i}, ${city}`, property_title: `דירת ${3 + i % 3} חדרים ב${city}`, title: `דירת ${3 + i % 3} חדרים ב${city}`, description: 'דירה לדוגמה עם חלל אירוח מואר, מרפסת וחניה. כל פרטי הנכס מומצאים.', property_type: 'דירה', deal_type: i === 4 ? 'rent' : 'sale', asking_price: i === 4 ? 6500 : 2450000 + i * 125000, rooms: 3 + i % 3, area_sqm: 90 + i * 12, size_sqm: 90 + i * 12, sqm: 90 + i * 12, floor: i + 1, total_floors: 8, status: 'live', is_public: true, published: true, is_published: true, is_affiliate_enabled: true, enable_form_submission: true, enable_whatsapp_submission: true, enable_call_submission: true, enable_closing_reward: true, lead_form_price: 25, lead_whatsapp_price: 60, lead_call_price: 120, closing_fee: i === 4 ? 20 : 0.5, closing_fee_unit: 'percent', closing_reward: i === 4 ? 1040 : 9800 + i * 500, has_closing_reward: true, publisher_name: name, publisher_type: role === 'developer' ? 'developer' : 'broker', publisher_logo: logo, publisher_logo_url: logo, publisher_avatar_url: avatar, photos: [], images: [], source: 'manual', features: { parking: true, elevator: true, balcony: true, mamad: true }, created_at: now, updated_at: now,
  }));
  const leads = ['נועה לוי', 'איתי כהן', 'מיכל ברק', 'דניאל גפן', 'רוני הדר', 'יעל שחר', 'אלון רז', 'דנה לב'].map((full_name, i) => ({
    id: demoId(200 + i), user_id: owner, workspace_owner_id: owner, full_name, lead_name: full_name, phone: null, email: null, city: listings[i % 6].city, avatar_url: avatar, status: ['new', 'qualified', 'contacted'][i % 3], lead_stage: ['new', 'tour', 'negotiation', 'closed'][i % 4], lead_category: i % 2 ? 'rent' : 'sale', deal_type: i % 2 ? 'rent' : 'sale', lead_kind: i % 2 ? 'renter' : 'buyer', interest_tag: i % 2 ? 'rent' : 'sale', source: 'demo', engagement_score: 70 + i * 3, sentiment: 'positive', preferences: { rooms: 4, budget: 2800000 }, listing_id: listings[i % 6].id, assigned_to: owner, commission_amount: 12000 + i * 1000, created_at: now, updated_at: now, last_contacted_at: now,
  }));
  const messages = leads.flatMap((lead, i) => [
    { id: demoId(300 + i * 2), workspace_owner_id: owner, user_id: owner, lead_id: lead.id, channel: 'whatsapp', platform: 'whatsapp', sender_type: 'lead', content: 'שלום, מחפשים דירת ארבעה חדרים באזור. אפשר לקבל פרטים?', created_at: now, is_read: false, status: 'received' },
    { id: demoId(301 + i * 2), workspace_owner_id: owner, user_id: owner, lead_id: lead.id, channel: 'whatsapp', platform: 'whatsapp', sender_type: 'ai', content: 'אני ריטה. אשמח לבדוק התאמה. מה התקציב והאזור המועדף?', created_at: now, is_read: true, status: 'sent' },
  ]);
  const developers = [0, 1].map(i => ({ id: demoId(400 + i), workspace_owner_id: owner, owner_user_id: owner, name: ['הגנים מגורים · הדגמה', 'פסגות בנייה · הדגמה'][i], company_name: ['הגנים מגורים · הדגמה', 'פסגות בנייה · הדגמה'][i], logo_url: logo, city: 'הרצליה', created_at: now, project_count: 2, unit_count: 8 }));
  const projects = developers.flatMap((d, i) => [0, 1].map(j => ({ id: demoId(410 + i * 2 + j), developer_id: d.id, developer_name: d.name, workspace_owner_id: owner, owner_user_id: owner, title: `פרויקט הגנים ${i * 2 + j + 1}`, name: `פרויקט הגנים ${i * 2 + j + 1}`, city: listings[i + j].city, address: 'רחוב הגנים', description: 'פרויקט מגורים מומצא להדגמה', status: 'draft', is_public: false, photos: [], images: [], apartment_count: 4, created_at: now, apartments: [0, 1, 2, 3].map(k => ({ id: demoId(500 + i * 8 + j * 4 + k), source_unit_id: `demo-unit-${i}-${j}-${k}`, rooms: 3 + k % 3, floor: k + 1, area_sqm: 90 + k * 10, asking_price: 2200000 + k * 180000, price: 2200000 + k * 180000, photos: [], features: { parking: true, elevator: true, balcony: true } })) })));
  const tasks = leads.slice(0, 4).map((lead, i) => ({ id: demoId(600 + i), user_id: owner, workspace_owner_id: owner, lead_id: lead.id, listing_id: listings[i].id, title: ['תיאום ביקור בנכס', 'חזרה לפנייה חדשה', 'בדיקת טיוטת נכס', 'הכנת פרטי עסקה'][i], type: 'task', item_type: 'task', status: 'pending', scheduled_at: future(i + 1), due_at: future(i + 1), start_at: future(i + 1), scheduled_for: future(i + 1), metadata: { title: 'משימה לדוגמה', lead_name: lead.full_name }, created_at: now }));
  const campaigns = [0, 1, 2, 3, 4].map(i => ({ id: demoId(700 + i), user_id: owner, workspace_owner_id: owner, name: `שיווק נכס ב${listings[i].city}`, title: `שיווק נכס ב${listings[i].city}`, content: listings[i].description, channel: 'facebook', platform: 'facebook', status: i === 0 ? 'running' : 'completed', total_targets: 12, total_sent: 12, sent_count: 12, total_clicks: 120 + i * 30, created_at: now, scheduled_at: now }));
  const ledger = [25, 60, 120, 9800, 200].map((amount, i) => ({ id: demoId(800 + i), user_id: owner, workspace_owner_id: owner, amount_ils: amount, amount, type: 'reward', note: ['תגמול טופס לדוגמה', 'תגמול WhatsApp לדוגמה', 'תגמול שיחה לדוגמה', 'תגמול סגירה לדוגמה', 'תגמול שותף לדוגמה'][i], description: 'פעילות מדומה', created_at: now }));
  const groups = [0, 1, 2].map(i => ({ id: demoId(900 + i), workspace_owner_id: owner, user_id: owner, name: ['נדל״ן השרון · הדגמה', 'שותפים במרכז · הדגמה', 'שיווק פרויקטים · הדגמה'][i], title: 'קהילה לדוגמה', member_count: 86 + i * 27, members_count: 86 + i * 27, is_member: true, is_active: true, joined_at: now, created_at: now }));
  const tables: Record<string, DemoRow[]> = {
    profiles: [profile], listings, leads, messages, developers, developer_projects: projects, scheduled_items: tasks, meetings: tasks.slice(0, 2).map(t => ({ ...t, status: 'scheduled', meeting_type: 'tour', scheduled_for: t.scheduled_at, starts_at: t.scheduled_at })), campaigns, campaign_logs: campaigns.map((c, i) => ({ ...c, campaign_id: c.id, listing_id: listings[i].id, action: 'publish', target_name: 'קבוצת נדל״ן · הדגמה', response_data: { likes: 34 + i, views: 620 + i * 100, comments: 2, shares: 5 } })), credit_transactions: ledger,
    onboarding_state: [{ user_id: owner, completed_at: now }], ai_drawer_history: [{ id: demoId(1000), user_id: owner, workspace_owner_id: owner, role: 'assistant', content: 'אני ריטה. אפשר לבדוק התאמת נכסים, להכין פוסט ולסנן פניות בהדגמה.', created_at: now }], chat_history: [], notifications: [{ id: demoId(1001), user_id: owner, workspace_owner_id: owner, title: 'פנייה חדשה לדוגמה', message: 'ריטה מצאה התאמה לנכס', is_read: false, created_at: now }], community_groups: groups, community_members: groups, community_messages: messages.slice(0, 4).map((m, i) => ({ ...m, community_id: groups[0].id, sender_id: owner, sender_name: i % 2 ? 'ריטה' : 'נועה · הדגמה', body: m.content })), social_connections: ['facebook', 'whatsapp_official', 'email'].map((platform, i) => ({ id: demoId(1100 + i), user_id: owner, workspace_owner_id: owner, platform, is_connected: true, display_name: `${platform} · הדגמה`, created_at: now })), interaction_activity_log: tasks.map(t => ({ ...t, action_type: 'tour_scheduled', description: t.title })), campaign_activity_queue: [], white_label_settings: [{ workspace_owner_id: owner, user_id: owner, office_name: 'TORAFF', logo_url: logo, rita_name: 'ריטה' }], listing_favorites: listings.slice(0, 2).map(l => ({ user_id: owner, listing_id: l.id, created_at: now })), payment_methods: [],
  };
  profile.created_at = user.created_at = new Date(Date.now() - 30 * 86400000).toISOString();
  Object.assign(profile, { public_bio: profile.bio, partner_terms_version: 'affiliate-marketing-2026-09' });
  leads.forEach(lead => Object.assign(lead, { lead_category: lead.lead_kind, is_demo: false }));
  tables.campaign_logs.forEach((post, i) => Object.assign(post, { campaign_name: post.name, message_body: `דירת ${listings[i].rooms} חדרים ב${listings[i].city}. נכס מומצא להדגמה בלבד. ריטה מסננת פניות ומתאמת ביקורים.`, status: 'published', is_archived: false, sent_at: now, media_urls: [], group_ids: [demoId(900)], like_count: 34 + i * 5, comment_count: 2, share_count: 5 + i, view_count: 620 + i * 160, provider_response: { listing_id: listings[i].id, simulated: true, comments: [{ id: `demo-comment-${i}`, from: { name: 'נועה · הדגמה' }, message: 'אפשר לקבל פרטים נוספים?' }] } }));
  tables.fb_user_groups = groups.map(g => ({ workspace_owner_id: owner, group_id: g.id, group_name: g.name, group_icon: null, member_count: g.member_count }));
  tables.community_group_messages = messages.slice(0, 4).map((m, i) => ({ ...m, group_id: groups[0].id, sender_id: i % 2 ? owner : leads[0].id, sender_name: i % 2 ? 'ריטה' : 'נועה · הדגמה' }));
  tables.community_chat_messages = messages.slice(0, 4).map((m, i) => ({ ...m, sender_id: i % 2 ? owner : leads[0].id, recipient_id: i % 2 ? leads[0].id : owner }));
  groups.forEach(g => Object.assign(g, { owner_id: owner, description: 'קבוצה מומצאת להדגמה', kind: 'discussion', unread_count: 2 }));
  listings.forEach(listing => Object.assign(listing, {
    price: listing.asking_price, house_number: String(listing.street_number), affiliate_enabled: true,
    contact_options: { form: true, whatsapp: true, phone: true }, reward_types: { form: true, whatsapp: true, phone: true, closing: true },
    affiliate_tier1_amount: 25, affiliate_tier2_amount: 60, affiliate_tier3_amount: 120, affiliate_tier4_amount: listing.closing_reward,
    affiliate_tier4_type: 'fixed', closing_level: 3, reward_levels: { form: 2, whatsapp: 3, phone: 3 },
    attribution: { broker_name: name, office_name: null, agency_logo_url: logo, broker_license_number: role === 'broker' ? '123456' : null, publisher_kind: role === 'developer' ? 'developer' : 'broker' },
  }));
  tables.affiliate_profiles = [{ user_id: owner, workspace_owner_id: owner, license_number: role === 'broker' ? '123456' : null, license_holder_name: name, license_status: role === 'broker' ? 'verified' : 'none', terms_accepted_at: now, terms_version: 'affiliate-marketing-2026-09', rita_auto_mode: true, auto_funnel_enabled: true }];
  tables.broker_license_verifications = role === 'broker' ? [{ user_id: owner, license_number: '123456', registry_holder_name: name }] : [];
  tables.closing_documents = ['sent', 'signed', 'signed'].map((status, i) => ({
    id: demoId(1200 + i), workspace_owner_id: owner, user_id: owner, lead_id: leads[i].id,
    title: ['הסכם סיור לדוגמה', 'הזמנת שירותי תיווך לדוגמה', 'הסכם שכירות לדוגמה'][i], status,
    template_key: 'tour_agreement', signer_name: leads[i].full_name, sign_token: null,
    pdf_path: null, signed_pdf_path: status === 'signed' ? 'demo-only/signed.pdf' : null,
    sent_at: now, viewed_at: now, signed_at: status === 'signed' ? now : null, created_at: now,
    approved_at: i === 2 ? now : null, approval_note: null, fields: { lead_name: leads[i].full_name },
  }));
  tables.credit_wallets = [{ user_id: owner, balance_ils: 310, locked_at: null, frozen: false }];
  tables.property_tours = tasks.slice(0, 2).map((task, i) => ({ ...task, owner_id: owner, id: demoId(1300 + i), client_name: leads[i].full_name, client_phone: '', client_email: null, property_title: listings[i].property_title, property_address: listings[i].address, status: 'pending', notes: 'סיור לדוגמה', whatsapp_sent_at: null }));
  tasks.forEach((task, i) => Object.assign(task.metadata, { lead_id: leads[i].id, listing_id: listings[i].id }));
  tables.interaction_activity_log.push(...['note', 'interaction'].map((action_type, i) => ({ id: demoId(1400 + i), user_id: owner, workspace_owner_id: owner, action_type, platform: 'phone', content: i ? 'סיכום שיחה לדוגמה: הלקוחה מחפשת דירת ארבעה חדרים עם מרפסת.' : 'הערה לדוגמה: להכין פרטים לקראת הביקור בנכס.', metadata: { lead_id: leads[i].id, listing_id: listings[i].id }, created_at: now })));
  if (platformMode === 'brokers_only') {
    ledger.forEach((row, i) => Object.assign(row, { type: 'charge', amount_ils: -[2, 3, 5, 1, 4][i], amount: -[2, 3, 5, 1, 4][i], note: ['קמפיין לדוגמה', 'הודעת וואטסאפ לדוגמה', 'שיחת ריטה לדוגמה', 'הודעת SMS לדוגמה', 'הכנת תוכן לדוגמה'][i] }));
  }
  projects.forEach(p => { Object.assign(p, { price_from: 2200000, available_units: 4, project_stage: 'construction', deal_type: 'sale' }); p.apartments.forEach(unit => Object.assign(unit, { sqm: unit.area_sqm, size_sqm: unit.area_sqm })); });
  return { role, platformMode, owner, name, user, profile, workspaces: platformMode === 'brokers_only' ? workspaces.filter(w => w.is_self) : workspaces, roles: platformMode === 'brokers_only' ? ['agent'] : demoRoles[role], tables, listings, leads, developers, projects, groups, ledger };
}

export type PublicWorkspaceData = ReturnType<typeof createPublicWorkspaceData>;