// Schermata "Statistiche": quanto hai letto in un anno, mese per mese, e l'attività delle ultime settimane.
import { data } from '../dati.js';
import { ui } from '../stato.js';
import { esc, oggi, num, durata, decimale, dataDi, GIORNI, MESI, MESI_BREVI, maiuscola, plurale } from '../utili.js';
import { icona } from '../icone.js';
import { statisticheAnno, anniConDati, obiettivoAnno, grigliaAttivita, serie, ritmo, giornoPreferito, riepilogoParole } from '../calcoli.js';
import { registraVista, registraAzioni, render } from './comune.js';
import { rigaLibro } from './libreria.js';

// ---------- grafico a colonne: un mese per colonna ----------
function grafico(s, anno) {
  // si mostrano le pagine; se in tutto l'anno non hai mai segnato pagine ma solo minuti, i minuti
  const conPagine = s.pagine > 0;
  const valori = s.mesi.map(m => (conPagine ? m.pagine : m.minuti));
  const massimo = Math.max(...valori);
  if (!massimo) return '';
  const meseMax = valori.indexOf(massimo);
  const testo = v => (conPagine ? num(v) : durata(v));
  return `<section class="scheda sezione">
    <h2 class="titolo-scheda">${conPagine ? 'Pagine lette' : 'Tempo di lettura'} mese per mese</h2>
    <div class="colonne" role="group" aria-label="Un pulsante per mese: toccalo per vedere i numeri">
      ${valori.map((v, i) => `<button type="button" class="colonna${i === meseMax ? ' massimo' : ''}${v ? '' : ' vuota'}" data-azione="mese" data-id="${i}" aria-pressed="false" aria-label="${MESI[i]}: ${conPagine ? plurale(v, 'pagina', 'pagine') : durata(v)}">
        ${i === meseMax ? `<em style="bottom:calc(${(v / massimo) * 100}% + 4px)">${testo(v)}</em>` : ''}
        <i style="height:${v ? Math.max(2, (v / massimo) * 100) : 0}%"></i>
      </button>`).join('')}
    </div>
    <div class="mesi" aria-hidden="true">${MESI_BREVI.map(m => `<span>${m.charAt(0).toUpperCase()}</span>`).join('')}</div>
    <p class="tenue piccolo" id="dettaglio-mese" aria-live="polite" style="margin-top:10px;min-height:1.45em">Tocca una colonna per vedere quel mese.</p>
    <details style="margin-top:6px">
      <summary class="bottone-testo" style="display:inline-flex;cursor:pointer">Vedi tutti i numeri</summary>
      <table class="tabella">
        <caption class="sr-only">Lettura mese per mese nel ${anno}</caption>
        <thead><tr><th scope="col">Mese</th><th scope="col">Pagine</th><th scope="col">Tempo</th><th scope="col">Libri finiti</th></tr></thead>
        <tbody>${s.mesi.map((m, i) => `<tr><th scope="row">${maiuscola(MESI[i])}</th><td>${num(m.pagine)}</td><td>${m.minuti ? durata(m.minuti) : '0'}</td><td>${m.libri}</td></tr>`).join('')}</tbody>
      </table>
    </details>
  </section>`;
}

function fraseMese(s, i) {
  const m = s.mesi[i];
  const pezzi = [m.pagine ? plurale(m.pagine, 'pagina', 'pagine') : '', m.minuti ? durata(m.minuti) + ' di lettura' : '', m.libri ? plurale(m.libri, 'libro finito', 'libri finiti') : ''].filter(Boolean);
  return `${maiuscola(MESI[i])}: ${pezzi.length ? pezzi.join(', ') : 'nessuna lettura'}.`;
}

