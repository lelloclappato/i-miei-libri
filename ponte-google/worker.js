// "Ponte" per l'accesso a Google che dura a lungo, per le mie app (I miei libri, Abitudini, RVG Coaching, Le Mie Finanze).
//
// Perché serve: un'app che vive solo nel browser riceve da Google un accesso che dura un'ora e non si rinnova da solo.
// Il "permesso lungo" (refresh token) Google lo dà solo a chi ha il client secret, che non può stare nel browser.
// Questo piccolo programma gira su Cloudflare Workers (gratis) e tiene il client secret al posto delle app.
//
//   GET  /accedi?torna=<indirizzo dell'app>  → manda alla pagina di accesso di Google (chiedendo il permesso lungo)
//   GET  /ritorno?code=…&state=…             → Google torna qui: il ponte scambia il codice e rimanda all'app,
//                                              con l'accesso di un'ora e il permesso lungo CIFRATO dopo il "#"
//                                              (la parte dell'indirizzo che non arriva a nessun server)
//   POST /rinnova { chiave }                 → nuovo accesso di un'ora dal permesso lungo cifrato, senza finestre
//   POST /revoca  { chiave }                 → "Scollega": il permesso lungo viene annullato presso Google
//
// Il ponte non salva niente: niente database, niente elenchi di persone o di permessi. Il permesso lungo resta
// solo sul dispositivo, cifrato con una chiave che sta solo qui: preso da solo non serve a niente.
//
// Impostazioni del Worker (Cloudflare → il Worker → Impostazioni → Variabili e segreti):
//   GOOGLE_CLIENT_SECRET  (tipo "Segreto")  il client secret del client OAuth "Le mie app". Da lui si ricavano anche
//                                            le chiavi per cifrare e firmare: se un giorno lo cambi, le app chiedono
//                                            semplicemente di accedere di nuovo.
// Nella Google Cloud Console, nel client "Le mie app", tra gli "URI di reindirizzamento autorizzati" deve esserci
//   https://<indirizzo di questo Worker>/ritorno

const CLIENT_ID = '494586901323-p0t3hln8h1rjg8jqhh4a9frl0ncap7h3.apps.googleusercontent.com';
const AUTORIZZA = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOCA = 'https://oauth2.googleapis.com/revoke';
// i permessi: la cartella nascosta delle app su Drive e l'email (per mostrare con chi sei collegato)
const PERMESSI = 'https://www.googleapis.com/auth/drive.appdata email';
// Solo le mie app possono usarlo (più il computer, per le prove).
const ORIGINI = [/^https:\/\/lelloclappato\.github\.io$/, /^http:\/\/localhost(:\d+)?$/, /^http:\/\/127\.0\.0\.1(:\d+)?$/];
const DURATA_STATO = 15 * 60 * 1000; // dal tocco su "Accedi" al ritorno: al massimo un quarto d'ora

const consentita = o => !!o && ORIGINI.some(r => r.test(o));
function origineDi(indirizzo) { try { return new URL(indirizzo).origin; } catch (e) { return null; } }

