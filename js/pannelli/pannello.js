// Il pannello che sale dal basso (per aggiungere e modificare le cose) e la piccola finestra di conferma.
// Usano l'elemento <dialog> del browser, che da solo: blocca il resto della pagina, tiene il fuoco
// della tastiera dentro la finestra, si chiude con Esc e con il tasto "indietro" di Android.
import { esc } from '../utili.js';
import { icona } from '../icone.js';

let dopoChiusura = null;
let conBozza = false; // il pannello aperto salva da solo una bozza: chiuderlo non fa perdere niente

const pannello = () => document.getElementById('pannello');

// ---------- contro i doppi tocchi ----------
// Quando un pannello si apre, cambia contenuto o si chiude, sotto il dito compare un pulsante diverso da quello
// appena toccato: un doppio tocco lo premerebbe senza volerlo (e segnerebbe un libro come letto, o risponderebbe
// a una scheda del ripasso senza averla vista). Per un terzo di secondo i tocchi vengono ignorati.
let fermoFinoA = 0;
export function fermaTocchi(ms = 320) { fermoFinoA = Date.now() + ms; }
document.addEventListener('click', e => {
  // e.detail === 0: il "clic" viene dalla tastiera (Invio o Spazio), non da un tocco: quello passa sempre
  if (e.detail !== 0 && Date.now() < fermoFinoA) { e.preventDefault(); e.stopPropagation(); }
}, true);

// Apre il pannello (o ne cambia il contenuto, se è già aperto). Restituisce l'elemento che contiene "corpo",
// a cui chi chiama collega i suoi pulsanti e campi.
//   pieno:  occupa tutto lo schermo (per scrivere testi lunghi)
//   chiuso: funzione chiamata quando il pannello si chiude, in qualunque modo
//   bozza:  true se il pannello mette da parte da solo quello che scrivi (vedi capitolo.js)
export function apriPannello({ titolo, corpo, pieno = false, chiuso = null, bozza = false }) {
  const d = pannello();
  d.className = 'pannello' + (pieno ? ' pannello--pieno' : '');
  d.innerHTML = `
    <div class="pannello-testa">
      <h2 id="pannello-titolo">${esc(titolo)}</h2>
      <button type="button" class="tonda tonda--nuda" data-chiudi aria-label="Chiudi">${icona('chiudi')}</button>
    </div>
    <div class="pannello-corpo">${corpo}</div>`;
  dopoChiusura = chiuso;
  conBozza = bozza;
  delete d.dataset.scritto;
  fermaTocchi();
  const giaAperto = d.open;
  if (!giaAperto) d.showModal(); // il browser mette da solo il fuoco sul campo con "autofocus"
  const dentro = d.querySelector('.pannello-corpo');
  // se il pannello era già aperto (si è solo cambiato il contenuto) il fuoco va spostato a mano
  if (giaAperto) (dentro.querySelector('[autofocus]') || d.querySelector('[data-chiudi]')).focus();
  return dentro;
}

// Chiude il pannello senza chiedere niente: si usa dopo aver salvato.
export function chiudiPannello() {
  const d = pannello();
  if (d.open) d.close();
}
export function pannelloAperto() { return pannello().open; }

// Da chiamare quando l'utente ha cambiato qualcosa nel pannello senza scrivere in un campo
// (per esempio ha toccato le stelle del voto): da quel momento chiudere chiede conferma.
export function segnaScritto() { pannello().dataset.scritto = '1'; }

// Chiusura chiesta dall'utente (X, Esc, tasto indietro). Se ha scritto qualcosa che andrebbe perso, prima si chiede.
let chiedendo = false;
async function chiudiSeVuole() {
  const d = pannello();
  if (!d.open || chiedendo) return;
  if (d.dataset.scritto && !conBozza) {
    chiedendo = true;
    const ok = await conferma('Chiudere senza salvare?', { ok: 'Chiudi', annulla: 'Continua a scrivere', dettaglio: 'Quello che hai scritto qui andrà perso.' });
    chiedendo = false;
    if (!ok) return;
  }
  if (d.open) d.close();
}

// Da chiamare una volta all'avvio.
export function preparaPannelli() {
  const d = pannello();
  d.addEventListener('click', e => {
    if (e.target.closest('[data-chiudi]')) { chiudiSeVuole(); return; }
    // Tocco sullo sfondo scuro (cioè sul <dialog> stesso e non sul suo contenuto): chiude,
    // ma non se hai già scritto qualcosa: un tocco fuori per sbaglio non deve far perdere il testo.
    if (e.target === d && !d.dataset.scritto) d.close();
  });
  d.addEventListener('input', () => { d.dataset.scritto = '1'; });
  // "cancel" = Esc sulla tastiera, oppure il tasto/gesto indietro di Android
  d.addEventListener('cancel', e => {
    if (d.dataset.scritto && !conBozza) { e.preventDefault(); chiudiSeVuole(); }
  });
  d.addEventListener('close', () => {
    d.innerHTML = '';
    delete d.dataset.scritto;
    fermaTocchi();
    const fn = dopoChiusura; dopoChiusura = null;
    if (fn) fn();
  });
}

// Chiede conferma prima di un'azione che non si può annullare. Restituisce una promessa: true = confermato.
//   const ok = await conferma('Eliminare il libro?', { ok: 'Elimina' });
export function conferma(messaggio, { ok = 'Elimina', annulla = 'Annulla', dettaglio = '' } = {}) {
  const d = document.getElementById('conferma');
  if (d.open) d.close('no'); // una sola domanda alla volta
  d.innerHTML = `
    <p id="conferma-testo"><b>${esc(messaggio)}</b>${dettaglio ? `<br><span class="tenue">${esc(dettaglio)}</span>` : ''}</p>
    <div class="azioni">
      <button type="button" class="bottone bottone--secondario" value="no" autofocus>${esc(annulla)}</button>
      <button type="button" class="bottone" value="si">${esc(ok)}</button>
    </div>`;
  return new Promise(risolvi => {
    const tocco = e => {
      const b = e.target.closest('button');
      if (b) { d.close(b.value); return; }
      // tocco fuori dalla finestra (sullo sfondo scuro): vale come "no". Un tocco nel margine bianco, no.
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close('no');
    };
    d.addEventListener('click', tocco);
    d.addEventListener('close', () => { d.removeEventListener('click', tocco); fermaTocchi(); risolvi(d.returnValue === 'si'); d.innerHTML = ''; }, { once: true });
    d.returnValue = 'no';
    fermaTocchi();
    d.showModal();
  });
}
// Chiude la finestra di conferma come se si fosse risposto "no" (si usa quando cambia schermata).
export function chiudiConferma() {
  const d = document.getElementById('conferma');
  if (d.open) d.close('no');
}
