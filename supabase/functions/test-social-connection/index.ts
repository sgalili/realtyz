// Test connectivity for social/messaging platforms.
// Validates credentials by hitting a lightweight endpoint per platform.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

interface Body {
  platform: string;
  credentials: Record<string, string>;
}

async function testPlatform(p: string, c: Record<string, string>): Promise<{ success: boolean; message: string; state?: string; errorType?: 'AUTH' | 'NETWORK' | 'PENDING' }> {
  try {
    switch (p) {
      case 'whatsapp_green': {
        // Accept multiple field names (UI uses api_token; legacy uses token).
        const instanceIdRaw = (c.instance_id ?? c.idInstance ?? '').toString().trim();
        const tokenRaw = (c.api_token ?? c.token ?? c.apiTokenInstance ?? '').toString().trim();
        if (!instanceIdRaw || !tokenRaw) {
          return { success: false, errorType: 'AUTH', message: 'AUTH: חסרים Instance ID או API Token' };
        }
        if (!/^\d+$/.test(instanceIdRaw)) {
          return { success: false, errorType: 'AUTH', message: 'AUTH: Instance ID חייב להיות מספרי (כמו 1101000123)' };
        }
        if (tokenRaw.length < 20) {
          return { success: false, errorType: 'AUTH', message: 'AUTH: API Token נראה קצר מדי - העתק מחדש מהקונסול של GreenAPI' };
        }

        const url = `https://api.green-api.com/waInstance${instanceIdRaw}/getStateInstance/${tokenRaw}`;
        let r: Response;
        try {
          r = await fetch(url);
        } catch (netErr) {
          return { success: false, errorType: 'NETWORK', message: `NETWORK: לא ניתן להגיע ל-GreenAPI (${(netErr as Error).message || 'שגיאת רשת'})` };
        }

        const bodyText = await r.text();
        let j: any = null;
        try { j = bodyText ? JSON.parse(bodyText) : null; } catch { /* keep raw */ }

        if (r.status === 401 || r.status === 403) {
          return { success: false, errorType: 'AUTH', message: 'AUTH: API Token שגוי או ללא הרשאה - בדוק שהעתקת אותו מ-GreenAPI Console' };
        }
        if (r.status === 404) {
          return { success: false, errorType: 'AUTH', message: 'AUTH: Instance ID לא נמצא - וודא שהמספר נכון ושהמופע פעיל' };
        }
        if (r.status === 429) {
          return { success: false, errorType: 'NETWORK', message: 'NETWORK: יותר מדי בקשות ל-GreenAPI - נסה שוב בעוד דקה' };
        }
        if (!r.ok) {
          return { success: false, errorType: 'NETWORK', message: `NETWORK: GreenAPI החזיר שגיאה ${r.status} ${bodyText.slice(0, 120)}` };
        }

        const state = j?.stateInstance ?? 'unknown';
        if (state === 'authorized') {
          return { success: true, state, message: '🟢 מחובר ישירות ל-WhatsApp (authorized)' };
        }
        if (state === 'notAuthorized') {
          return {
            success: false,
            state,
            errorType: 'PENDING',
            message: 'PENDING: מפתח תקין - ממתין לקישור טלפון. יש לסרוק את קוד ה-QR בלוח הבקרה של GreenAPI',
          };
        }
        if (state === 'starting' || state === 'yellowCard') {
          return { success: false, state, errorType: 'PENDING', message: `PENDING: GreenAPI במצב ${state} - המתן מספר שניות ונסה שוב` };
        }
        if (state === 'blocked') {
          return { success: false, state, errorType: 'AUTH', message: 'AUTH: המופע חסום ב-GreenAPI - פנה לתמיכה שלהם' };
        }
        if (state === 'sleepMode') {
          return { success: false, state, errorType: 'PENDING', message: 'PENDING: המופע במצב שינה - הפעל את המכשיר ונסה שוב' };
        }
        return { success: false, state, message: `מצב לא מוכר: ${state}` };
      }
      case 'whatsapp_wba': {
        if (!c.phone_number_id || !c.access_token) return { success: false, message: 'חסרים Phone Number ID או Access Token' };
        const r = await fetch(`https://graph.facebook.com/v20.0/${c.phone_number_id}`, {
          headers: { Authorization: `Bearer ${c.access_token}` },
        });
        if (!r.ok) return { success: false, message: `WBA שגיאה ${r.status}` };
        const j = await r.json();
        return { success: true, message: `מספר מאומת: ${j.display_phone_number ?? j.id}` };
      }
      case 'telegram': {
        if (!c.bot_token) return { success: false, message: 'חסר Bot Token' };
        const r = await fetch(`https://api.telegram.org/bot${c.bot_token}/getMe`);
        const j = await r.json();
        if (!j.ok) return { success: false, message: j.description ?? 'Telegram לא מאמת' };
        return { success: true, message: `Bot @${j.result.username}` };
      }
      case 'instagram': {
        if (!c.access_token) return { success: false, message: 'חסר Access Token' };
        const r = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${c.access_token}`);
        if (!r.ok) return { success: false, message: `Instagram שגיאה ${r.status}` };
        const j = await r.json();
        return { success: true, message: `מאומת: ${j.name ?? j.id}` };
      }
      case 'facebook': {
        if (!c.page_token) return { success: false, message: 'חסר Page Access Token' };
        const r = await fetch(`https://graph.facebook.com/v20.0/me?access_token=${c.page_token}`);
        if (!r.ok) return { success: false, message: `Facebook שגיאה ${r.status}` };
        const j = await r.json();
        return { success: true, message: `דף: ${j.name ?? j.id}` };
      }
      case 'x': {
        if (!c.access_token) return { success: false, message: 'חסר Access Token' };
        const r = await fetch('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${c.access_token}` },
        });
        if (!r.ok) return { success: false, message: `X שגיאה ${r.status} (יתכן שדרוש OAuth1.0a)` };
        const j = await r.json();
        return { success: true, message: `מאומת: @${j.data?.username ?? '?'}` };
      }
      case 'tiktok': {
        if (!c.access_token) return { success: false, message: 'חסר Access Token' };
        const r = await fetch('https://open.tiktokapis.com/v2/user/info/', {
          headers: { Authorization: `Bearer ${c.access_token}` },
        });
        if (!r.ok) return { success: false, message: `TikTok שגיאה ${r.status}` };
        return { success: true, message: 'TikTok מחובר' };
      }
      case 'youtube': {
        if (!c.api_key) return { success: false, message: 'חסר API Key' };
        const r = await fetch(
          `https://www.googleapis.com/youtube/v3/channels?part=id&mine=true&key=${c.api_key}`,
        );
        // mine=true requires OAuth; fallback: validate key with public endpoint
        if (r.status === 401 || r.status === 403) {
          const r2 = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=test&key=${c.api_key}&maxResults=1`,
          );
          if (!r2.ok) return { success: false, message: `YouTube API Key לא תקף (${r2.status})` };
          return { success: true, message: 'API Key תקף (ללא OAuth)' };
        }
        if (!r.ok) return { success: false, message: `YouTube שגיאה ${r.status}` };
        return { success: true, message: 'YouTube מחובר' };
      }
      default:
        return { success: false, message: `פלטפורמה לא נתמכת: ${p}` };
    }
  } catch (e) {
    return { success: false, message: (e as Error).message || 'שגיאת רשת' };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = (await req.json()) as Body;
    if (!body?.platform || !body?.credentials) {
      return new Response(JSON.stringify({ success: false, message: 'בקשה לא חוקית' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const result = await testPlatform(body.platform, body.credentials);
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ success: false, message: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
