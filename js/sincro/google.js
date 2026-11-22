// SINCRONIZZAZIONE: l'accesso con Google. Identico in tutte le mie app. Siccome stanno tutte sullo stesso sito
// (lelloclappato.github.io), condividono anche l'accesso: collegandosi in una, si è collegati in tutte.
//
// Due modi, dal migliore:
//  1. con il "ponte" (un piccolo servizio su Cloudflare, codice in ponte-google/worker.js dell'app I miei libri):
//     tocchi "Accedi con Google", la pagina va su Google e poi torna all'app con un accesso di un'ora e un
//     "permesso lungo" cifrato. Quando l'ora finisce, l'app chiede al ponte un accesso nuovo, senza finestre:
//     si resta collegati finché non scolleghi il dispositivo o revochi il permesso dal tuo account Google.
//  2. senza ponte (se PONTE è vuoto): Google Identity Services nel browser. L'accesso dura un'ora e poi, per
//     riaverlo, serve un tocco (si apre un attimo la finestra di Google).
// Il permesso chiesto è solo "drive.appdata": una cartella nascosta del Drive riservata a queste app,
// che non vede nessun altro file. "email" serve solo a mostrare con quale account sei collegato.

export const PONTE = 'https://accesso-google.debartologabriele2005-e41.workers.dev';
const SCRIPT = 'https://accounts.google.com/gsi/client';
export const PERMESSO_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
const PERMESSI = PERMESSO_DRIVE + ' email';
const CHIAVE = 'lelloclappato-google'; // condivisa tra le app: { token, scade, email, chiave }
const ATTESA_PONTE = 10000;

function leggi(deposito) {
  try { const v = JSON.parse(deposito.getItem(CHIAVE) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}
function scrivi(deposito, v) {
  try { if (v) deposito.setItem(CHIAVE, JSON.stringify(v)); else deposito.removeItem(CHIAVE); } catch (e) {}
}

export function errore(codice, messaggio) { const e = new Error(messaggio || codice); e.codice = codice; return e; }

// Al ritorno da Google il ponte mette il risultato nell'indirizzo, dopo il "#": #/altro&accesso-google=…
// Lo si legge e lo si toglie subito dall'indirizzo (prima che l'app lo usi per decidere la schermata).
export function leggiRitorno(posizione = globalThis.location, storia = globalThis.history) {
  if (!posizione || !posizione.hash) return null;
  const m = /(^#|&)accesso-google=([^&]*)/.exec(posizione.hash);
  if (!m) return null;
  let resto = posizione.hash.replace(m[0], m[1] === '#' ? '#' : '');
  if (resto === '#' || resto === '') resto = '';
  else if (resto.startsWith('#&')) resto = '#' + resto.slice(2);
  try { storia.replaceState(storia.state, '', posizione.pathname + posizione.search + resto); } catch (e) {}
  try {
    const t = m[2].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(escape(atob(t))));
  } catch (e) { return { errore: 'google' }; }
}

let caricamento = null;
function caricaGoogle() {
  if (globalThis.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  if (caricamento) return caricamento;
  caricamento = new Promise((ok, no) => {
    const s = document.createElement('script');
    s.src = SCRIPT; s.async = true;
    s.onload = () => ok();
    s.onerror = () => { caricamento = null; no(errore('rete', 'Non riesco a raggiungere Google: controlla la connessione.')); };
    document.head.appendChild(s);
  });
  return caricamento;
}

async function chiamaPonte(ponte, percorso, corpo) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ATTESA_PONTE);
  try {
    const r = await fetch(ponte + percorso, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo), signal: ctrl.signal });
    let j = {};
    try { j = await r.json(); } catch (e) {}
    return { stato: r.status, j };
  } catch (e) { return { stato: 0, j: {} }; }
  finally { clearTimeout(t); }
}

