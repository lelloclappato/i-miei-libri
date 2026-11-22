// "Ponte" per l'accesso a Google che dura a lungo, per le mie app (I miei libri, Abitudini, RVG Coaching, Le Mie Finanze).
//
// Perché serve: un'app che vive solo nel browser riceve da Google un accesso che dura un'ora e non si rinnova da solo.
// Il "permesso lungo" (refresh token) Google lo dà solo a chi ha il client secret, che non può stare nel browser.
// Questo piccolo programma gira su Cloudflare Workers (gratis) e tiene il client secret al posto delle app:
//   1. /scambia  { code }   → l'app ha appena fatto accedere la persona con Google e ha un codice usa e getta:
//                             il ponte lo scambia con Google e restituisce l'accesso di un'ora e il permesso lungo,
//                             CIFRATO (l'app lo conserva così com'è: senza il ponte non serve a niente);
//   2. /rinnova  { chiave } → l'app manda il permesso lungo cifrato e riceve un nuovo accesso di un'ora, senza finestre;
//   3. /revoca   { chiave } → "Scollega": il permesso lungo viene annullato presso Google.
// Il ponte non salva niente: non ha database, non tiene elenchi di persone né di permessi.
//
// Impostazioni del Worker (Cloudflare → il Worker → Impostazioni → Variabili e segreti):
//   GOOGLE_CLIENT_SECRET  (tipo "Segreto")  il client secret del client OAuth "Le mie app". Serve anche a ricavare
//                                            la chiave con cui si cifra il permesso lungo: se un giorno lo cambi,
//                                            le app chiedono semplicemente di accedere di nuovo.

const CLIENT_ID = '494586901323-p0t3hln8h1rjg8jqhh4a9frl0ncap7h3.apps.googleusercontent.com';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOCA = 'https://oauth2.googleapis.com/revoke';
// Solo le mie app possono usarlo (più il computer, per le prove).
const ORIGINI = [/^https:\/\/lelloclappato\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];

const consentita = o => !!o && ORIGINI.some(r => r.test(o));
function risposta(corpo, stato, origine) {
  const h = { 'content-type': 'application/json;charset=UTF-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (consentita(origine)) {
    h['access-control-allow-origin'] = origine;
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-max-age'] = '86400';
  }
  return new Response(JSON.stringify(corpo), { status: stato, headers: h });
}

// ---------- cifratura del permesso lungo (AES-GCM, chiave ricavata dal client secret) ----------
const testo = new TextEncoder(), daTesto = new TextDecoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const daB64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function chiaveDa(segreto) {
  const base = await crypto.subtle.importKey('raw', testo.encode(segreto), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: testo.encode('lelloclappato-accesso-google'), info: testo.encode('permesso-lungo-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function cifra(segreto, valore) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dati = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chiaveDa(segreto), testo.encode(valore));
  return 'v1.' + b64(iv) + '.' + b64(dati);
}
export async function decifra(segreto, chiave) {
  const [v, iv, dati] = String(chiave || '').split('.');
  if (v !== 'v1' || !iv || !dati) return null;
  try { return daTesto.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: daB64(iv) }, await chiaveDa(segreto), daB64(dati))); }
  catch (e) { return null; }
}

// ---------- Google ----------
async function chiediToken(parametri, env) {
  const r = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...parametri })
  });
  let j = {};
  try { j = await r.json(); } catch (e) {}
  return { ok: r.ok, j };
}

export default {
  async fetch(req, env) {
    const origine = req.headers.get('origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: consentita(origine) ? 204 : 403, headers: consentita(origine) ? {
      'access-control-allow-origin': origine, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' } : {} });
    if (!consentita(origine)) return risposta({ errore: 'origine' }, 403, origine);
    if (req.method !== 'POST') return risposta({ errore: 'metodo' }, 405, origine);
    if (!env.GOOGLE_CLIENT_SECRET) return risposta({ errore: 'non-configurato' }, 503, origine);
    const percorso = new URL(req.url).pathname;
    let corpo = {};
    try { corpo = await req.json(); } catch (e) { return risposta({ errore: 'richiesta' }, 400, origine); }

    if (percorso === '/scambia') {
      const code = String(corpo.code || '');
      if (!code || code.length > 2000) return risposta({ errore: 'richiesta' }, 400, origine);
      // con il flusso "popup" di Google Identity Services l'indirizzo di ritorno è sempre "postmessage"
      const { ok, j } = await chiediToken({ code, grant_type: 'authorization_code', redirect_uri: 'postmessage' }, env);
      if (!ok || !j.access_token) return risposta({ errore: 'google', dettaglio: j.error || '' }, 400, origine);
      return risposta({
        access_token: j.access_token, expires_in: j.expires_in, scope: j.scope || '',
        chiave: j.refresh_token ? await cifra(env.GOOGLE_CLIENT_SECRET, j.refresh_token) : null
      }, 200, origine);
    }

    if (percorso === '/rinnova' || percorso === '/revoca') {
      const refresh = await decifra(env.GOOGLE_CLIENT_SECRET, corpo.chiave);
      if (!refresh) return risposta({ errore: 'chiave' }, 401, origine);
      if (percorso === '/revoca') {
        await fetch(REVOCA, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }) }).catch(() => {});
        return risposta({ ok: true }, 200, origine);
      }
      const { ok, j } = await chiediToken({ refresh_token: refresh, grant_type: 'refresh_token' }, env);
      // invalid_grant = permesso revocato o scaduto: l'app deve far accedere di nuovo
      if (!ok || !j.access_token) return risposta({ errore: j.error === 'invalid_grant' ? 'revocato' : 'google', dettaglio: j.error || '' }, j.error === 'invalid_grant' ? 401 : 502, origine);
      return risposta({ access_token: j.access_token, expires_in: j.expires_in, scope: j.scope || '' }, 200, origine);
    }

    return risposta({ errore: 'percorso' }, 404, origine);
  }
};
