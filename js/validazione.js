// Controllo di un file di backup prima di importarlo: dice se si può usare, cosa contiene
// e se qualcosa è stato scartato perché scritto male. Funzione pura, con i suoi test.
import { upgrade, CURRENT_VERSION } from './migrazione.js';

const oggetto = v => !!v && typeof v === 'object' && !Array.isArray(v);
const quanti = v => (Array.isArray(v) ? v.length : 0);

// Restituisce { ok, errori: [...], avvisi: [...], riepilogo: {...}, dati }
//   ok = false → il file non si può importare (errori spiega perché)
//   avvisi     → si può importare, ma qualcosa è stato lasciato fuori
export function controllaBackup(json) {
  const errori = [], avvisi = [];
  if (!oggetto(json)) return { ok: false, errori: ['Il file non contiene i dati di un backup.'], avvisi, riepilogo: null, dati: null };
  if (json.app && json.app !== 'i-miei-libri') errori.push(`È il backup di un’altra app (“${String(json.app).slice(0, 40)}”), non di I miei libri.`);
  if (!Array.isArray(json.libri)) errori.push('Manca l’elenco dei libri.');
  if (Number(json.version) > CURRENT_VERSION) errori.push('Il backup è stato creato con una versione più nuova dell’app: aggiorna l’app e riprova.');
  if (errori.length) return { ok: false, errori, avvisi, riepilogo: null, dati: null };

  const dati = upgrade(json);
  const conta = d => ({
    libri: quanti(d.libri),
    capitoli: (Array.isArray(d.libri) ? d.libri : []).reduce((s, l) => s + (oggetto(l) ? quanti(l.capitoli) : 0), 0),
    citazioni: (Array.isArray(d.libri) ? d.libri : []).reduce((s, l) => s + (oggetto(l) ? quanti(l.citazioni) : 0), 0),
    parole: quanti(d.parole),
    letture: quanti(d.letture)
  });
  const prima = conta(json), dopo = conta(dati);
  const nomi = { libri: 'libri', capitoli: 'riassunti', citazioni: 'citazioni', parole: 'parole', letture: 'letture' };
  for (const k of Object.keys(nomi)) {
    if (dopo[k] < prima[k]) avvisi.push(`${prima[k] - dopo[k]} ${nomi[k]} su ${prima[k]} non erano leggibili e sono stati lasciati fuori.`);
  }
  return { ok: true, errori, avvisi, riepilogo: dopo, dati };
}