export function creaAccesso({ clientId, ponte = PONTE, deposito = globalThis.localStorage, posizione = globalThis.location }) {
  const salvato = () => leggi(deposito) || {};

  // il ritorno da Google (se la pagina è appena tornata da lì)
  let ritorno = null;
  const r = ponte ? leggiRitorno(posizione) : null;
  if (r) {
    if (r.access_token) {
      const s = salvato();
      scrivi(deposito, { email: s.email || '', token: r.access_token, scade: Date.now() + (Number(r.expires_in) || 3600) * 1000, chiave: r.chiave || s.chiave || null });
      ritorno = { ok: true, senzaPermessoLungo: !r.chiave && !s.chiave };
    } else ritorno = { errore: r.errore === 'annullato' ? 'Accesso annullato.' : 'Google non ha completato l’accesso: riprova.' };
  }

  async function conEmail(token) {
    const s = salvato();
    if (s.email) return;
    try {
      const risposta = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + token } });
      if (risposta.ok) scrivi(deposito, { ...salvato(), email: String((await risposta.json()).email || '') });
    } catch (e) { /* l'email serve solo da mostrare */ }
  }

  // Con il ponte: si va su Google (la pagina lascia l'app e poi ci torna). Non si risolve mai: la pagina cambia.
  function vaiAGoogle() {
    const s = salvato();
    const u = new URL(ponte + '/accedi');
    u.searchParams.set('torna', posizione.href);
    if (s.email) u.searchParams.set('email', s.email);
    posizione.assign(u.toString());
    return new Promise(() => {});
  }

  // Senza ponte: la finestra di Google Identity Services. Va chiamata subito dopo un tocco.
  async function chiediNelBrowser() {
    await caricaGoogle();
    const s = salvato();
    const risposta = await new Promise((ok, no) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: PERMESSI,
        callback: x => (x && x.error ? no(errore(x.error, 'Google non ha dato il permesso.')) : ok(x)),
        error_callback: e => no(errore(e && e.type === 'popup_closed' ? 'annullato' : (e && e.type) || 'annullato',
          e && e.type === 'popup_failed_to_open' ? 'Il browser ha bloccato la finestra di Google: consenti i popup per questo sito.' : 'Accesso annullato.'))
      });
      client.requestAccessToken({ prompt: s.email ? '' : 'consent', login_hint: s.email || undefined });
    });
    if (!google.accounts.oauth2.hasGrantedAllScopes(risposta, PERMESSO_DRIVE)) {
      throw errore('permesso-negato', 'Serve il permesso di salvare i dati nella cartella dell’app su Google Drive: senza, la sincronizzazione non funziona.');
    }
    scrivi(deposito, { ...salvato(), token: risposta.access_token, scade: Date.now() + (Number(risposta.expires_in) || 3600) * 1000 });
    await conEmail(risposta.access_token);
    return salvato().token;
  }

  // Un accesso nuovo dal permesso lungo, senza finestre. null se non si può (e allora serve un tocco).
  async function rinnova() {
    const s = salvato();
    if (!ponte || !s.chiave) return null;
    const { stato, j } = await chiamaPonte(ponte, '/rinnova', { chiave: s.chiave });
    if (stato === 200 && j.access_token) {
      scrivi(deposito, { ...salvato(), token: j.access_token, scade: Date.now() + (Number(j.expires_in) || 3600) * 1000 });
      return j.access_token;
    }
    // permesso revocato (o chiave non più valida): lo si dimentica, al prossimo tocco si riaccede
    if (stato === 401) { const x = salvato(); delete x.chiave; scrivi(deposito, x); }
    return null;
  }

  return {
    // collegato = la persona ha scelto di sincronizzare (anche se l'accesso di un'ora è scaduto)
    collegato: () => { const s = salvato(); return !!(s.token || s.chiave); },
    email: () => salvato().email || '',
    // valido = si può sincronizzare senza chiedere niente alla persona
    valido: () => { const s = salvato(); return (!!s.token && s.scade > Date.now() + 60000) || (!!ponte && !!s.chiave); },
    permessoLungo: () => !!(ponte && salvato().chiave),
    ritorno: () => ritorno,
    // l'accesso, se ancora valido o rinnovabile; con interattivo = true lo chiede di nuovo (serve un tocco)
    async token({ interattivo = false } = {}) {
      const s = salvato();
      if (s.token && s.scade > Date.now() + 60000) { if (!s.email) await conEmail(s.token); return s.token; }
      const nuovo = await rinnova();
      if (nuovo) { await conEmail(nuovo); return nuovo; }
      if (!interattivo) return null;
      return ponte ? vaiAGoogle() : chiediNelBrowser();
    },
    // Google ha rifiutato l'accesso (401): lo si considera scaduto; il permesso lungo, se c'è, lo rinnoverà
    scaduto() { const s = salvato(); if (s.token) scrivi(deposito, { ...s, scade: 0 }); },
    async scollega() {
      const s = salvato();
      scrivi(deposito, null);
      if (ponte && s.chiave) { await chiamaPonte(ponte, '/revoca', { chiave: s.chiave }); return; }
      try { if (s.token && s.scade > Date.now()) { await caricaGoogle(); google.accounts.oauth2.revoke(s.token, () => {}); } } catch (e) {}
    }
  };
}
