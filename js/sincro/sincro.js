// SINCRONIZZAZIONE: mette insieme registro (cosa è cambiato), accesso Google e Drive.
// Identico in tutte le mie app; ogni app lo crea una volta con creaSincro({...}) e poi:
//   - chiama dopoSalvataggio() ogni volta che salva i suoi dati;
//   - chiama avvia() all'apertura;
//   - mostra stato() da qualche parte (e si ridisegna con ascolta()).
// Quando non si è collegati non fa niente: l'app funziona esattamente come prima.
import * as R from './registro.js';
import * as driveVero from './drive.js';
import { creaAccesso } from './google.js';

// "oggi alle 19:40", "ieri alle 8:05", "il 3/11 alle 21:10": per mostrare l'ultima sincronizzazione
export function quandoTesto(ms) {
  const d = new Date(ms), ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const giorno = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const g = Math.round((giorno(new Date()) - giorno(d)) / 86400000);
  return (g === 0 ? 'oggi' : g === 1 ? 'ieri' : `il ${d.getDate()}/${d.getMonth() + 1}`) + ' alle ' + ora;
}

// quanti elementi principali ci sono per ogni raccolta, es. { libri: 12, parole: 40 }
export function conta(p) {
  const n = {};
  for (const e of Object.values(p.elementi)) if (e.s === undefined && e.g === undefined) n[e.p] = (n[e.p] || 0) + 1;
  return n;
}

