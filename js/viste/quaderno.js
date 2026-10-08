// Schermata "Quaderno": tutte le parole nuove (con il ripasso) e tutte le citazioni, di tutti i libri.
import { data } from '../dati.js';
import { ui } from '../stato.js';
import { esc, oggi, plurale, giorniTra } from '../utili.js';
import { icona } from '../icone.js';
import { cercaParole, daRipassare, riepilogoParole } from '../calcoli.js';
import { registraVista, registraAzioni, registraScritture, render } from './comune.js';
import { voceParola, bloccoCitazione } from './elementi.js';
import { apriRipasso } from '../pannelli/ripasso.js';

// ---------- parole ----------
function elencoParole() {
  let parole = cercaParole(data.parole, ui.cercaParole);
  if (ui.libroParole === '-') parole = parole.filter(p => !p.libroId);
  else if (ui.libroParole) parole = parole.filter(p => p.libroId === ui.libroParole);
  if (!parole.length) return `<p class="tenue" style="padding:18px 0">Nessuna parola corrisponde a quello che cerchi.</p>`;
  // le più recenti in cima
  parole = [...parole].sort((a, b) => b.data.localeCompare(a.data));
  return `<ul>${parole.map(p => voceParola(p)).join('')}</ul>`;
}

function invitoRipasso() {
  const adesso = oggi();
  const n = daRipassare(data.parole, adesso).length;
  if (n) {
    return `<section class="scheda invito">
      <p>${plurale(n, 'parola', 'parole')} da ripassare<small>Guardi la parola, provi a ricordare, giri la scheda.</small></p>
      <button type="button" class="bottone bottone--piccolo" data-azione="ripassa">${icona('ripasso')}Ripassa</button>
    </section>`;
  }
  // niente per oggi: si dice quando sarà il prossimo ripasso
  const prossimo = data.parole.map(p => p.prossimo).sort()[0];
  const tra = giorniTra(adesso, prossimo);
  const quante = data.parole.filter(p => p.prossimo === prossimo).length;
  return `<section class="scheda invito">
    <p>Per oggi sei a posto<small>Prossimo ripasso ${tra === 1 ? 'domani' : 'tra ' + tra + ' giorni'}: ${plurale(quante, 'parola', 'parole')}.</small></p>
    <button type="button" class="bottone bottone--secondario bottone--piccolo" data-azione="allenati">Allenati</button>
  </section>`;
}

