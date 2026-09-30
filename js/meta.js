/* MEGATECH — Meta Pixel + API de Conversões (deduplicado por event_id)
 * Browser: Pixel (fbq)  |  Servidor: /api/meta-capi (Cloudflare Pages Function)
 */
(function () {
  var PIXEL_ID = '2123883364879671'; // <- ID do conjunto de dados (Gerenciador de Eventos)
  var CAPI_ENDPOINT = '/api/meta-capi';

  // ---- Pixel base code ----
  !function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () {
      n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments)
    };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
    n.queue = []; t = b.createElement(e); t.async = !0;
    t.src = v; s = b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t, s)
  }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', PIXEL_ID);

  // ---- helpers ----
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }
  function getCookie(name) {
    var m = document.cookie.match('(?:^|; )' + name + '=([^;]*)');
    return m ? decodeURIComponent(m[1]) : undefined;
  }
  // _fbc: usa fbclid da URL se o cookie ainda não existir
  function getFbc() {
    var c = getCookie('_fbc');
    if (c) return c;
    var id = new URLSearchParams(location.search).get('fbclid');
    return id ? 'fb.1.' + Date.now() + '.' + id : undefined;
  }

  function sendServer(payload) {
    var body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon &&
          navigator.sendBeacon(CAPI_ENDPOINT, new Blob([body], { type: 'text/plain' }))) return;
    } catch (e) {}
    fetch(CAPI_ENDPOINT, { method: 'POST', body: body, keepalive: true,
      headers: { 'Content-Type': 'text/plain' } }).catch(function () {});
  }

  /**
   * Dispara o evento no Pixel e na API de Conversões com o mesmo event_id.
   * @param {string} name   PageView, Contact, Lead...
   * @param {object} data   custom_data (opcional)
   * @param {object} user   dados do usuário em texto puro (em, ph, fn, ln) — hash feito no servidor
   */
  function track(name, data, user) {
    var eventId = uuid();
    fbq('track', name, data || {}, { eventID: eventId });
    // pequeno atraso para o Pixel gravar _fbp/_fbc antes de lermos os cookies
    setTimeout(function () {
      sendServer({
        event_name: name,
        event_id: eventId,
        event_source_url: location.href,
        fbp: getCookie('_fbp'),
        fbc: getFbc(),
        custom_data: data || {},
        user: user || {}
      });
    }, 300);
  }
  window.megaTrack = track;

  // ---- PageView ----
  track('PageView');

  // ---- Cliques em WhatsApp / telefone => Contact ----
  document.addEventListener('click', function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    var canal = /wa\.me|api\.whatsapp\.com|whatsapp:/i.test(href) ? 'whatsapp'
              : /^tel:/i.test(href) ? 'telefone' : null;
    if (!canal) return;
    track('Contact', { content_category: canal, content_name: document.title });
    // Conversão Google Ads (tag já existente no site)
    if (typeof gtag === 'function' && canal === 'whatsapp') {
      gtag('event', 'ads_conversion_Contato_1');
    }
  }, true);
})();
