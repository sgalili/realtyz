import type { DemoType } from '@/pages/demo/demoData';
import { DEMO_TYPES } from '@/pages/demo/demoData';
import logo from '@/assets/realtyz-logo.png';
import type { PlatformMode } from '@/hooks/usePlatformMode';
import { demoPersona } from './brokerDemoPolicy';
import { demoPropertyPhotos } from './demoPropertyPhotos';
import { demoPersonas, demoContactIdentities } from './demoIdentities';
import { demoPropertySnapshots } from './demoPropertySnapshots';

export type DemoRow = Record<string, any>;
export const demoRoles: Record<DemoType, string[]> = {
  broker: ['agent', 'affiliate'], developer: ['developer', 'affiliate'], marketing: ['marketing_company'],
  owner: ['property_owner', 'affiliate'], buyer: ['property_seeker', 'affiliate'], affiliate: ['affiliate'],
};
export const demoId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
export const demoOwner = (role: DemoType) => demoId(DEMO_TYPES.findIndex(t => t.id === role) + 1);

/** Isolated identities/activity and static public property facts; no runtime tenant reads. */
export function createPublicWorkspaceData(requestedRole: DemoType, platformMode: PlatformMode = 'full_marketplace') {
  const role = demoPersona(requestedRole, platformMode);
  const owner = demoOwner(role);
  const now = new Date().toISOString();
  const future = (hours: number) => new Date(Date.now() + hours * 3600000).toISOString();
  const persona = demoPersonas[role];
  const name = persona.name;
  const avatar = persona.avatar;
  const mediaOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'demo@example.invalid', created_at: now, app_metadata: {}, user_metadata: { full_name: name } };
  const workspaces = DEMO_TYPES.map(t => ({ workspace_owner_id: demoOwner(t.id), user_id: owner, role: 'owner', account_type: t.id === 'broker' ? 'broker' : t.id === 'marketing' ? 'marketing_company' : t.id, workspace_name: demoPersonas[t.id].office || demoPersonas[t.id].name, workspace_logo_url: logo, owner_full_name: demoPersonas[t.id].name, owner_email: null, owner_phone: demoPersonas[t.id].phone, owner_avatar_url: demoPersonas[t.id].avatar, is_self: t.id === role, is_office: !!demoPersonas[t.id].office, last_accessed_at: now }));
  const profile = { id: owner, full_name: name, email: user.email, phone: persona.phone, gender: persona.gender, avatar_url: avatar, city: 'הרצליה', professional_role: role === 'broker' ? 'broker' : role, user_type: role === 'broker' ? 'broker' : role, broker_license_number: role === 'broker' ? '123456' : null, license_verified: role === 'broker', license_verified_at: role === 'broker' ? now : null, active_workspace_owner_id: owner, signup_completed_at: now, terms_accepted_at: now, partner_terms_accepted_at: now, ai_disclosure_accepted_at: now, marketing_consent: false, bio: 'פרופיל מומצא להדגמת סביבת העבודה', office_name: persona.office, created_at: now };
  const listings = demoPropertySnapshots.map((snapshot, i) => ({
    id: demoId(100 + i), workspace_owner_id: owner, user_id: owner, owner_id: owner, slug: `demo-property-${i}`,
    city: snapshot.city, neighborhood: '', street: snapshot.address, street_number: null, address: snapshot.address,
    property_title: `${snapshot.features.property_type} ${snapshot.rooms} חדרים ב${snapshot.city}`, title: `${snapshot.features.property_type} ${snapshot.rooms} חדרים ב${snapshot.city}`,
    description: snapshot.description, property_type: snapshot.features.property_type, deal_type: snapshot.deal_type,
    asking_price: snapshot.price, rooms: snapshot.rooms, area_sqm: snapshot.sqm, size_sqm: snapshot.sqm, sqm: snapshot.sqm,
    floor: snapshot.floor, total_floors: snapshot.features.total_floors, status: 'live', is_public: true, published: true, is_published: true,
    is_affiliate_enabled: true, enable_form_submission: true, enable_whatsapp_submission: true, enable_call_submission: true, enable_closing_reward: true,
    lead_form_price: 25, lead_whatsapp_price: 60, lead_call_price: 120, closing_fee: 0.5, closing_fee_unit: 'percent', closing_reward: 9800 + i * 500,
    has_closing_reward: true, publisher_name: name, publisher_type: role === 'developer' ? 'developer' : 'broker', publisher_logo: logo,
    publisher_logo_url: logo, publisher_avatar_url: avatar, photos: snapshot.photos.map(url => `${mediaOrigin}${url}`), images: snapshot.photos.map(url => `${mediaOrigin}${url}`), source: 'manual',
    features: snapshot.features, created_at: now, updated_at: now,
  }));
  const leads = demoContactIdentities.map((contact, i) => ({
    id: demoId(200 + i), user_id: owner, workspace_owner_id: owner, full_name: contact.name, lead_name: contact.name, gender: contact.gender,
    phone: contact.phone, phone_number: contact.phone, email: null, city: listings[i % listings.length]?.city ?? '', avatar_url: contact.avatar,
    status: ['new', 'qualified', 'contacted'][i % 3], lead_stage: ['new', 'tour', 'negotiation', 'closed'][i % 4],
    lead_category: i % 2 ? 'rent' : 'sale', deal_type: i % 2 ? 'rent' : 'sale', lead_kind: i % 2 ? 'renter' : 'buyer', interest_tag: i % 2 ? 'rent' : 'sale',
    source: 'demo', engagement_score: 70 + i * 3, sentiment: 'positive', preferences: { rooms: 4, budget: 2800000 },
    listing_id: listings[i % listings.length]?.id, assigned_to: owner, commission_amount: 12000 + i * 1000,
    created_at: now, updated_at: now, last_contacted_at: now,
  }));
  const messages = leads.flatMap((lead, i) => [
    { id: demoId(300 + i * 2), workspace_owner_id: owner, user_id: owner, lead_id: lead.id, channel: 'whatsapp', platform: 'whatsapp', sender_type: 'lead', content: 'שלום, מחפשים דירת ארבעה חדרים באזור. אפשר לקבל פרטים?', created_at: now, is_read: false, status: 'received' },
    { id: demoId(301 + i * 2), workspace_owner_id: owner, user_id: owner, lead_id: lead.id, channel: 'whatsapp', platform: 'whatsapp', sender_type: 'ai', content: 'אני ריטה. אשמח לבדוק התאמה. מה התקציב והאזור המועדף?', created_at: now, is_read: true, status: 'sent' },
  ]);
  const developers = [0, 1].map(i => ({ id: demoId(400 + i), workspace_owner_id: owner, owner_user_id: owner, name: ['הגנים מגורים · הדגמה', 'פסגות בנייה · הדגמה'][i], company_name: ['הגנים מגורים · הדגמה', 'פסגות בנייה · הדגמה'][i], logo_url: logo, city: 'הרצליה', created_at: now, project_count: 2, unit_count: 8 }));
  const projects = developers.flatMap((d, i) => [0, 1].map(j => ({ id: demoId(410 + i * 2 + j), developer_id: d.id, developer_name: d.name, workspace_owner_id: owner, owner_user_id: owner, title: `פרויקט הגנים ${i * 2 + j + 1}`, name: `פרויקט הגנים ${i * 2 + j + 1}`, city: listings[i + j].city, address: 'רחוב הגנים', description: 'פרויקט מגורים מומצא להדגמה', status: 'draft', is_public: false, photos: [], images: [], apartment_count: 4, created_at: now, apartments: [0, 1, 2, 3].map(k => ({ id: demoId(500 + i * 8 + j * 4 + k), source_unit_id: `demo-unit-${i}-${j}-${k}`, rooms: 3 + k % 3, floor: k + 1, area_sqm: 90 + k * 10, asking_price: 2200000 + k * 180000, price: 2200000 + k * 180000, photos: [], features: { parking: true, elevator: true, balcony: true } })) })));
  const tasks = leads.slice(0, 4).map((lead, i) => ({ id: demoId(600 + i), user_id: owner, workspace_owner_id: owner, lead_id: lead.id, listing_id: listings[i].id, title: ['תיאום ביקור בנכס', 'חזרה לפנייה חדשה', 'בדיקת טיוטת נכס', 'הכנת פרטי עסקה'][i], type: 'task', item_type: 'task', status: 'pending', scheduled_at: future(i + 1), due_at: future(i + 1), start_at: future(i + 1), scheduled_for: future(i + 1), metadata: { title: 'משימה לדוגמה', lead_name: lead.full_name }, created_at: now }));
  const campaigns = [0, 1, 2, 3, 4].map(i => ({ id: demoId(700 + i), user_id: owner, workspace_owner_id: owner, name: `שיווק נכס ב${listings[i].address}`, title: `שיווק נכס ב${listings[i].address}`, content: listings[i].description, channel: 'facebook', platform: 'facebook', status: i === 0 ? 'running' : 'completed', total_targets: 12, total_sent: 12, sent_count: 12, total_clicks: 120 + i * 30, created_at: now, scheduled_at: now }));
  const ledger: DemoRow[] = [25, 60, 120, 9800, 200].map((amount, i) => ({ id: demoId(800 + i), user_id: owner, workspace_owner_id: owner, amount_ils: amount, amount, type: 'reward', note: ['תגמול טופס לדוגמה', 'תגמול WhatsApp לדוגמה', 'תגמול שיחה לדוגמה', 'תגמול סגירה לדוגמה', 'תגמול שותף לדוגמה'][i], description: 'פעילות מדומה', created_at: now }));
  const groups = [0, 1, 2].map(i => ({ id: demoId(900 + i), workspace_owner_id: owner, user_id: owner, name: ['נדל״ן השרון · הדגמה', 'שותפים במרכז · הדגמה', 'שיווק פרויקטים · הדגמה'][i], title: 'קהילה לדוגמה', member_count: 86 + i * 27, members_count: 86 + i * 27, is_member: true, is_active: true, joined_at: now, created_at: now }));
  const tables: Record<string, DemoRow[]> = {
    profiles: [profile], listings, leads, messages, developers, developer_projects: projects, scheduled_items: tasks, meetings: tasks.slice(0, 2).map(t => ({ ...t, status: 'scheduled', meeting_type: 'tour', scheduled_for: t.scheduled_at, starts_at: t.scheduled_at })), campaigns, campaign_logs: campaigns.map((c, i) => ({ ...c, campaign_id: c.id, listing_id: listings[i].id, action: 'publish', target_name: 'קבוצת נדל״ן · הדגמה', response_data: { likes: 34 + i, views: 620 + i * 100, comments: 2, shares: 5 } })), credit_transactions: ledger,
    onboarding_state: [{ user_id: owner, completed_at: now }], ai_drawer_history: [{ id: demoId(1000), user_id: owner, workspace_owner_id: owner, role: 'assistant', content: 'אני ריטה. אפשר לבדוק התאמת נכסים, להכין פוסט ולסנן פניות בהדגמה.', created_at: now }], chat_history: [], notifications: [{ id: demoId(1001), user_id: owner, workspace_owner_id: owner, title: 'פנייה חדשה לדוגמה', message: 'ריטה מצאה התאמה לנכס', is_read: false, created_at: now }], community_groups: groups, community_members: groups, community_messages: messages.slice(0, 4).map((m, i) => ({ ...m, community_id: groups[0].id, sender_id: owner, sender_name: i % 2 ? 'ריטה' : 'נועה · הדגמה', body: m.content })), social_connections: ['facebook', 'whatsapp_official', 'email'].map((platform, i) => ({ id: demoId(1100 + i), user_id: owner, workspace_owner_id: owner, platform, is_connected: true, display_name: `${platform} · הדגמה`, created_at: now })), interaction_activity_log: tasks.map(t => ({ ...t, action_type: 'tour_scheduled', description: t.title })), campaign_activity_queue: [], white_label_settings: [{ workspace_owner_id: owner, user_id: owner, office_name: persona.office, agency_name: persona.office, logo_url: logo, logo_square_url: logo, rita_name: 'ריטה' }], listing_favorites: listings.slice(0, 2).map(l => ({ user_id: owner, listing_id: l.id, created_at: now })), payment_methods: [],
  };
  profile.created_at = user.created_at = new Date(Date.now() - 30 * 86400000).toISOString();
  Object.assign(profile, { public_bio: profile.bio, partner_terms_version: 'affiliate-marketing-2026-09' });
  leads.forEach(lead => Object.assign(lead, { lead_category: lead.lead_kind, is_demo: false, ai_autopilot: true, profile_picture_url: lead.avatar_url, last_interaction_at: now }));
  messages.forEach((message, i) => Object.assign(message, { direction: i % 2 ? 'outbound' : 'inbound', created_at: new Date(Date.now() - (messages.length - i) * 60000).toISOString() }));
  tables.platform_settings = [{ user_id: owner, workspace_owner_id: owner, enable_ai_autopilot: true, ai_paused: false }];
  tables.rotating_messages = ['ריטה מסננת פניות בזמן שאתם מתמקדים בלקוחות', 'הנכסים, השיחות והמשימות במקום אחד', 'נרשמים ומתחילים לנהל את המשרד עם ריטה'].map((message_text,i) => ({ id: demoId(1500+i), role_key: 'guest', message_text, action_path: '/auth', sort_order: i, is_active: true }));
  listings.forEach((listing,i) => Object.assign(listing, { media_photos: listing.photos, image_url: listing.photos[0] }));
  tables.campaign_logs.forEach((post,i) => Object.assign(post, { media_urls: listings[i]?.photos ?? demoPropertyPhotos(i), target_count: 12, published_count: 12, total_targets: 12, total_sent: 12 }));
  tables.campaign_logs.forEach((post, i) => Object.assign(post, { campaign_name: post.name, message_body: `${listings[i].property_type} ${listings[i].rooms} חדרים ברחוב ${listings[i].address}, ${listings[i].city}. הפרסום והפעילות הם להדגמה בלבד. ריטה מסננת פניות ומתאמת ביקורים.`, status: 'published', is_archived: false, sent_at: now, media_urls: listings[i]?.photos ?? demoPropertyPhotos(i), group_ids: [demoId(900)], like_count: 34 + i * 5, comment_count: 2, share_count: 5 + i, view_count: 620 + i * 160, provider_response: { listing_id: listings[i].id, simulated: true, group_results: [{ group_id: demoId(900), ok: true, state: 'published' }], comments: [{ id: `demo-comment-${i}`, from: { name: 'נועה · הדגמה' }, message: 'אפשר לקבל פרטים נוספים?' }] } }));
  const demoThreads = [
    ['מאיה לוי', 'מה המחיר הסופי? יש גמישות?', 'היי מאיה, המחיר המבוקש מופיע בפוסט ויש מקום לשיחה עם הבעלים. אשמח לשלוח לך פרטים מלאים בהודעה פרטית.'],
    ['יוסי כהן', 'יש חניה ומרפסת?', 'היי יוסי, כן. בנכס יש חניה צמודה ומרפסת שמש. רוצה שאשלח תמונות נוספות?'],
    ['רונית אברהם', 'הנכס עדיין זמין?', 'היי רונית, הנכס זמין כרגע. אפשר לתאם ביקור כבר השבוע.'],
    ['דניאל מזרחי', 'אפשר לקבוע סיור ביום חמישי?', 'בשמחה דניאל. שלחתי לך הודעה פרטית עם שעות פנויות ליום חמישי.'],
  ];
  tables.campaign_logs.forEach((post, i) => { const postId = `demo-post-${i}`; post.provider_message_id = postId; Object.assign(post.provider_response as Record<string, unknown>, { postIds: [postId] }); post.comment_count = 3 + (i % 2); });
  tables.engagement_events = tables.campaign_logs.flatMap((post, i) => demoThreads.slice(0, 3 + (i % 2)).map(([name, text, reply], j) => ({ id: `demo-eng-${i}-${j}`, user_id: owner, workspace_owner_id: owner, platform: 'facebook', sender_handle: name, inbound_text: text, ai_reply_text: reply, status: 'replied', sentiment: 'positive', external_id: `demo-c-${i}-${j}`, external_post_id: `demo-post-${i}`, metadata: { from_name: name, simulated: true }, created_at: new Date(Date.now() - (5 - j) * 600000).toISOString(), is_archived: false })));
  tables.campaign_activity_queue = tables.campaign_logs.flatMap(post => groups.map((group,i) => ({ id: `${post.id}:job:${i}`, user_id: owner, workspace_owner_id: owner, status: i === 2 ? 'processing' : 'completed', publication_status: i === 2 ? 'publishing' : 'published', last_error: null, scheduled_for: now, 'payload->>campaign_log_id': post.id, payload: { campaign_log_id: post.id }, group_url: `https://facebook.com/groups/demo-${i}`, group_name: group.name })));
  tables.fb_user_groups = groups.map(g => ({ workspace_owner_id: owner, group_id: g.id, group_name: g.name, group_icon: null, member_count: g.member_count }));
  tables.community_group_messages = messages.slice(0, 4).map((m, i) => ({ ...m, group_id: groups[0].id, sender_id: i % 2 ? owner : leads[0].id, sender_name: i % 2 ? 'ריטה' : 'נועה · הדגמה' }));
  tables.community_chat_messages = messages.slice(0, 4).map((m, i) => ({ ...m, sender_id: i % 2 ? owner : leads[0].id, recipient_id: i % 2 ? leads[0].id : owner }));
  groups.forEach(g => Object.assign(g, { owner_id: owner, description: 'קבוצה מומצאת להדגמה', kind: 'discussion', unread_count: 2 }));
  listings.forEach(listing => Object.assign(listing, {
    price: listing.asking_price, house_number: '', affiliate_enabled: true,
    contact_options: { form: true, whatsapp: true, phone: true }, reward_types: { form: true, whatsapp: true, phone: true, closing: true },
    affiliate_tier1_amount: 25, affiliate_tier2_amount: 60, affiliate_tier3_amount: 120, affiliate_tier4_amount: listing.closing_reward,
    affiliate_tier4_type: 'fixed', closing_level: 3, reward_levels: { form: 2, whatsapp: 3, phone: 3 },
    attribution: { broker_name: name, office_name: persona.office, agency_logo_url: logo, broker_license_number: role === 'broker' ? '123456' : null, publisher_kind: role === 'developer' ? 'developer' : 'broker' },
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
  tables.property_tours = tasks.slice(0, 2).map((task, i) => ({ ...task, owner_id: owner, id: demoId(1300 + i), client_name: leads[i].full_name, client_phone: leads[i].phone, client_email: null, property_title: listings[i].property_title, property_address: listings[i].address, status: 'pending', notes: 'סיור לדוגמה', whatsapp_sent_at: null }));
  tasks.forEach((task, i) => Object.assign(task.metadata, { lead_id: leads[i].id, listing_id: listings[i].id }));
  tables.interaction_activity_log.push(...['note', 'interaction'].map((action_type, i) => ({ id: demoId(1400 + i), user_id: owner, workspace_owner_id: owner, action_type, platform: 'phone', content: i ? 'סיכום שיחה לדוגמה: הלקוחה מחפשת דירת ארבעה חדרים עם מרפסת.' : 'הערה לדוגמה: להכין פרטים לקראת הביקור בנכס.', metadata: { lead_id: leads[i].id, listing_id: listings[i].id }, created_at: now })));
  if (platformMode === 'brokers_only') {
    ledger.forEach((row, i) => Object.assign(row, { type: 'charge', amount_ils: -[2, 3, 5, 1, 4][i], amount: -[2, 3, 5, 1, 4][i], note: ['קמפיין לדוגמה', 'הודעת וואטסאפ לדוגמה', 'שיחת ריטה לדוגמה', 'הודעת SMS לדוגמה', 'הכנת תוכן לדוגמה'][i] }));
  }
  Object.assign(ledger[0] ?? {}, { type: 'action_charge', amount_ils: -4.25, amount: -17, note: 'social_post|5|קמפיין נכסים', campaign_breakdown: { posts_created: 5, groups_published: 12 }, listing_title: 'קמפיין נכסים שהושלם', reference_id: demoId(700), created_at: new Date(Date.now() - 2 * 86400000).toISOString() });
  ledger.push(...[100, 200, 50].map((amount_ils, i) => ({ id: demoId(1600+i), user_id: owner, workspace_owner_id: owner, amount_ils, amount: amount_ils*4, type: 'topup', note: 'הפקדה בכרטיס אשראי · הדגמה', reference_id: null, created_at: new Date(Date.now() - (20-i*6)*86400000).toISOString() })));
  const balance = ledger.reduce((sum,row) => sum + Number(row.amount_ils), 0);
  tables.credit_wallets = [{ user_id: owner, balance_ils: balance, locked_at: null, frozen: false }];
  projects.forEach((p,i) => { Object.assign(p, { photos: demoPropertyPhotos(i), images: demoPropertyPhotos(i), price_from: 2200000, available_units: 4, project_stage: 'construction', deal_type: 'sale' }); p.apartments.forEach((unit,j) => Object.assign(unit, { photos: demoPropertyPhotos(i+j), sqm: unit.area_sqm, size_sqm: unit.area_sqm })); });
  return { role, platformMode, owner, name, user, profile, workspaces: platformMode === 'brokers_only' ? workspaces.filter(w => w.is_self) : workspaces, roles: platformMode === 'brokers_only' ? ['agent'] : demoRoles[role], tables, listings, leads, developers, projects, groups, ledger };
}

export type PublicWorkspaceData = ReturnType<typeof createPublicWorkspaceData>;