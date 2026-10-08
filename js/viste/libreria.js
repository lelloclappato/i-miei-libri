// Schermata "Libreria": le liste (sto leggendo, da leggere, voglio leggere, letti, abbandonati) e la ricerca.
import { data } from '../dati.js';
import { ui } from '../stato.js';
import { esc, plurale, ilGiorno } from '../utili.js';
import { icona } from '../icone.js';
import { STATI, NOMI_STATO, NOME_STATO_LIBRO } from '../migrazione.js';
import { libriDi, cercaLibri, percento } from '../calcoli.js';
import { copertina, stelle, registraVista, registraAzioni, registraScritture, render } from './comune.js';
import { apriAggiungiLibro } from '../pannelli/libro-form.js';

// Cosa c'è in ogni lista, in una riga: aiuta a distinguere "Da leggere" da "Voglio leggere".
const SPIEGAZIONE = {
  'da-leggere': 'Li hai già: aspettano il loro turno.',
  'voglio': 'Non li hai ancora: la tua lista dei desideri.'
};
const VUOTO = {
  'leggendo': ['Nessun libro in lettura', 'Scegli un libro da “Da leggere” e segna che lo stai leggendo, oppure aggiungine uno nuovo.'],
  'da-leggere': ['Nessun libro in attesa', 'Qui vanno i libri che hai già in casa e non hai ancora letto.'],
  'voglio': ['Nessun desiderio in lista', 'Qui vanno i libri che ti hanno consigliato o che hai visto in libreria: così non te li dimentichi.'],
  'letto': ['Nessun libro finito', 'Quando finisci un libro arriva qui, con il tuo voto e quello che ti ha lasciato.'],
  'abbandonato': ['Nessun libro abbandonato', 'Capita di lasciare un libro a metà: qui resta traccia di dove sei arrivato.']
};

// La riga piccola sotto titolo e autore, diversa per ogni lista.
function dettaglio(l, conStato) {
  const pezzi = [];
  if (conStato) pezzi.push(NOME_STATO_LIBRO[l.stato]);
  if (l.stato === 'leggendo') {
    pezzi.push(l.pagine ? `Pagina ${l.pagina} di ${l.pagine}` : l.pagina ? `Pagina ${l.pagina}` : 'Appena iniziato');
  } else if (l.stato === 'letto') {
    if (l.finito) pezzi.push('Finito ' + ilGiorno(l.finito, { breve: true }));
  } else if (l.stato === 'abbandonato') {
    pezzi.push(l.pagina ? `Lasciato a pagina ${l.pagina}` : 'Lasciato');
  } else if (l.pagine) {
    pezzi.push(plurale(l.pagine, 'pagina', 'pagine'));
  }
  return pezzi.join(', ');
}

export function rigaLibro(l, conStato = false) {
  const p = percento(l);
  return `<li><a class="riga-libro" href="#/libro/${esc(l.id)}">
    ${copertina(l)}
    <div>
      <h3>${esc(l.titolo)}</h3>
      ${l.autore ? `<p class="autore">${esc(l.autore)}</p>` : ''}
      <p class="dettaglio">${l.stato === 'letto' && l.voto ? stelle(l.voto) + ' ' : ''}${esc(dettaglio(l, conStato))}</p>
      ${l.stato === 'leggendo' && p !== null ? `<div class="mini-blocco" style="--p:${p}%"></div>` : ''}
    </div>
    ${icona('avanti')}
  </a></li>`;
}

function elenco() {
  const testo = ui.cercaLibri.trim();
  if (testo) {
    const trovati = cercaLibri(data.libri, testo).sort((a, b) => STATI.indexOf(a.stato) - STATI.indexOf(b.stato) || a.titolo.localeCompare(b.titolo));
    if (!trovati.length) {
      return `<div class="vuoto"><h2 class="titolo-scheda">Niente con “${esc(testo)}”</h2>
        <p>Nella tua libreria non c’è un libro con questo titolo o autore.</p>
        <button class="bottone" data-azione="aggiungi-libro" data-testo="${esc(testo)}">${icona('piu')}Cercalo e aggiungilo</button></div>`;
    }
    return `<p class="tenue piccolo">${plurale(trovati.length, 'libro trovato', 'libri trovati')} in tutta la libreria</p>
      <ul>${trovati.map(l => rigaLibro(l, true)).join('')}</ul>`;
  }
  const lista = libriDi(data.libri, ui.lista, data.letture);
  if (!lista.length) {
    const [titolo, frase] = VUOTO[ui.lista];
    return `<div class="vuoto"><h2 class="titolo-scheda">${titolo}</h2><p>${frase}</p>
      <button class="bottone" data-azione="aggiungi-libro" data-lista="${ui.lista}">${icona('piu')}Aggiungi un libro</button></div>`;
  }
  return `${SPIEGAZIONE[ui.lista] ? `<p class="tenue piccolo">${SPIEGAZIONE[ui.lista]}</p>` : ''}
    <ul>${lista.map(l => rigaLibro(l)).join('')}</ul>`;
}

function vista() {
  const conta = stato => data.libri.filter(l => l.stato === stato).length;
  // "Abbandonati" compare solo se ce n'è almeno uno
  const visibili = STATI.filter(s => s !== 'abbandonato' || conta(s) > 0 || ui.lista === s);
  return `
    <header class="testata">
      <h1 class="titolo-pagina">Libreria</h1>
      <button class="bottone bottone--piccolo" data-azione="aggiungi-libro" data-lista="${ui.lista}">${icona('piu')}Aggiungi</button>
    </header>
    ${data.libri.length ? `
    <div class="cerca">${icona('cerca')}
      <input type="search" data-scrivi="cerca-libri" value="${esc(ui.cercaLibri)}" placeholder="Cerca tra i tuoi libri" aria-label="Cerca tra i tuoi libri" autocomplete="off" enterkeyhint="search">
    </div>
    <div class="segmenti" role="group" aria-label="Liste">
      ${visibili.map(s => `<button class="segmento" data-azione="lista" data-id="${s}" aria-pressed="${s === ui.lista}">${NOMI_STATO[s]}<span class="numero">${conta(s)}</span></button>`).join('')}
    </div>` : ''}
    <div id="elenco-libri">${data.libri.length ? elenco() : `
      <div class="vuoto"><h2 class="titolo-scheda">La libreria è vuota</h2>
      <p>Comincia dal libro che stai leggendo adesso, o da quelli che aspettano sul comodino.</p>
      <button class="bottone" data-azione="aggiungi-libro">${icona('piu')}Aggiungi il primo libro</button></div>`}
    </div>`;
}

registraVista('libreria', vista);

registraAzioni({
  'lista': el => { ui.lista = el.dataset.id; ui.cercaLibri = ''; render(); },
  'aggiungi-libro': el => apriAggiungiLibro({ lista: el.dataset.lista || null, testo: el.dataset.testo || '' })
});

registraScritture({
  // mentre scrivi nella ricerca si ridisegna solo l'elenco: il campo resta dov'è e non perde il cursore
  'cerca-libri': el => { ui.cercaLibri = el.value; document.getElementById('elenco-libri').innerHTML = elenco(); }
});