// ---------- griglia delle ultime settimane ----------
function griglia() {
  const settimane = grigliaAttivita(data.letture, oggi(), 18);
  const s = serie(data.letture, oggi());
  return `<section class="scheda sezione">
    <h2 class="titolo-scheda">Le ultime 18 settimane</h2>
    <p class="tenue piccolo">Ogni quadratino è un giorno, da lunedì (in alto) a domenica. Più è scuro, più hai letto.</p>
    <div class="griglia" style="grid-template-columns:repeat(18,1fr)" role="group" aria-label="Un pulsante per giorno: con le frecce ti sposti da un giorno all’altro">
      ${settimane.map(sett => sett.map(g => g.futuro ? '<i class="futuro"></i>'
        // con il tasto Tab si arriva solo a oggi (tabindex 0); gli altri giorni si raggiungono con le frecce
        : `<button type="button" class="l${g.livello}" tabindex="${g.giorno === oggi() ? 0 : -1}" data-azione="giorno" data-id="${g.giorno}" data-minuti="${g.minuti}" data-pagine="${g.pagine}" aria-label="${esc(etichettaGiorno(g))}"></button>`).join('')).join('')}
    </div>
    <div class="legenda" aria-hidden="true"><span>meno</span><i class="l0"></i><i class="l1"></i><i class="l2"></i><i class="l3"></i><i class="l4"></i><span>più</span></div>
    <p class="tenue piccolo" id="dettaglio-giorno" aria-live="polite" style="min-height:1.45em">Tocca un giorno per vedere quanto hai letto.</p>
    <dl class="elenco-dati" style="margin-top:8px">
      <div><dt>Serie di adesso</dt><dd>${plurale(s.attuale, 'giorno', 'giorni')}</dd></div>
      <div><dt>Serie più lunga</dt><dd>${plurale(s.record, 'giorno', 'giorni')}</dd></div>
    </dl>
  </section>`;
}

function etichettaGiorno(g) {
  const d = dataDi(g.giorno);
  const quando = `${maiuscola(GIORNI[d.getDay()])} ${d.getDate()} ${MESI[d.getMonth()]}`;
  const pezzi = [g.minuti ? durata(Number(g.minuti)) : '', Number(g.pagine) ? plurale(Number(g.pagine), 'pagina', 'pagine') : ''].filter(Boolean);
  return `${quando}: ${pezzi.length ? pezzi.join(', ') : 'nessuna lettura'}`;
}

// Il tempo nel riquadro in alto: numeri grandi, unità piccole ("22 h 22 min").
function tempoGrande(minuti) {
  const h = Math.floor(minuti / 60), m = Math.round(minuti % 60);
  return (h ? `${num(h)}<small> h</small> ` : '') + `${m}<small> min</small>`;
}

