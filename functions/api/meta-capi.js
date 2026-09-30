/**
 * Cloudflare Pages Function — POST /api/meta-capi
 * Encaminha eventos para a API de Conversões da Meta.
 *
 * Variáveis de ambiente (Cloudflare Pages > Settings > Variables and Secrets):
 *   META_PIXEL_ID          ID do conjunto de dados / Pixel
 *   META_CAPI_TOKEN        Token de acesso da API de Conversões (tipo "Secret")
 *   META_TEST_EVENT_CODE   (opcional) código TEST... para a aba "Testar eventos"
 *   META_API_VERSION       (opcional) padrão v23.0
 */

const ALLOWED_EVENTS = new Set([
  'PageView', 'ViewContent', 'Contact', 'Lead', 'CompleteRegistration',
  'Schedule', 'SubmitApplication', 'InitiateCheckout', 'Purchase', 'Search',
]);

async function sha256(value) {
  if (!value) return undefined;
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const norm = {
  em: (v) => String(v).trim().toLowerCase(),
  fn: (v) => String(v).trim().toLowerCase(),
  ln: (v) => String(v).trim().toLowerCase(),
  ph: (v) => {
    let d = String(v).replace(/\D/g, '');
    if (d.length === 10 || d.length === 11) d = '55' + d; // número BR sem DDI
    return d;
  },
};

export async function onRequestPost({ request, env }) {
  if (!env.META_PIXEL_ID || !env.META_CAPI_TOKEN) {
    return json({ ok: false, error: 'CAPI não configurada' }, 500);
  }

  // Só aceita chamadas do próprio site
  const origin = request.headers.get('Origin') || request.headers.get('Referer') || '';
  const host = new URL(request.url).host;
  if (origin && !origin.includes(host) && !origin.includes('megatechcaxias.com.br')) {
    return json({ ok: false, error: 'origem não permitida' }, 403);
  }

  let body;
  try {
    body = JSON.parse(await request.text());
  } catch {
    return json({ ok: false, error: 'JSON inválido' }, 400);
  }

  const { event_name, event_id, event_source_url, fbp, fbc, custom_data, user = {} } = body || {};
  if (!ALLOWED_EVENTS.has(event_name) || !event_id) {
    return json({ ok: false, error: 'evento inválido' }, 400);
  }

  const user_data = {
    client_ip_address: request.headers.get('CF-Connecting-IP') || undefined,
    client_user_agent: request.headers.get('User-Agent') || undefined,
    fbp: fbp || undefined,
    fbc: fbc || undefined,
    country: [await sha256('br')],
  };
  for (const k of ['em', 'ph', 'fn', 'ln']) {
    if (user[k]) user_data[k] = [await sha256(norm[k](user[k]))];
  }
  const city = request.cf?.city;
  if (city) user_data.ct = [await sha256(city.toLowerCase().replace(/[^a-z]/g, ''))];

  const payload = {
    data: [{
      event_name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: String(event_id).slice(0, 100),
      event_source_url,
      action_source: 'website',
      user_data,
      custom_data: custom_data && typeof custom_data === 'object' ? custom_data : undefined,
    }],
  };
  if (env.META_TEST_EVENT_CODE) payload.test_event_code = env.META_TEST_EVENT_CODE;

  const version = env.META_API_VERSION || 'v23.0';
  const url = `https://graph.facebook.com/${version}/${env.META_PIXEL_ID}/events?access_token=${encodeURIComponent(env.META_CAPI_TOKEN)}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result = await res.json().catch(() => ({}));
  if (!res.ok) console.log('Meta CAPI erro', res.status, JSON.stringify(result));

  return json({ ok: res.ok, events_received: result.events_received }, res.ok ? 200 : 502);
}

export function onRequest() {
  return json({ ok: false, error: 'use POST' }, 405);
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