function json(corpo, stato, origine) {
  const h = { 'content-type': 'application/json;charset=UTF-8', 'cache-control': 'no-store', vary: 'Origin' };
  if (consentita(origine)) {
    h['access-control-allow-origin'] = origine;
    h['access-control-allow-methods'] = 'POST, OPTIONS';
    h['access-control-allow-headers'] = 'content-type';
    h['access-control-max-age'] = '86400';
  }
  return new Response(JSON.stringify(corpo), { status: stato, headers: h });
}
const pagina = (testo, stato = 400) => new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Accesso a Google</title><p style="font:17px/1.5 system-ui;max-width:32em;margin:40px auto;padding:0 16px">${testo}</p>`,
  { status: stato, headers: { 'content-type': 'text/html;charset=UTF-8', 'cache-control': 'no-store' } });
const vaiA = indirizzo => new Response(null, { status: 302, headers: { location: indirizzo, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });

// ---------- cifratura e firma (chiavi ricavate dal client secret) ----------
const testo = new TextEncoder(), daTesto = new TextDecoder();
const b64 = b => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const daB64 = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0));

async function chiave(segreto, scopo, algoritmo, usi) {
  const base = await crypto.subtle.importKey('raw', testo.encode(segreto), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: testo.encode('lelloclappato-accesso-google'), info: testo.encode(scopo) },
    base, algoritmo, false, usi);
}
const chiaveCifra = s => chiave(s, 'permesso-lungo-v1', { name: 'AES-GCM', length: 256 }, ['encrypt', 'decrypt']);
const chiaveFirma = s => chiave(s, 'stato-v1', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign', 'verify']);

export async function cifra(segreto, valore) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const dati = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await chiaveCifra(segreto), testo.encode(valore));
  return 'v1.' + b64(iv) + '.' + b64(dati);
}
export async function decifra(segreto, cifrato) {
  const [v, iv, dati] = String(cifrato || '').split('.');
  if (v !== 'v1' || !iv || !dati) return null;
  try { return daTesto.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: daB64(iv) }, await chiaveCifra(segreto), daB64(dati))); }
  catch (e) { return null; }
}
// lo "state" che va e torna da Google: dove tornare, quando è partito, firmato (così nessuno può cambiarlo)
export async function firmaStato(segreto, contenuto) {
  const corpo = b64(testo.encode(JSON.stringify(contenuto)));
  return corpo + '.' + b64(await crypto.subtle.sign('HMAC', await chiaveFirma(segreto), testo.encode(corpo)));
}
export async function leggiStato(segreto, stato, adesso = Date.now()) {
  const [corpo, firma] = String(stato || '').split('.');
  if (!corpo || !firma) return null;
  try {
    if (!(await crypto.subtle.verify('HMAC', await chiaveFirma(segreto), daB64(firma), testo.encode(corpo)))) return null;
    const c = JSON.parse(daTesto.decode(daB64(corpo)));
    if (!c || typeof c.torna !== 'string' || !consentita(origineDi(c.torna)) || !(adesso - c.t < DURATA_STATO)) return null;
    return c;
  } catch (e) { return null; }
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

// torna all'app con il risultato dopo il "#": #/altro diventa #/altro&accesso-google=…
function conRisultato(torna, risultato) {
  const u = new URL(torna);
  const valore = b64(testo.encode(JSON.stringify(risultato)));
  u.hash = (u.hash ? u.hash.slice(1) + '&' : '') + 'accesso-google=' + valore;
  return u.toString();
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const percorso = url.pathname;
    const ritorno = url.origin + '/ritorno';

    // ----- l'accesso, con la pagina di Google -----
    if (req.method === 'GET' && percorso === '/accedi') {
      const torna = url.searchParams.get('torna') || '';
      if (!consentita(origineDi(torna))) return pagina('Questo indirizzo non può usare l’accesso a Google delle mie app.', 403);
      if (!env.GOOGLE_CLIENT_SECRET) return pagina('Il servizio non è ancora configurato: manca il client secret su Cloudflare.', 503);
      const parametri = new URLSearchParams({
        client_id: CLIENT_ID, redirect_uri: ritorno, response_type: 'code', scope: PERMESSI,
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
        state: await firmaStato(env.GOOGLE_CLIENT_SECRET, { torna, t: Date.now() })
      });
      const email = url.searchParams.get('email');
      if (email && email.length < 200) parametri.set('login_hint', email);
      return vaiA(AUTORIZZA + '?' + parametri);
    }
    if (req.method === 'GET' && percorso === '/ritorno') {
      if (!env.GOOGLE_CLIENT_SECRET) return pagina('Il servizio non è ancora configurato: manca il client secret su Cloudflare.', 503);
      const stato = await leggiStato(env.GOOGLE_CLIENT_SECRET, url.searchParams.get('state'));
      if (!stato) return pagina('L’accesso è scaduto o non è valido. Torna nell’app e tocca di nuovo «Accedi con Google».');
      const errore = url.searchParams.get('error');
      if (errore) return vaiA(conRisultato(stato.torna, { errore: errore === 'access_denied' ? 'annullato' : 'google' }));
      const { ok, j } = await chiediToken({ code: url.searchParams.get('code') || '', grant_type: 'authorization_code', redirect_uri: ritorno }, env);
      if (!ok || !j.access_token) {
        console.log('scambio non riuscito', j.error || '', j.error_description || ''); // si vede nei registri del Worker (nessun dato personale)
        return vaiA(conRisultato(stato.torna, { errore: 'google', dettaglio: String(j.error || '') + ' ' + String(j.error_description || '') }));
      }
      return vaiA(conRisultato(stato.torna, {
        access_token: j.access_token, expires_in: j.expires_in, scope: j.scope || '',
        chiave: j.refresh_token ? await cifra(env.GOOGLE_CLIENT_SECRET, j.refresh_token) : null
      }));
    }

    // ----- rinnovo e revoca, chiamati dalle app -----
    const origine = req.headers.get('origin');
    if (req.method === 'OPTIONS') return new Response(null, { status: consentita(origine) ? 204 : 403, headers: consentita(origine) ? {
      'access-control-allow-origin': origine, 'access-control-allow-methods': 'POST, OPTIONS', 'access-control-allow-headers': 'content-type', 'access-control-max-age': '86400', vary: 'Origin' } : {} });
    if (percorso !== '/rinnova' && percorso !== '/revoca') return json({ errore: 'percorso' }, 404, origine);
    if (!consentita(origine)) return json({ errore: 'origine' }, 403, origine);
    if (req.method !== 'POST') return json({ errore: 'metodo' }, 405, origine);
    if (!env.GOOGLE_CLIENT_SECRET) return json({ errore: 'non-configurato' }, 503, origine);
    let corpo = {};
    try { corpo = await req.json(); } catch (e) { return json({ errore: 'richiesta' }, 400, origine); }
    const refresh = await decifra(env.GOOGLE_CLIENT_SECRET, corpo.chiave);
    if (!refresh) return json({ errore: 'chiave' }, 401, origine);
    if (percorso === '/revoca') {
      await fetch(REVOCA, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }) }).catch(() => {});
      return json({ ok: true }, 200, origine);
    }
    const { ok, j } = await chiediToken({ refresh_token: refresh, grant_type: 'refresh_token' }, env);
    // invalid_grant = permesso revocato o scaduto: l'app deve far accedere di nuovo
    if (!ok || !j.access_token) return json({ errore: j.error === 'invalid_grant' ? 'revocato' : 'google' }, j.error === 'invalid_grant' ? 401 : 502, origine);
    return json({ access_token: j.access_token, expires_in: j.expires_in, scope: j.scope || '' }, 200, origine);
  }
};
