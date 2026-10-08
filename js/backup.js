// Esportazione e importazione di tutti i dati in un file JSON (il backup).
import { deposito } from './deposito.js';
import { oggi, plurale, ilGiorno, giorniTra, chiaveValida } from './utili.js';
import { data, setData, segnaBackup, STORE } from './dati.js';
import { controllaBackup } from './validazione.js';
import { render, avviso } from './viste/comune.js';
import { applicaTema } from './viste/altro.js';
import { scarica } from './viste/elementi.js';
import { conferma } from './pannelli/pannello.js';

// Prima di ogni importazione (e prima di "Cancella tutti i dati") i dati attuali vengono copiati qui,
// per poter tornare indietro: { salvataIl: "AAAA-MM-GG", dati: {…} }.
// La copia dura una settimana: dopo, tornare indietro vorrebbe dire perdere troppe cose aggiunte nel frattempo.
export const PRIMA_IMPORT = STORE + '-prima-importazione';
const GIORNI_COPIA = 7;

// Mette da parte i dati attuali. Restituisce false se non c'è spazio.
export function salvaCopia() {
  try { deposito.setItem(PRIMA_IMPORT, JSON.stringify({ salvataIl: oggi(), dati: data })); return true; }
  catch (e) { return false; }
}
// La copia messa da parte, se c'è ed è ancora valida: { salvataIl, dati }. Quella scaduta viene cancellata.
function leggiCopia() {
  try {
    const c = JSON.parse(deposito.getItem(PRIMA_IMPORT) || 'null');
    if (!c || !chiaveValida(c.salvataIl) || !c.dati) { if (c) deposito.removeItem(PRIMA_IMPORT); return null; }
    if (giorniTra(c.salvataIl, oggi()) > GIORNI_COPIA) { deposito.removeItem(PRIMA_IMPORT); return null; }
    return c;
  } catch (e) { return null; }
}

export function esportaBackup() {
  segnaBackup();
  // "app" ed "esportatoIl" aiutano a riconoscere il file; all'importazione vengono ignorati
  // Nel file non finiscono il cronometro in corso né la chiave di Google Books (che resta solo su questo dispositivo).
  const file = { app: 'i-miei-libri', esportatoIl: new Date().toISOString(), ...data, timer: null, impostazioni: { ...data.impostazioni, chiaveGoogle: '' } };
  scarica('libri-backup-' + oggi() + '.json', JSON.stringify(file, null, 2), 'application/json');
  render();
  avviso('Backup scaricato: conservalo fuori dal telefono');
}

// apre la scelta del file (l'<input type="file"> nascosto in index.html)
export function chiediImport() { document.getElementById('importFile').click(); }

function elenco(r) {
  return [plurale(r.libri, 'libro', 'libri'), plurale(r.capitoli, 'riassunto', 'riassunti'), plurale(r.parole, 'parola', 'parole'), plurale(r.citazioni, 'citazione', 'citazioni')].join(', ');
}

// Legge il file scelto, lo controlla e, se va bene e l'utente conferma, sostituisce i dati.
export function preparaImport() {
  document.getElementById('importFile').addEventListener('change', e => {
    const file = e.target.files[0]; e.target.value = ''; // così si può scegliere di nuovo lo stesso file
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { avviso('Il file è troppo grande: non sembra un backup di I miei libri.', { durata: 6000, errore: true }); return; }
    const r = new FileReader();
    r.onload = async () => {
      let json;
      try { json = JSON.parse(r.result); } catch (err) { avviso('Il file non è un backup: non riesco a leggerlo.', { durata: 6000, errore: true }); return; }
      const c = controllaBackup(json);
      if (!c.ok) { avviso('Non posso importare questo file. ' + c.errori[0], { durata: 8000, errore: true }); return; }
      const ok = await conferma(`Il backup contiene ${elenco(c.riepilogo)}.`, {
        ok: 'Importa', annulla: 'Annulla',
        dettaglio: (c.avvisi.length ? c.avvisi.join(' ') + ' ' : '') + 'Importarlo sostituisce i dati che hai adesso. Prima ne salvo una copia, così potrai annullare.'
      });
      if (!ok) return;
      if (!salvaCopia()) { avviso('Non riesco a salvare la copia dei dati attuali (memoria piena): importazione annullata.', { durata: 8000, errore: true }); return; }
      // la chiave di Google Books non è nel backup: si tiene quella di questo dispositivo
      c.dati.impostazioni.chiaveGoogle = data.impostazioni.chiaveGoogle;
      if (!setData(c.dati)) return;
      applicaTema(); // il backup può avere un tema diverso da quello di adesso
      render();
      avviso('Backup importato', { etichetta: 'Annulla', azione: annullaImport });
    };
    r.onerror = () => avviso('Non riesco a leggere il file.', { errore: true });
    r.readAsText(file);
  });
}

// C'è una copia dei dati di prima dell'ultima importazione (o cancellazione)? Restituisce il giorno in cui è stata fatta, o null.
export function giornoDellaCopia() { const c = leggiCopia(); return c ? c.salvataIl : null; }

// Torna ai dati messi da parte prima dell'ultima importazione (o cancellazione).
export async function annullaImport() {
  const copia = leggiCopia();
  const c = copia ? controllaBackup(copia.dati) : { ok: false };
  if (!c.ok) { avviso('La copia dei dati precedenti non c’è più o non è leggibile.', { errore: true }); render(); return; }
  const ok = await conferma(`Tornare ai dati che avevi ${ilGiorno(copia.salvataIl, { annoSempre: false })}?`, {
    ok: 'Ripristina',
    dettaglio: `Contengono ${elenco(c.riepilogo)}. Quello che hai adesso verrà sostituito, comprese le cose aggiunte dopo quel giorno.`
  });
  if (!ok) return;
  c.dati.impostazioni.chiaveGoogle = data.impostazioni.chiaveGoogle;
  if (!setData(c.dati)) return;
  try { deposito.removeItem(PRIMA_IMPORT); } catch (e) {}
  applicaTema();
  render();
  avviso('Dati precedenti ripristinati');
}
