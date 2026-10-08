// Schermata "Libreria": le liste (sto leggendo, da leggere, voglio leggere, letti, abbandonati), la ricerca
// e "Per te", i libri consigliati.
import { data, aggiungiLibro, scartaConsiglio, riprendiConsiglio, dimenticaScartati } from '../dati.js';
import { ui } from '../stato.js';
import { esc, plurale, ilGiorno, quandoTesto, chiaveDi } from '../utili.js';
import { icona } from '../icone.js';
import { STATI, NOMI_STATO, NOME_STATO_LIBRO, coloreDaTitolo } from '../migrazione.js';
import { libriDi, cercaLibri, percento } from '../calcoli.js';
import { consigliSalvati, consigliVisibili, preparaConsigli, vannoRifatti, semi } from '../consigli.js';
import { copertina, stelle, registraVista, registraAzioni, registraScritture, render, rotta, vai, avviso, annuncia } from './comune.js';
import { pannelloAperto } from '../pannelli/pannello.js';
import { apriAggiungiLibro } from '../pannelli/libro-form.js';

const PER_TE = 'per-te'; // la scheda dei consigli, accanto alle liste

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

// ---------- Per te ----------

let preparando = null;      // i consigli si stanno preparando (una promessa), oppure null
let erroreConsigli = false; // l'ultimo tentativo non ha trovato la rete

// Avvia la preparazione dei consigli; quando ha finito ridisegna l'elenco, se lo stai ancora guardando.
function preparaPerTe() {
  if (preparando) return;
  erroreConsigli = false;
  preparando = preparaConsigli(data.libri)
    .then(r => { erroreConsigli = r.errore; })
    .catch(() => { erroreConsigli = true; })
    .finally(() => {
      preparando = null;
      const el = document.getElementById('elenco-libri');
      if (el && rotta().nome === 'libreria' && ui.lista === PER_TE && !ui.cercaLibri.trim()) {
        el.innerHTML = elenco();
        if (!pannelloAperto()) annuncia(erroreConsigli ? 'Non riesco a preparare i consigli' : 'Consigli pronti');
      }
    });
}

function rigaConsiglio(c) {
  const sotto = [c.anno, c.pagine ? plurale(c.pagine, 'pagina', 'pagine') : ''].filter(Boolean).join(', ');
  const trama = 'https://www.google.com/search?q=' + encodeURIComponent(`${c.titolo} ${c.autore.split(',')[0]} trama`);
  return `<li class="consiglio">
    ${copertina({ ...c, colore: coloreDaTitolo(c.titolo) })}
    <div>
      <h3>${esc(c.titolo)}</h3>
      ${c.autore ? `<p class="autore">${esc(c.autore)}</p>` : ''}
      <p class="motivo">${icona('scintille')}<span>${esc(c.motivo)}</span></p>
      ${sotto ? `<p class="dettaglio">${esc(sotto)} · <a href="${esc(trama)}" target="_blank" rel="noopener">Di cosa parla${icona('esterno')}</a></p>`
        : `<p class="dettaglio"><a href="${esc(trama)}" target="_blank" rel="noopener">Di cosa parla${icona('esterno')}</a></p>`}
      <div class="consiglio-azioni">
        <button type="button" class="bottone bottone--piccolo" data-azione="consiglio" data-lista="voglio" data-id="${esc(c.chiave)}">${icona('cuore')}Voglio leggerlo</button>
        <button type="button" class="bottone bottone--piccolo bottone--secondario" data-azione="consiglio" data-lista="da-leggere" data-id="${esc(c.chiave)}">Ce l’ho</button>
        <button type="button" class="bottone-testo" data-azione="consiglio-no" data-id="${esc(c.chiave)}" aria-label="Non mi interessa: ${esc(c.titolo)}">No, grazie</button>
      </div>
    </div>
  </li>`;
}

