// SINCRONIZZAZIONE: l'accesso con Google, fatto tutto nel browser (Google Identity Services).
// Identico in tutte le mie app. Siccome stanno tutte sullo stesso sito (lelloclappato.github.io),
// condividono anche l'accesso: collegandosi in una, si è collegati in tutte.
//
// Google dà un "permesso" (access token) che dura un'ora e che il browser da solo non può rinnovare
// in silenzio: quando è scaduto, per riaverlo serve un tocco (si apre un attimo la finestra di Google).
// Il permesso chiesto è solo "drive.appdata": una cartella nascosta del Drive riservata a queste app,
// che non vede nessun altro file. "email" serve solo a mostrare con quale account sei collegato.

const SCRIPT = 'https://accounts.google.com/gsi/client';
export const PERMESSO_DRIVE = 'https://www.googleapis.com/auth/drive.appdata';
const PERMESSI = PERMESSO_DRIVE + ' email';
const CHIAVE = 'lelloclappato-google'; // condivisa tra le app: { token, scade, email }

function leggi(deposito) {
  try { const v = JSON.parse(deposito.getItem(CHIAVE) || 'null'); return v && typeof v === 'object' ? v : null; } catch (e) { return null; }
}
function scrivi(deposito, v) {
  try { if (v) deposito.setItem(CHIAVE, JSON.stringify(v)); else deposito.removeItem(CHIAVE); } catch (e) {}
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

export function errore(codice, messaggio) { const e = new Error(messaggio || codice); e.codice = codice; return e; }

export function creaAccesso({ clientId, deposito = globalThis.localStorage }) {
  const salvato = () => leggi(deposito) || {};

  // Chiede un permesso nuovo a Google. Va chiamata subito dopo un tocco, altrimenti il browser blocca la finestra.
  async function chiedi() {
    await caricaGoogle();
    const s = salvato();
    const risposta = await new Promise((ok, no) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: PERMESSI,
        callback: r => (r && r.error ? no(errore(r.error, 'Google non ha dato il permesso.')) : ok(r)),
        error_callback: e => no(errore(e && e.type === 'popup_closed' ? 'annullato' : (e && e.type) || 'annullato',
          e && e.type === 'popup_failed_to_open' ? 'Il browser ha bloccato la finestra di Google: consenti i popup per questo sito.' : 'Accesso annullato.'))
      });
      client.requestAccessToken({ prompt: s.email ? '' : 'consent', login_hint: s.email || undefined });
    });
    if (!google.accounts.oauth2.hasGrantedAllScopes(risposta, PERMESSO_DRIVE)) {
      throw errore('permesso-negato', 'Serve il permesso di salvare i dati nella cartella dell’app su Google Drive: senza, la sincronizzazione non funziona.');
    }
    const nuovo = { ...s, token: risposta.access_token, scade: Date.now() + (Number(risposta.expires_in) || 3600) * 1000 };
    if (!nuovo.email) {
      try {
        const r = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: 'Bearer ' + nuovo.token } });
        if (r.ok) nuovo.email = String((await r.json()).email || '');
      } catch (e) { /* l'email serve solo da mostrare */ }
    }
    scrivi(deposito, nuovo);
    return nuovo.token;
  }

  return {
    // collegato = la persona ha scelto di sincronizzare (anche se il permesso è scaduto)
    collegato: () => !!salvato().token,
    email: () => salvato().email || '',
    valido: () => { const s = salvato(); return !!s.token && s.scade > Date.now() + 60000; },
    // il permesso, se ancora valido; con interattivo = true lo chiede di nuovo (serve un tocco)
    async token({ interattivo = false } = {}) {
      const s = salvato();
      if (s.token && s.scade > Date.now() + 60000) return s.token;
      return interattivo ? chiedi() : null;
    },
    // il permesso non funziona più (revocato da Google): lo si dimentica, ma si resta "collegati"
    scaduto() { const s = salvato(); if (s.token) scrivi(deposito, { ...s, scade: 0 }); },
    async scollega() {
      const s = salvato();
      scrivi(deposito, null);
      try { if (s.token && s.scade > Date.now()) { await caricaGoogle(); google.accounts.oauth2.revoke(s.token, () => {}); } } catch (e) {}
    }
  };
}