// ---------- la schermata ----------
function vista() {
  const adesso = oggi();
  const anni = anniConDati(data, adesso);
  if (!ui.anno || !anni.includes(ui.anno)) ui.anno = adesso.slice(0, 4);
  const anno = ui.anno;
  const s = statisticheAnno(data, anno);
  const i = anni.indexOf(anno); // anni è dal più recente al più vecchio
  const scegliAnno = `<div class="anno">
    <button type="button" class="tonda" data-azione="anno" data-id="${anni[i + 1] || ''}" ${anni[i + 1] ? '' : 'disabled'} aria-label="Anno precedente">${icona('indietro')}</button>
    <b>${anno}</b>
    <button type="button" class="tonda" data-azione="anno" data-id="${anni[i - 1] || ''}" ${anni[i - 1] ? '' : 'disabled'} aria-label="Anno successivo">${icona('avanti')}</button>
  </div>`;

  if (!data.libri.length) {
    return `<header class="testata"><h1 class="titolo-pagina">Statistiche</h1></header>
      <div class="vuoto"><h2 class="titolo-scheda">Ancora niente da contare</h2>
      <p>Aggiungi un libro e segna le pagine man mano: qui vedrai quanto leggi, mese dopo mese.</p>
      <button type="button" class="bottone" data-azione="aggiungi-libro">${icona('piu')}Aggiungi un libro</button></div>`;
  }

  const o = obiettivoAnno(s.finiti.length, data.impostazioni.obiettivi[anno], anno, adesso);
  const statoObiettivo = o && {
    'raggiunto': 'Obiettivo raggiunto.', 'in-linea': 'Sei in linea.', 'avanti': `Sei avanti di ${o.scarto}.`,
    'indietro': `Per essere in linea te ne ${-o.scarto === 1 ? 'manca 1' : 'mancano ' + -o.scarto}.`,
    'mancato': `Obiettivo non raggiunto: te ne ${o.obiettivo - o.finiti === 1 ? 'mancava 1' : 'mancavano ' + (o.obiettivo - o.finiti)}.`
  }[o.stato];
  const velocita = ritmo(data.letture);
  const preferito = giornoPreferito(data.letture);
  const parole = riepilogoParole(data.parole, adesso);
  const riassunti = data.libri.reduce((t, l) => t + l.capitoli.filter(c => c.riassunto.trim()).length, 0);
  const citazioni = data.libri.reduce((t, l) => t + l.citazioni.length, 0);

  const numeri = [
    ['Velocità media', velocita ? `${decimale(velocita)} pagine all’ora` : ''],
    ['Giorno in cui leggi di più', preferito !== null ? maiuscola(GIORNI[preferito]) : ''],
    [`Voto medio del ${anno}`, s.votoMedio ? `${decimale(s.votoMedio)} su 5` : ''],
    [`Il più lungo del ${anno}`, s.piuLungo ? `${s.piuLungo.titolo} (${num(s.piuLungo.pagine)} pagine)` : ''],
    [`Autore più letto del ${anno}`, s.autori[0] && s.autori[0].n > 1 ? `${s.autori[0].nome} (${s.autori[0].n} libri)` : ''],
    ['Riassunti di capitoli scritti', riassunti ? num(riassunti) : ''],
    ['Parole nuove raccolte', parole.totale ? `${num(parole.totale)}${parole.imparate ? ` (${parole.imparate} ${parole.imparate === 1 ? 'imparata' : 'imparate'})` : ''}` : ''],
    ['Citazioni salvate', citazioni ? num(citazioni) : '']
  ].filter(r => r[1]);

  return `
    <header class="testata"><h1 class="titolo-pagina">Statistiche</h1>${scegliAnno}</header>
    <div class="quattro">
      <section class="scheda dato"><b>${num(s.finiti.length)}</b><span>${s.finiti.length === 1 ? 'libro finito' : 'libri finiti'}</span></section>
      <section class="scheda dato"><b>${num(s.pagine)}</b><span>${s.pagine === 1 ? 'pagina letta' : 'pagine lette'}</span></section>
      <section class="scheda dato"><b>${tempoGrande(s.minuti)}</b><span>di lettura</span></section>
      <section class="scheda dato"><b>${num(s.giorni)}</b><span>${s.giorni === 1 ? 'giorno di lettura' : 'giorni di lettura'}</span></section>
    </div>
    ${o ? `<section class="scheda" style="margin-top:12px">
      <div class="riga-titolo" style="margin-bottom:0"><h2 class="titolo-scheda">Obiettivo: ${o.finiti} di ${o.obiettivo} libri</h2>
        <button type="button" class="bottone-testo" data-azione="obiettivo" data-id="${anno}">Cambia</button></div>
      <div class="barra" style="--p:${o.percento}%"></div>
      <p class="tenue piccolo" style="margin-top:8px">${statoObiettivo}</p>
    </section>` : ''}
    ${grafico(s, anno)}
    ${griglia()}
    ${numeri.length ? `<section class="sezione"><h2 class="titolo-sezione">In numeri</h2>
      <dl class="elenco-dati">${numeri.map(([n, v]) => `<div><dt>${esc(n)}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl></section>` : ''}
    <section class="sezione"><h2 class="titolo-sezione">Letti nel ${anno}</h2>
      ${s.finiti.length ? `<ul>${s.finiti.map(l => rigaLibro(l)).join('')}</ul>` : `<p class="tenue">Nessun libro finito nel ${anno}${anno === adesso.slice(0, 4) ? ', per ora' : ''}.</p>`}
    </section>`;
}

registraVista('statistiche', vista);

// Nella griglia dei giorni le frecce della tastiera spostano il fuoco: su e giù di un giorno, sinistra e destra di una settimana.
document.addEventListener('keydown', e => {
  const passo = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[e.key];
  const qui = passo && e.target.closest ? e.target.closest('.griglia button') : null;
  if (!qui) return;
  const celle = [...qui.parentElement.children], i = celle.indexOf(qui);
  // su e giù non escono dalla settimana (la colonna)
  if ((passo === -1 && i % 7 === 0) || (passo === 1 && i % 7 === 6)) return;
  const dove = celle[i + passo];
  if (dove && dove.tagName === 'BUTTON') { e.preventDefault(); dove.focus(); dove.click(); }
});

registraAzioni({
  'anno': el => { if (el.dataset.id) { ui.anno = el.dataset.id; render(); } },
  // tocco su una colonna o su un giorno: si aggiorna solo la riga di testo sotto il grafico
  'mese': el => {
    for (const c of el.parentElement.children) c.setAttribute('aria-pressed', c === el);
    document.getElementById('dettaglio-mese').textContent = fraseMese(statisticheAnno(data, ui.anno), Number(el.dataset.id));
  },
  'giorno': el => {
    for (const c of el.parentElement.querySelectorAll('[aria-pressed="true"]')) c.removeAttribute('aria-pressed');
    el.setAttribute('aria-pressed', 'true');
    document.getElementById('dettaglio-giorno').textContent = etichettaGiorno({ giorno: el.dataset.id, minuti: el.dataset.minuti, pagine: el.dataset.pagine }) + '.';
  }
});