function elencoPerTe() {
  if (!semi(data.libri).some(s => s.peso > 0)) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Dimmi cosa ti piace</h2>
      <p>Segna il libro che stai leggendo, o aggiungi quelli che hai già letto con il loro voto: da lì capisco cosa consigliarti.</p>
      <button class="bottone" data-azione="aggiungi-libro" data-lista="letto">${icona('piu')}Aggiungi un libro letto</button></div>`;
  }
  const salvati = consigliSalvati();
  const visibili = consigliVisibili(salvati ? salvati.elenco : [], data.libri, data.scartati);
  // si rifanno se sono vecchi, se i tuoi gusti sono cambiati, o se ne restano pochi da mostrare
  // (ma non subito dopo un errore: si aspetta che tu tocchi "Riprova")
  if (!preparando && !erroreConsigli && (vannoRifatti(data.libri) || (visibili.length < 4 && salvati && Date.now() - salvati.quando > 3600000))) preparaPerTe();
  if (!visibili.length) {
    if (preparando) return `<div class="vuoto"><h2 class="titolo-scheda">Cerco libri per te…</h2>
      <p>Guardo i libri che ti sono piaciuti e cerco quelli simili. Ci vuole qualche secondo.</p></div>`;
    if (erroreConsigli) return `<div class="vuoto"><h2 class="titolo-scheda">Non riesco a preparare i consigli</h2>
      <p>Serve la connessione. A volte è il catalogo (Open Library) a essere lento: riprova tra poco.</p>
      <button class="bottone" data-azione="rifai-consigli">${icona('ripeti')}Riprova</button></div>`;
    return `<div class="vuoto"><h2 class="titolo-scheda">Per ora niente di nuovo</h2>
      <p>Non ho trovato libri da consigliarti che non hai già. Dai un voto ai libri che finisci: più ne so, meglio scelgo.</p>
      <button class="bottone" data-azione="rifai-consigli">${icona('ripeti')}Cerca di nuovo</button></div>`;
  }
  const quando = salvati ? quandoTesto(chiaveDi(new Date(salvati.quando))) : '';
  return `<p class="tenue piccolo">Scelti in base ai libri che ti sono piaciuti e a quello che stai leggendo.</p>
    ${erroreConsigli ? '<p class="nota-avviso">Non sono riuscito ad aggiornarli (manca la connessione?): sono quelli dell’ultima volta.</p>' : ''}
    <ul class="consigli">${visibili.map(rigaConsiglio).join('')}</ul>
    <p class="tenue piccolo piede-consigli">${preparando ? 'Sto aggiornando i consigli…' : `Aggiornati ${esc(quando)}. <button type="button" class="bottone-testo" data-azione="rifai-consigli">Aggiorna</button>`}
      ${data.scartati.length ? `<br>${plurale(data.scartati.length, 'consiglio scartato', 'consigli scartati')}. <button type="button" class="bottone-testo" data-azione="riproponi-scartati">Riproponili</button>` : ''}</p>`;
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
  if (ui.lista === PER_TE) return elencoPerTe();
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
      <button class="segmento segmento--per-te" data-azione="lista" data-id="${PER_TE}" aria-pressed="${ui.lista === PER_TE}">${icona('scintille')}Per te</button>
    </div>` : ''}
    <div id="elenco-libri">${data.libri.length ? elenco() : `
      <div class="vuoto"><h2 class="titolo-scheda">La libreria è vuota</h2>
      <p>Comincia dal libro che stai leggendo adesso, o da quelli che aspettano sul comodino.</p>
      <button class="bottone" data-azione="aggiungi-libro">${icona('piu')}Aggiungi il primo libro</button></div>`}
    </div>`;
}

registraVista('libreria', vista);

// Il consiglio con questa chiave, tra quelli salvati.
const consiglio = chiave => (consigliSalvati()?.elenco || []).find(c => c.chiave === chiave) || null;
function ridisegnaElenco() { const el = document.getElementById('elenco-libri'); if (el) el.innerHTML = elenco(); else render(); }

registraAzioni({
  // aprendo "Per te" dopo un errore di rete si riprova (ma non a ogni ridisegno: vedi elencoPerTe)
  'lista': el => { ui.lista = el.dataset.id; ui.cercaLibri = ''; if (ui.lista === PER_TE) erroreConsigli = false; render(); },
  // "Voglio leggerlo" / "Ce l'ho": il consiglio entra nella lista, con i dati che Open Library ha dato
  'consiglio': el => {
    const c = consiglio(el.dataset.id);
    if (!c) { ridisegnaElenco(); return; }
    const { titolo, autore, pagine, anno, editore, isbn, genere, copertina: img } = c;
    const l = aggiungiLibro({ titolo, autore, pagine, anno, editore, isbn, genere, copertina: img, origine: 'openlibrary', nota: `Dai consigli “Per te”: ${c.motivo}` }, el.dataset.lista);
    ridisegnaElenco();
    avviso(`Aggiunto a “${NOMI_STATO[l.stato]}”`, { etichetta: 'Apri', azione: () => vai('#/libro/' + l.id) });
  },
  'consiglio-no': el => {
    const chiave = el.dataset.id;
    scartaConsiglio(chiave);
    ridisegnaElenco();
    avviso('Non te lo propongo più', { etichetta: 'Annulla', azione: () => { riprendiConsiglio(chiave); ridisegnaElenco(); } });
  },
  'rifai-consigli': () => { erroreConsigli = false; preparaPerTe(); ridisegnaElenco(); },
  'riproponi-scartati': () => { dimenticaScartati(); ridisegnaElenco(); avviso('I consigli scartati possono tornare'); },
  'aggiungi-libro': el => apriAggiungiLibro({ lista: el.dataset.lista || null, testo: el.dataset.testo || '' })
});

registraScritture({
  // mentre scrivi nella ricerca si ridisegna solo l'elenco: il campo resta dov'è e non perde il cursore
  'cerca-libri': el => { ui.cercaLibri = el.value; document.getElementById('elenco-libri').innerHTML = elenco(); }
});
