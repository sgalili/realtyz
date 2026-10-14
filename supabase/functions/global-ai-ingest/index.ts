import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { maskPii } from '../_shared/pii.ts';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !key || !anon) throw new Error('Service unavailable');
    const client = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return reply({ error: 'Unauthorized' }, 401);
    const admin = createClient(url, key);
    const { data: allowed, error: roleError } = await admin.rpc('has_role', { _user_id: user.id, _role: 'super_admin' });
    if (roleError || !allowed) return reply({ error: 'Forbidden' }, 403);
    const body = await req.json();
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const path = typeof body.storage_path === 'string' ? body.storage_path : '';
    if (!title || title.length > 300 || !path.startsWith(`${user.id}/`) || path.includes('..')) return reply({ error: 'Invalid document' }, 400);
    const { data: file, error: fileError } = await admin.storage.from('global-ai-training').download(path);
    if (fileError || !file || file.size > 20 * 1024 * 1024) return reply({ error: 'File unavailable or too large' }, 400);
    let text = typeof body.raw_text === 'string' ? body.raw_text.trim() : '';
    if (text.length > 500_000) return reply({ error: 'Document exceeds 500,000 characters' }, 400);
    if (!text) {
      const apiKey = Deno.env.get('LOVABLE_API_KEY');
      if (!apiKey) throw new Error('Media analysis unavailable');
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      const mime = file.type || body.mime_type || 'application/octet-stream';
      const base64 = btoa(binary);
      const prompt = 'Extract this training file in Hebrew, faithfully preserving facts and instructions. Do not invent missing information.';
      if (mime.startsWith('image/') || mime === 'application/pdf') {
        const media = mime === 'application/pdf' ? { type: 'input_file', filename: title, file_data: `data:${mime};base64,${base64}` } : { type: 'input_image', image_url: `data:${mime};base64,${base64}` };
        const res = await fetch('https://ai.gateway.lovable.dev/v1/responses', {
          method: 'POST', signal: req.signal,
          headers: { 'Lovable-API-Key': apiKey, 'X-Lovable-AIG-SDK': 'fetch', 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'openai/gpt-6-astra', stream: true, store: false, reasoning: { effort: 'low', summary: 'auto' }, include: ['reasoning.encrypted_content'],
            input: [{ role: 'user', content: [{ type: 'input_text', text: prompt }, media] }] }),
        });
        if (!res.ok) return reply({ error: 'ניתוח הקובץ אינו זמין כרגע' }, res.status);
        const reader = res.body?.getReader();
        if (!reader) throw new Error('Empty analysis stream');
        let pending = '';
        const decoder = new TextDecoder();
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split('\n'); pending = lines.pop() ?? '';
          for (const line of lines) {
            if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
            const event = JSON.parse(line.slice(6));
            if (event.type === 'response.output_text.delta') text += event.delta;
            if (event.type === 'error' || event.type === 'response.failed' || event.type === 'response.refusal.delta') throw new Error('ניתוח הקובץ לא הושלם');
          }
        }
      } else {
        const format = mime.includes('mp4') ? 'm4a' : mime.includes('mpeg') ? 'mp3' : mime.split('/')[1];
        const media = mime.startsWith('video/') ? { type: 'video_url', video_url: { url: `data:${mime};base64,${base64}` } } : { type: 'input_audio', input_audio: { data: base64, format } };
        const res = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'google/gemini-4-argon', messages: [{ role: 'user', content: [{ type: 'text', text: prompt }, media] }] }),
        });
        if (!res.ok) return reply({ error: 'ניתוח הקובץ אינו זמין כרגע' }, res.status);
        text = (await res.json()).choices?.[0]?.message?.content ?? '';
      }
    }
    const { text: clean } = maskPii(String(text).replace(/\u0000/g, '').trim());
    if (!clean) return reply({ error: 'No readable content found' }, 400);
    const validTypes = ['text', 'pdf', 'image', 'video', 'audio'];
    const sourceType = validTypes.includes(body.source_type) ? body.source_type : 'text';
    const { data, error } = await admin.from('global_ai_documents').insert({ title, raw_text: clean, storage_path: path, source_type: sourceType,
      source_metadata: { mime_type: file.type, size_bytes: file.size }, chunk_count: Math.ceil(clean.length / 1200), created_by: user.id }).select('id').single();
    if (error) throw new Error('Document could not be saved');
    return reply({ success: true, document_id: data.id });
  } catch (error) { return reply({ error: error instanceof Error ? error.message : 'Upload failed' }, 500); }
});
