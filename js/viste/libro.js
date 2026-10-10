// La pagina di un libro: copertina e dati, la lista in cui sta, l'avanzamento, e le sue sezioni
// (riassunti dei capitoli, parole, citazioni, diario delle letture, scheda).
import { data, libro, cambiaStato, eliminaLibro, ripristinaLibro, eliminaLettura, cambiaPreferita } from '../dati.js';
import { ui } from '../stato.js';
import { esc, escRighe, dataTesto, ilGiorno, plurale, durata } from '../utili.js';
import { icona } from '../icone.js';
import { STATI, NOME_STATO_LIBRO, NOMI_STATO } from '../migrazione.js';
import { percento, capitoliInOrdine, prossimoCapitolo, pagineDi } from '../calcoli.js';
import { libroInMarkdown, nomeCapitolo, nomeFile } from '../markdown.js';
import { copertina, nastro, stelle, registraVista, registraAzioni, registraScritture, render, vai, avviso } from './comune.js';
import { voceParola, bloccoCitazione, copia, scarica } from './elementi.js';
import { fraseStima, azioniLettura } from './oggi.js';
import { apriGiudizio } from '../pannelli/giudizio.js';
import { apriCapitolo } from '../pannelli/capitolo.js';
import { apriCitazione } from '../pannelli/citazione.js';
import { apriParola } from '../pannelli/parola.js';
import { apriModificaLibro } from '../pannelli/libro-form.js';
import { apriLetturaManuale } from '../pannelli/lettura-form.js';
import { conferma } from '../pannelli/pannello.js';

const SEZIONI = [['capitoli', 'Capitoli'], ['parole', 'Parole'], ['citazioni', 'Citazioni'], ['diario', 'Diario'], ['scheda', 'Scheda']];
const LUNGO = 480; // oltre questi caratteri un riassunto si mostra accorciato, con "Leggi tutto"

// ---------- il riquadro in alto: lista e avanzamento ----------
function riquadroStato(l) {
  const p = percento(l);
  let sotto = '';
  if (l.stato === 'leggendo') {
    const frase = fraseStima(l);
    sotto = `
      <div class="avanzamento" style="margin-top:14px">
        <span>Pagina <b>${l.pagina}</b>${l.pagine ? ' di ' + l.pagine : ''}</span>${p !== null ? `<span>${p}%</span>` : ''}
      </div>
      ${nastro(l)}
      ${frase ? `<p class="stima">${esc(frase)}</p>` : ''}
      ${azioniLettura(l)}`;
  } else if (l.stato === 'letto') {
    sotto = `
      <p style="margin-top:12px">${l.voto ? stelle(l.voto) + ' ' : ''}<span class="tenue">${l.finito ? 'Finito ' + ilGiorno(l.finito) : ''}</span></p>
      ${l.recensione.trim() ? `<div class="lettura" style="margin-top:10px;white-space:pre-wrap">${esc(l.recensione)}</div>` : ''}
      <button type="button" class="bottone-testo" data-azione="giudizio" data-id="${esc(l.id)}" style="margin-top:6px">${icona('matita')}${l.voto || l.recensione.trim() ? 'Cambia voto e pensieri' : 'Dai un voto e scrivi cosa ti ha lasciato'}</button>`;
  } else if (l.stato === 'abbandonato') {
    sotto = `<p class="tenue" style="margin-top:12px">${l.pagina ? `Lasciato a pagina ${l.pagina}` : 'Lasciato'}${l.finito ? ' ' + ilGiorno(l.finito) : ''}.</p>
      <div class="azioni" style="margin-top:12px"><button type="button" class="bottone bottone--secondario" data-azione="inizia" data-id="${esc(l.id)}">Riprendilo</button></div>`;
  } else {
    sotto = `${l.nota.trim() ? `<p style="margin-top:12px">${escRighe(l.nota)}</p>` : ''}
      <div class="azioni" style="margin-top:12px"><button type="button" class="bottone" data-azione="inizia" data-id="${esc(l.id)}">${icona('libro')}Inizia a leggerlo</button></div>`;
  }
  return `<section class="scheda">
    <div class="stato-libro">
      <div class="stato-scelta">
        <label for="stato-libro" class="etichetta" style="margin:0">Lista</label>
        <select id="stato-libro" data-scrivi="stato-libro" data-id="${esc(l.id)}">
          ${STATI.map(s => `<option value="${s}" ${s === l.stato ? 'selected' : ''}>${NOME_STATO_LIBRO[s]}</option>`).join('')}
        </select>
      </div>
      <button type="button" class="bottone-testo togli" data-azione="elimina-libro" data-id="${esc(l.id)}">${icona('cestino')}Togli</button>
    </div>
    ${sotto}
  </section>`;
}

