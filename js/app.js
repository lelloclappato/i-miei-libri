// Punto di partenza dell'app: carica le schermate, collega i tocchi alle azioni e disegna la prima pagina.
//
// Invece di mettere un "ascoltatore" su ogni pulsante, ce n'è uno solo su tutto il documento
// ("delega degli eventi"): quando tocchi qualcosa, cerca l'elemento più vicino con data-azione
// e chiama la funzione registrata con quel nome. Così funziona anche con l'HTML ridisegnato da render().
import { data, quandoNonSalva, ricarica, STORE } from './dati.js';
import { render, rotta, azione, scrittura, aggiornaTempo, avviso } from './viste/comune.js';
import { preparaPannelli, chiudiPannello, pannelloAperto, chiudiConferma } from './pannelli/pannello.js';
import { preparaImport } from './backup.js';
import { setupPWA } from './pwa.js';
import { applicaTema } from './viste/altro.js';
import { apriParola } from './pannelli/parola.js';
// Le schermate: importarle basta a registrarle (ognuna chiama registraVista e registraAzioni).
import './viste/oggi.js';
import './viste/libreria.js';
import './viste/libro.js';
import './viste/quaderno.js';
import './viste/statistiche.js';
import './viste/lettura.js';

// ---------- tocchi ----------
document.addEventListener('click', e => {
  const el = e.target.closest('[data-azione]');
  if (!el || el.disabled) return;
  const fn = azione(el.dataset.azione);
  if (fn) fn(el, e);
});

// ---------- scrittura nei campi e scelte nei menu ----------
// i campi di testo e le scelte tonde avvisano mentre cambiano ("input"), i menu a tendina quando si sceglie ("change")
document.addEventListener('input', e => {
  const el = e.target.closest('[data-scrivi]');
  if (!el || el.tagName === 'SELECT') return;
  const fn = scrittura(el.dataset.scrivi);
  if (fn) fn(el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('select[data-scrivi]');
  if (!el) return;
  const fn = scrittura(el.dataset.scrivi);
  if (fn) fn(el, e);
});

// ---------- cambio di schermata ----------
// Ogni schermata visitata riceve un numero, scritto nella cronologia del browser (history.state).
// Arrivando su una schermata: se ha già il suo numero ci si sta tornando (indietro o avanti) e si rimette
// la pagina all'altezza a cui era; se non ce l'ha è una visita nuova, e si parte dall'alto.
const altezze = new Map(); // numero della visita → altezza a cui era arrivata la pagina
let numero = 0;
function numeroDiQui() { return history.state && Number.isInteger(history.state.visita) ? history.state.visita : null; }
function segnaVisita() {
  if (numeroDiQui() === null) history.replaceState({ ...(history.state || {}), visita: ++numero }, '');
  else numero = Math.max(numero, numeroDiQui());
}
let visita = null; // il numero della schermata che si sta guardando
window.addEventListener('scroll', () => { if (visita !== null) altezze.set(visita, window.scrollY); }, { passive: true });

window.addEventListener('hashchange', () => {
  chiudiConferma();                        // una domanda rimasta aperta non segue l'utente in un'altra schermata
  if (pannelloAperto()) chiudiPannello();  // e nemmeno un pannello
  const tornando = numeroDiQui() !== null;
  segnaVisita();
  visita = numeroDiQui();
  render();
  window.scrollTo(0, tornando && altezze.has(visita) ? altezze.get(visita) : 0);
  // il fuoco della tastiera (e dei lettori di schermo) va all'inizio della nuova schermata
  document.getElementById('app').focus({ preventScroll: true });
});

// ---------- cronometro e cambio di giorno ----------
// Ogni secondo: aggiorna i numeri del cronometro e controlla se è passata la mezzanotte
// (in quel caso "Oggi", la serie e le parole da ripassare vanno ricalcolate).
let giornoDisegnato = new Date().toDateString();
function ogniSecondo() {
  aggiornaTempo();
  const adesso = new Date().toDateString();
  if (adesso !== giornoDisegnato && !pannelloAperto()) { giornoDisegnato = adesso; render(); }
}
setInterval(ogniSecondo, 1000);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') ogniSecondo(); });

// ---------- la stessa app aperta due volte ----------
// Se l'app è aperta in due finestre (per esempio quella installata e una scheda del browser), ognuna ha
// in memoria la sua copia dei dati: senza questo, l'ultima che salva cancellerebbe le modifiche dell'altra.
// Il browser avvisa ("storage") quando un'altra finestra salva: qui si rileggono i dati.
window.addEventListener('storage', e => {
  if (e.key !== STORE && e.key !== null) return;
  ricarica();
  applicaTema();
  if (!pannelloAperto()) render();
});

// ---------- avvio ----------
let erroreGiaDetto = false;
quandoNonSalva(() => {
  const testo = 'Non riesco a salvare: la memoria del browser è piena o bloccata. Vai in Altro e scarica un backup.';
  // la prima volta, con un pannello aperto, l'avviso in basso resterebbe nascosto dietro: si usa la finestra del browser
  if (pannelloAperto() && !erroreGiaDetto) alert(testo);
  else avviso(testo, { durata: 9000, errore: true });
  erroreGiaDetto = true;
});
applicaTema();
// se il telefono passa da chiaro a scuro mentre l'app è aperta, si aggiorna il colore della barra in alto
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applicaTema);
preparaPannelli();
preparaImport();
setupPWA(() => { if (rotta().nome === 'altro' && !pannelloAperto()) render(); });
segnaVisita();
visita = numeroDiQui();
render();

// Scorciatoia dall'icona dell'app (tenendola premuta): "Parola nuova" apre subito il pannello.
if (new URLSearchParams(location.search).get('azione') === 'parola') {
  history.replaceState(history.state, '', location.pathname + location.hash); // toglie ?azione=… dall'indirizzo
  apriParola();
}

// I dati stanno solo nel browser: gli si chiede di non cancellarli da solo quando lo spazio scarseggia.
// (Chrome lo concede alle app installate; se dice di no non cambia niente.)
if (data.libri.length && navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