export function creaSincro({
  prefisso,                 // es. 'libri': il registro si salva come 'libri-sincro'
  nomeFile,                 // es. 'libri.json': il file nella cartella dell'app su Drive
  schema,                   // vedi registro.js
  leggiDati,                // () => i dati dell'app in questo momento
  scriviDati,               // (dati) => sostituisce i dati dell'app (che li controlla, li salva e ridisegna)
  clientId = '',            // l'ID client OAuth: se manca, la sincronizzazione non c'è
  descrivi = p => Object.entries(conta(p)).map(([k, v]) => `${v} ${k}`).join(', ') || 'niente',
  chiediPrimaUnione = async () => 'unisci', // la prima volta, se qui e sull'account ci sono dati diversi
  deposito = globalThis.localStorage,
  drive = driveVero,
  accesso = clientId ? creaAccesso({ clientId, deposito }) : null,
  attesa = 4000             // dopo un salvataggio si aspetta un po', così più modifiche vanno insieme
}) {
  const CHIAVE = prefisso + '-sincro';
  let registro = carica();
  let timer = null, inCorso = null, ancora = false, scrivendo = false;
  const ascoltatori = new Set();
  let stato = { fase: faseIniziale(), ultima: registro.ultima || null, errore: '', email: accesso ? accesso.email() : '' };

  function carica() {
    try {
      const r = JSON.parse(deposito.getItem(CHIAVE) || 'null');
      if (r && r.impronte && r.mod && r.eliminati) return r;
    } catch (e) {}
    return R.registroVuoto();
  }
  function salva() { try { deposito.setItem(CHIAVE, JSON.stringify(registro)); } catch (e) {} }
  function faseIniziale() {
    if (!accesso) return 'non-disponibile';
    if (!accesso.collegato()) return 'spento';
    return accesso.valido() ? 'pronto' : 'da-riconnettere';
  }
  function aggiorna(nuovo) {
    stato = { ...stato, ...nuovo, email: accesso ? accesso.email() : '' };
    for (const f of ascoltatori) { try { f(stato); } catch (e) {} }
  }
  function programma(ms = attesa) {
    if (!accesso || !accesso.collegato()) return;
    clearTimeout(timer);
    timer = setTimeout(() => { sincronizza(); }, ms);
  }

  // il registro si rilegge ogni volta: l'app può essere aperta in due finestre che lo aggiornano tutte e due
  function dopoSalvataggio() {
    if (scrivendo) return;
    registro = carica();
    if (R.osserva(registro, leggiDati(), schema)) { registro.sporco = true; salva(); programma(); }
  }

  function sincronizza({ interattivo = false } = {}) {
    if (!accesso || (!accesso.collegato() && !interattivo)) return Promise.resolve(stato);
    if (inCorso) { ancora = true; return inCorso; }
    clearTimeout(timer);
    inCorso = esegui(interattivo).finally(() => { inCorso = null; if (ancora) { ancora = false; programma(300); } });
    return inCorso;
  }

  async function esegui(interattivo) {
    let token;
    try { token = await accesso.token({ interattivo }); }
    catch (e) { aggiorna({ fase: accesso.collegato() ? 'da-riconnettere' : 'spento', errore: e.message }); return stato; }
    if (!token) { aggiorna({ fase: 'da-riconnettere' }); return stato; }
    aggiorna({ fase: 'in-corso', errore: '' });
    try {
      registro = carica();
      R.osserva(registro, leggiDati(), schema);
      const files = await drive.trova(token, nomeFile);
      let remoto = null;
      for (const f of [...files].reverse()) { // dal più vecchio al più recente: a parità vince il più recente
        const p = await drive.leggi(token, f.id);
        if (R.pacchettoValido(p)) remoto = remoto ? R.unisci(remoto, p) : p;
      }
      const locale = R.pacchetto(registro, leggiDati(), schema);
      let unito;
      if (!remoto) unito = locale;
      else if (!registro.sincronizzato && Object.keys(locale.elementi).some(k => !k.startsWith('=') && !(k in remoto.elementi))) {
        const scelta = await chiediPrimaUnione({ qui: descrivi(locale), account: descrivi(remoto) });
        if (scelta === 'annulla') { await scollega(); return stato; }
        unito = scelta === 'account' ? remoto : R.unisci(locale, remoto);
      } else unito = R.unisci(locale, remoto);

      const nuovi = R.ricostruisci(leggiDati(), unito.elementi, schema);
      if (R.improntaDati(nuovi, schema) !== R.improntaDati(leggiDati(), schema)) {
        scrivendo = true;
        try { await scriviDati(nuovi); } finally { scrivendo = false; }
      }
      R.allinea(registro, leggiDati(), schema, unito);
      const finale = R.pacchetto(registro, leggiDati(), schema);
      if (!remoto || files.length > 1 || R.improntaPacchetto(finale) !== R.improntaPacchetto(remoto)) {
        await drive.scrivi(token, nomeFile, { ...finale, scritto: Date.now() }, files.length ? files[0].id : null);
        for (const f of files.slice(1)) { try { await drive.elimina(token, f.id); } catch (e) {} }
      }
      registro.sincronizzato = true; registro.sporco = false; registro.ultima = Date.now();
      salva();
      aggiorna({ fase: 'pronto', ultima: registro.ultima, errore: '' });
    } catch (e) {
      salva();
      if (e.codice === 'scaduto') { accesso.scaduto(); aggiorna({ fase: 'da-riconnettere', errore: '' }); }
      else aggiorna({ fase: 'errore', errore: e.message || 'Errore durante la sincronizzazione.' });
    }
    return stato;
  }

  async function scollega() {
    clearTimeout(timer);
    if (accesso) await accesso.scollega();
    registro.sincronizzato = false; salva();
    aggiorna({ fase: accesso ? 'spento' : 'non-disponibile', errore: '' });
  }

  let avviato = false;
  return {
    disponibile: !!accesso,
    stato: () => stato,
    ascolta(f) { ascoltatori.add(f); return () => ascoltatori.delete(f); },
    daInviare: () => !!registro.sporco,
    dopoSalvataggio,
    sincronizza,
    // "Accedi con Google" e "Sincronizza adesso": vanno chiamate da un tocco (può aprirsi la finestra di Google)
    collega: () => sincronizza({ interattivo: true }),
    scollega,
    avvia() {
      if (avviato) return;
      avviato = true;
      R.osserva(registro, leggiDati(), schema); salva();
      if (!accesso) return;
      if (accesso.collegato()) sincronizza();
      // si risincronizza tornando sull'app e quando torna la connessione
      globalThis.document?.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sincronizza(); });
      globalThis.addEventListener?.('online', () => sincronizza());
    }
  };
}