// ---------- sezioni ----------
function sezioneCapitoli(l) {
  const capitoli = capitoliInOrdine(l);
  const prossimo = prossimoCapitolo(l);
  const bottone = `<button type="button" class="bottone bottone--secondario bottone--largo" data-azione="nuovo-capitolo" data-id="${esc(l.id)}">${icona('piu')}Riassumi il capitolo ${prossimo}</button>`;
  if (!capitoli.length) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Nessun riassunto</h2>
      <p>Due righe alla fine di ogni capitolo: tra un mese ti ricorderai ancora cosa succede.</p>
      <button type="button" class="bottone" data-azione="nuovo-capitolo" data-id="${esc(l.id)}">${icona('piu')}Riassumi il capitolo 1</button></div>`;
  }
  return `${bottone}
    <ol style="margin-top:12px">${capitoli.map(c => {
      const nome = nomeCapitolo(c);
      const lungo = c.riassunto.length > LUNGO, aperto = ui.capitoliAperti.has(c.id);
      const sopra = [c.numero > 0 && c.titolo ? nome : '', c.finoAPagina ? 'fino a pagina ' + c.finoAPagina : ''].filter(Boolean).join(', ');
      return `<li class="capitolo">
        <div class="capitolo-testa">
          <div>${sopra ? `<p class="sopra">${esc(sopra)}</p>` : ''}<h3>${esc(c.numero > 0 && c.titolo ? c.titolo : nome)}</h3></div>
          <button type="button" class="tonda tonda--nuda" data-azione="apri-capitolo" data-libro="${esc(l.id)}" data-id="${esc(c.id)}" aria-label="Modifica il riassunto di ${esc(nome)}">${icona('matita')}</button>
        </div>
        ${c.riassunto.trim()
          ? `<p class="lettura${lungo && !aperto ? ' accorciato' : ''}">${esc(c.riassunto)}</p>
             ${lungo ? `<button type="button" class="bottone-testo" data-azione="espandi-capitolo" data-id="${esc(c.id)}" aria-expanded="${aperto}">${aperto ? 'Riduci' : 'Leggi tutto'}</button>` : ''}`
          : '<p class="da-scrivere">Ancora da riassumere.</p>'}
      </li>`;
    }).join('')}</ol>`;
}

function sezioneParole(l) {
  const parole = data.parole.filter(p => p.libroId === l.id).sort((a, b) => (a.pagina ?? 1e9) - (b.pagina ?? 1e9) || a.data.localeCompare(b.data));
  if (!parole.length) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Nessuna parola nuova</h2>
      <p>Quando incontri una parola che non conosci, scrivila qui con la frase in cui l’hai trovata.</p>
      <button type="button" class="bottone" data-azione="nuova-parola" data-id="${esc(l.id)}">${icona('piu')}Aggiungi una parola</button></div>`;
  }
  return `<button type="button" class="bottone bottone--secondario bottone--largo" data-azione="nuova-parola" data-id="${esc(l.id)}">${icona('piu')}Aggiungi una parola</button>
    <ul style="margin-top:6px">${parole.map(p => voceParola(p, { conLibro: false })).join('')}</ul>`;
}