function sezioneParole() {
  if (!data.parole.length) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Il quaderno è vuoto</h2>
      <p>Ogni parola che non conosci è un’occasione: scrivila qui con il significato e la frase in cui l’hai trovata. Poi l’app te la fa ripassare finché non è tua.</p>
      <button type="button" class="bottone" data-azione="nuova-parola">${icona('piu')}Aggiungi la prima parola</button></div>`;
  }
  const r = riepilogoParole(data.parole, oggi());
  // menu per vedere le parole di un libro solo: compare se le parole vengono da almeno due "posti"
  const conParole = data.libri.filter(l => data.parole.some(p => p.libroId === l.id)).sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  const senzaLibro = data.parole.some(p => !p.libroId);
  const filtro = conParole.length + (senzaLibro ? 1 : 0) > 1 ? `
    <label class="campo" style="margin-bottom:6px"><span class="sr-only">Mostra le parole di</span>
      <select data-scrivi="libro-parole">
        <option value="">Tutti i libri</option>
        ${conParole.map(l => `<option value="${esc(l.id)}" ${ui.libroParole === l.id ? 'selected' : ''}>${esc(l.titolo)}</option>`).join('')}
        ${senzaLibro ? `<option value="-" ${ui.libroParole === '-' ? 'selected' : ''}>Senza libro</option>` : ''}
      </select></label>` : '';
  return `
    ${invitoRipasso()}
    <p class="tenue piccolo" style="margin:14px 0 12px">${plurale(r.totale, 'parola raccolta', 'parole raccolte')}${r.imparate ? `, ${r.imparate === 1 ? '1 imparata' : r.imparate + ' imparate'}` : ''}. Le tacche accanto a ogni parola dicono quanto bene la conosci.</p>
    ${data.parole.length > 5 ? `<div class="cerca">${icona('cerca')}
      <input type="search" data-scrivi="cerca-parole" value="${esc(ui.cercaParole)}" placeholder="Cerca una parola" aria-label="Cerca una parola" autocomplete="off" autocapitalize="none"></div>` : ''}
    ${filtro}
    <div id="elenco-parole">${elencoParole()}</div>`;
}

// ---------- citazioni ----------
function sezioneCitazioni() {
  const tutte = data.libri.flatMap(l => l.citazioni.map(c => ({ c, l })));
  if (!tutte.length) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Nessuna citazione</h2>
      <p>Le frasi che ti colpiscono mentre leggi finiscono qui, ognuna con il suo libro e la sua pagina.</p>
      ${data.libri.length ? `<button type="button" class="bottone" data-azione="nuova-citazione">${icona('piu')}Aggiungi una citazione</button>` : ''}</div>`;
  }
  const preferite = tutte.filter(x => x.c.preferita).length;
  let lista = ui.soloPreferite ? tutte.filter(x => x.c.preferita) : tutte;
  lista = lista.sort((a, b) => b.c.data.localeCompare(a.c.data));
  return `
    ${preferite ? `<div class="segmenti" role="group" aria-label="Quali citazioni mostrare" style="margin-bottom:4px">
      <button type="button" class="segmento" data-azione="solo-preferite" data-id="no" aria-pressed="${!ui.soloPreferite}">Tutte<span class="numero">${tutte.length}</span></button>
      <button type="button" class="segmento" data-azione="solo-preferite" data-id="si" aria-pressed="${ui.soloPreferite}">Preferite<span class="numero">${preferite}</span></button>
    </div>` : ''}
    ${lista.length ? `<ul>${lista.map(x => bloccoCitazione(x.c, x.l)).join('')}</ul>` : '<p class="tenue" style="padding:18px 0">Nessuna citazione tra le preferite.</p>'}`;
}

function vista() {
  if (ui.libroParole && ui.libroParole !== '-' && !data.parole.some(p => p.libroId === ui.libroParole)) ui.libroParole = '';
  const nCitazioni = data.libri.reduce((s, l) => s + l.citazioni.length, 0);
  const parole = ui.quaderno === 'parole';
  return `
    <header class="testata">
      <h1 class="titolo-pagina">Quaderno</h1>
      ${parole
        ? (data.parole.length ? `<button type="button" class="bottone bottone--piccolo" data-azione="nuova-parola">${icona('piu')}Parola</button>` : '')
        : (nCitazioni ? `<button type="button" class="bottone bottone--piccolo" data-azione="nuova-citazione">${icona('piu')}Citazione</button>` : '')}
    </header>
    <div class="segmenti" role="group" aria-label="Sezioni del quaderno">
      <button type="button" class="segmento" data-azione="quaderno" data-id="parole" aria-pressed="${parole}">Parole nuove<span class="numero">${data.parole.length}</span></button>
      <button type="button" class="segmento" data-azione="quaderno" data-id="citazioni" aria-pressed="${!parole}">Citazioni<span class="numero">${nCitazioni}</span></button>
    </div>
    ${parole ? sezioneParole() : sezioneCitazioni()}`;
}

registraVista('quaderno', vista);

registraAzioni({
  'quaderno': el => { ui.quaderno = el.dataset.id; render(); },
  'solo-preferite': el => { ui.soloPreferite = el.dataset.id === 'si'; render(); },
  'allenati': () => apriRipasso({ allenamento: true })
});

registraScritture({
  'cerca-parole': el => { ui.cercaParole = el.value; document.getElementById('elenco-parole').innerHTML = elencoParole(); },
  'libro-parole': el => { ui.libroParole = el.value; document.getElementById('elenco-parole').innerHTML = elencoParole(); }
});