function sezioneCitazioni(l) {
  if (!l.citazioni.length) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Nessuna citazione</h2>
      <p>Le frasi che sottolineeresti a matita: ricopiale qui per ritrovarle.</p>
      <button type="button" class="bottone" data-azione="nuova-citazione" data-id="${esc(l.id)}">${icona('piu')}Aggiungi una citazione</button></div>`;
  }
  const citazioni = [...l.citazioni].sort((a, b) => (a.pagina ?? 1e9) - (b.pagina ?? 1e9) || a.data.localeCompare(b.data));
  return `<button type="button" class="bottone bottone--secondario bottone--largo" data-azione="nuova-citazione" data-id="${esc(l.id)}">${icona('piu')}Aggiungi una citazione</button>
    <ul style="margin-top:6px">${citazioni.map(c => bloccoCitazione(c, l, { conLibro: false })).join('')}</ul>`;
}

function sezioneDiario(l) {
  // dalla più recente; nello stesso giorno, l'ultima registrata in cima
  const letture = data.letture.filter(s => s.libroId === l.id).reverse().sort((a, b) => b.giorno.localeCompare(a.giorno));
  const bottone = `<button type="button" class="bottone bottone--secondario bottone--largo" data-azione="lettura-manuale" data-id="${esc(l.id)}">${icona('piu')}Aggiungi una lettura a mano</button>`;
  if (!letture.length) {
    return `<div class="vuoto"><h2 class="titolo-scheda">Nessuna lettura registrata</h2>
      <p>Qui compaiono le volte che hai letto questo libro: con il cronometro, aggiornando la pagina o aggiungendole a mano.</p>
      <button type="button" class="bottone" data-azione="lettura-manuale" data-id="${esc(l.id)}">${icona('piu')}Aggiungi una lettura</button></div>`;
  }
  const minuti = letture.reduce((s, x) => s + x.minuti, 0), pagine = letture.reduce((s, x) => s + pagineDi(x), 0);
  const giorni = new Set(letture.map(x => x.giorno)).size;
  return `<p class="tenue" style="margin-bottom:12px">${[plurale(giorni, 'giorno di lettura', 'giorni di lettura'), minuti ? durata(minuti) + ' di lettura' : '', pagine ? plurale(pagine, 'pagina', 'pagine') : ''].filter(Boolean).join(', ')}.</p>
    ${bottone}
    <ul style="margin-top:6px">${letture.map(s => {
      const n = pagineDi(s);
      const cosa = [s.minuti ? durata(s.minuti) : '', n ? plurale(n, 'pagina', 'pagine') : ''].filter(Boolean).join(', ');
      return `<li class="lettura-riga">
        <div><b>${esc(cosa)}</b><span>${esc(dataTesto(s.giorno, { breve: true }))}${n ? `, da pagina ${s.da} a ${s.a}` : ''}</span></div>
        <button type="button" class="tonda tonda--nuda" data-azione="elimina-lettura" data-id="${esc(s.id)}" aria-label="Elimina la lettura ${esc(ilGiorno(s.giorno, {}, 'del'))}">${icona('cestino')}</button>
      </li>`;
    }).join('')}</ul>`;
}

function sezioneScheda(l) {
  const righe = [
    ['Aggiunto', dataTesto(l.aggiunto)],
    ['Già letto', l.finitoPrima.map(g => dataTesto(g)).join(', ')],
    ['Iniziato', l.iniziato ? dataTesto(l.iniziato) : ''],
    [l.stato === 'abbandonato' ? 'Abbandonato' : 'Finito', l.finito ? dataTesto(l.finito) : ''],
    ['Pagine', l.pagine || ''],
    ['Genere', l.genere],
    ['Editore', l.editore],
    ['Anno', l.anno || ''],
    ['ISBN', l.isbn]
  ].filter(r => r[1]);
  return `
    ${l.nota.trim() ? `<h2 class="titolo-scheda" style="margin-bottom:4px">Perché questo libro</h2><p style="margin-bottom:16px">${escRighe(l.nota)}</p>` : ''}
    <dl class="elenco-dati">${righe.map(([n, v]) => `<div><dt>${n}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>
    <div class="azioni" style="margin-top:16px">
      <button type="button" class="bottone bottone--secondario" data-azione="modifica-libro" data-id="${esc(l.id)}">${icona('matita')}Modifica il libro</button>
    </div>
    <h2 class="titolo-scheda" style="margin:24px 0 4px">Porta gli appunti in Obsidian</h2>
    <p class="tenue">Riassunti, citazioni, parole e pensieri di questo libro in una nota Markdown.</p>
    <div class="azioni" style="margin-top:12px">
      <button type="button" class="bottone bottone--secondario" data-azione="scarica-nota" data-id="${esc(l.id)}">${icona('scarica')}Scarica la nota</button>
      <button type="button" class="bottone bottone--secondario" data-azione="copia-nota" data-id="${esc(l.id)}">${icona('copia')}Copia il testo</button>
    </div>
    <div style="margin-top:22px"><button type="button" class="bottone-testo bottone-testo--pericolo" data-azione="elimina-libro" data-id="${esc(l.id)}">${icona('cestino')}Togli dalla libreria</button></div>`;
}

function vista(r) {
  const l = libro(r.id);
  if (!l) {
    return `<a class="torna" href="#/libreria">${icona('indietro')}Libreria</a>
      <div class="vuoto"><h1 class="titolo-scheda">Questo libro non c’è più</h1><p>Forse è stato eliminato.</p>
      <a class="bottone" href="#/libreria">Vai alla libreria</a></div>`;
  }
  // entrando in un libro diverso si riparte dalla sezione dei capitoli
  if (ui.libroAperto !== l.id) { ui.libroAperto = l.id; ui.sezioneLibro = 'capitoli'; ui.capitoliAperti = new Set(); }
  const nParole = data.parole.filter(p => p.libroId === l.id).length;
  const conta = { capitoli: l.capitoli.length, parole: nParole, citazioni: l.citazioni.length };
  const dettaglio = [l.editore, l.anno, l.pagine ? plurale(l.pagine, 'pagina', 'pagine') : '', l.genere].filter(Boolean).join(', ');
  const sezione = { capitoli: sezioneCapitoli, parole: sezioneParole, citazioni: sezioneCitazioni, diario: sezioneDiario, scheda: sezioneScheda }[ui.sezioneLibro] || sezioneCapitoli;
  return `
    <a class="torna" href="#/libreria" data-azione="vai-lista" data-id="${l.stato}">${icona('indietro')}${NOMI_STATO[l.stato]}</a>
    <header class="libro-testa">
      ${copertina(l, 'l')}
      <div>
        <h1>${esc(l.titolo)}</h1>
        ${l.autore ? `<p class="autore">${esc(l.autore)}</p>` : ''}
        ${dettaglio ? `<p class="dettaglio">${esc(dettaglio)}</p>` : ''}
      </div>
    </header>
    ${riquadroStato(l)}
    <div class="segmenti" role="group" aria-label="Sezioni del libro" style="margin-top:22px">
      ${SEZIONI.map(([id, nome]) => `<button type="button" class="segmento" data-azione="sezione-libro" data-id="${id}" aria-pressed="${id === ui.sezioneLibro}">${nome}${conta[id] ? `<span class="numero">${conta[id]}</span>` : ''}</button>`).join('')}
    </div>
    <section id="sezione-libro">${sezione(l)}</section>`;
}

registraVista('libro', vista);

registraAzioni({
  'sezione-libro': el => { ui.sezioneLibro = el.dataset.id; render(); },
  'espandi-capitolo': el => { const id = el.dataset.id; if (ui.capitoliAperti.has(id)) ui.capitoliAperti.delete(id); else ui.capitoliAperti.add(id); render(); },
  'apri-capitolo': el => apriCapitolo(el.dataset.libro, el.dataset.id),
  'apri-citazione': el => apriCitazione({ libroId: el.dataset.libro, citazioneId: el.dataset.id }),
  'apri-parola': el => apriParola({ parolaId: el.dataset.id }),
  'giudizio': el => apriGiudizio(el.dataset.id),
  'modifica-libro': el => apriModificaLibro(el.dataset.id),
  'lettura-manuale': el => apriLetturaManuale(el.dataset.id),
  'preferita': el => {
    const ora = cambiaPreferita(el.dataset.libro, el.dataset.id);
    render();
    avviso(ora ? 'Aggiunta alle preferite' : 'Tolta dalle preferite', { durata: 2000 });
  },
  'copia-citazione': async el => {
    const l = libro(el.dataset.libro), c = l && l.citazioni.find(x => x.id === el.dataset.id);
    if (!c) return;
    const testo = `«${c.testo.trim()}»\n${[l.autore, l.titolo].filter(Boolean).join(', ')}`;
    avviso((await copia(testo)) ? 'Citazione copiata' : 'Non riesco a copiare: selezionala a mano.');
  },
  'elimina-lettura': async el => {
    if (!(await conferma('Eliminare questa lettura dal diario?', { dettaglio: 'La pagina a cui sei arrivato non cambia.' }))) return;
    eliminaLettura(el.dataset.id); render(); avviso('Lettura eliminata');
  },
  'scarica-nota': el => {
    const l = libro(el.dataset.id);
    if (!l) return;
    scarica(nomeFile(l.titolo) + '.md', libroInMarkdown(l, data.parole), 'text/markdown');
    avviso('Nota scaricata: spostala nel tuo Second Brain');
  },
  'copia-nota': async el => {
    const l = libro(el.dataset.id);
    if (!l) return;
    avviso((await copia(libroInMarkdown(l, data.parole))) ? 'Testo copiato: incollalo in una nota' : 'Non riesco a copiare: usa “Scarica la nota”.');
  },
  // "Togli": il libro esce dalla libreria (da qualunque lista sia). Subito dopo si può ancora annullare.
  'elimina-libro': async el => {
    const l = libro(el.dataset.id);
    if (!l) return;
    const dentro = [l.capitoli.length ? plurale(l.capitoli.length, 'riassunto', 'riassunti') : '', l.citazioni.length ? plurale(l.citazioni.length, 'citazione', 'citazioni') : ''].filter(Boolean).join(' e ');
    const ok = await conferma(`Togliere “${l.titolo}” da “${NOMI_STATO[l.stato]}”?`, {
      ok: 'Togli',
      dettaglio: 'Esce dalla libreria' + (dentro ? `, con ${dentro}` : '') + '. Le parole imparate restano nel quaderno. Per spostarlo in un’altra lista, usa invece il menu “Lista”.'
    });
    if (!ok) return;
    const copia = eliminaLibro(l.id); ui.lista = l.stato;
    vai('#/libreria');
    avviso(`“${l.titolo}” tolto da “${NOMI_STATO[l.stato]}”`, { etichetta: 'Annulla', azione: () => { if (ripristinaLibro(copia)) { render(); avviso('Rimesso al suo posto'); } } });
  }
});

registraScritture({
  // il menu "Lista" in cima alla pagina del libro
  'stato-libro': async el => {
    const id = el.dataset.id, stato = el.value, l = libro(id);
    if (!l || stato === l.stato) return;
    if (stato === 'letto') { el.value = l.stato; apriGiudizio(id, { finisci: true }); return; } // prima il giorno e il voto
    // togliere un libro dai letti cambia cose che non si rimettono a posto con un tocco: prima si chiede
    if (l.stato === 'letto') {
      const quando = l.finito ? ` (${ilGiorno(l.finito)})` : '';
      const domanda = stato === 'leggendo'
        ? ['Rileggerlo da capo?', `Il segnalibro torna a pagina 0. Resta scritto che l’avevi già finito${quando}; voto e appunti non si toccano.`, 'Rileggilo']
        : stato === 'abbandonato'
          ? ['Spostarlo tra gli abbandonati?', `Non risulterà più tra i libri letti${quando}. Voto e appunti restano.`, 'Sposta']
          : [`Spostarlo in “${NOMI_STATO[stato]}”?`, `Non risulterà più tra i libri letti${quando} e il segnalibro torna a pagina 0. Voto e appunti restano.`, 'Sposta'];
      if (!(await conferma(domanda[0], { dettaglio: domanda[1], ok: domanda[2] }))) { el.value = l.stato; return; }
    }
    cambiaStato(id, stato); ui.lista = stato; render();
    avviso(stato === 'leggendo' ? 'Buona lettura' : `Spostato in “${NOMI_STATO[stato]}”`);
  }
});
