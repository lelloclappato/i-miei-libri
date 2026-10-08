// Schermata "Oggi": il libro che stai leggendo con il suo nastro, le azioni veloci,
// le parole da ripassare, la serie di giorni e l'obiettivo dell'anno.
import { data, libro, avviaTimer, cambiaStato } from '../dati.js';
import { soloInMemoria } from '../deposito.js';
import { ui } from '../stato.js';
import { esc, oggi, dataDi, GIORNI, GIORNI_INIZIALI, MESI, maiuscola, durata, ilGiorno, plurale, giorniTra } from '../utili.js';
import { icona } from '../icone.js';
import { libriDi, percento, stima, serie, settimana, daRipassare, libriFiniti, obiettivoAnno } from '../calcoli.js';
import { copertina, nastro, registraVista, registraAzioni, render, vai, avviso } from './comune.js';
import { rigaLibro } from './libreria.js';
import { apriPagina, apriObiettivo } from '../pannelli/pagina.js';
import { apriCapitolo } from '../pannelli/capitolo.js';
import { apriParola } from '../pannelli/parola.js';
import { apriCitazione } from '../pannelli/citazione.js';
import { apriRipasso } from '../pannelli/ripasso.js';
import { apriGiudizio } from '../pannelli/giudizio.js';

// Frase sotto il nastro: quanto manca, e quando finirai andando avanti così.
export function fraseStima(l) {
  if (l.pagine && l.pagina >= l.pagine) return 'Sei arrivato all’ultima pagina.';
  if (!l.pagine) return 'Aggiungi il numero di pagine (in “Aggiorna la pagina”) per vedere a che punto sei.';
  const s = stima(l, data.letture, oggi());
  const pezzi = [];
  if (s.minuti) pezzi.push(`Ti mancano circa ${durata(s.minuti < 60 ? s.minuti : Math.round(s.minuti / 10) * 10)} di lettura.`);
  if (s.giorno) pezzi.push(`Di questo passo lo finisci ${s.giorno === oggi() ? 'oggi' : ilGiorno(s.giorno, { annoSempre: false })}.`);
  return pezzi.join(' ');
}

// Le tre azioni veloci, uguali in "Oggi" e nella schermata del cronometro.
export function azioniVeloci(id) {
  return `<div class="veloci">
    <button type="button" class="veloce" data-azione="nuovo-capitolo" data-id="${esc(id)}">${icona('documento')}Riassunto</button>
    <button type="button" class="veloce" data-azione="nuova-parola" data-id="${esc(id)}">${icona('scintille')}Parola</button>
    <button type="button" class="veloce" data-azione="nuova-citazione" data-id="${esc(id)}">${icona('citazione')}Citazione</button>
  </div>`;
}

// I due pulsanti sotto il nastro. Arrivato all'ultima pagina, il primo diventa "Segna come letto".
export function azioniLettura(l) {
  const inCorso = data.timer && data.timer.libroId === l.id;
  const finito = l.pagine && l.pagina >= l.pagine;
  return `<div class="azioni" style="margin-top:14px">
    ${finito
      ? `<button type="button" class="bottone" data-azione="finisci" data-id="${esc(l.id)}">${icona('fatto')}Segna come letto</button>`
      : `<button type="button" class="bottone" data-azione="leggi" data-id="${esc(l.id)}">${icona('timer')}${inCorso ? 'Torna al cronometro' : 'Leggi adesso'}</button>`}
    <button type="button" class="bottone bottone--secondario" data-azione="pagina" data-id="${esc(l.id)}">${icona('segnalibro')}Aggiorna la pagina</button>
  </div>`;
}

function schedaInLettura(l) {
  const p = percento(l);
  const frase = fraseStima(l);
  return `<article class="scheda">
    <div class="in-lettura">
      <a href="#/libro/${esc(l.id)}" aria-label="Apri ${esc(l.titolo)}">${copertina(l, 'l')}</a>
      <div>
        <a href="#/libro/${esc(l.id)}"><h2>${esc(l.titolo)}</h2></a>
        ${l.autore ? `<p class="autore">${esc(l.autore)}</p>` : ''}
      </div>
      <div class="in-lettura-sotto">
        <div class="avanzamento">
          <span>Pagina <b>${l.pagina}</b>${l.pagine ? ' di ' + l.pagine : ''}</span>
          ${p !== null ? `<span>${p}%</span>` : ''}
        </div>
        ${nastro(l)}
        ${frase ? `<p class="stima">${esc(frase)}</p>` : ''}
        ${azioniLettura(l)}
        ${azioniVeloci(l.id)}
      </div>
    </div>
  </article>`;
}

function schedaSerie() {
  const s = serie(data.letture, oggi());
  const giorni = settimana(data.letture, oggi());
  const sotto = s.attuale === 0 ? 'Leggi oggi per cominciare una serie'
    : s.fattoOggi ? (s.attuale === 1 ? 'giorno di lettura: oggi' : 'giorni di fila, oggi compreso')
    : (s.attuale === 1 ? 'giorno di fila: leggi oggi per continuare' : 'giorni di fila: leggi oggi per continuare');
  return `<section class="scheda dato" aria-label="Serie di giorni di lettura">
    <b>${s.attuale}</b><span>${sotto}</span>
    <ul class="giorni" aria-label="Questa settimana">
      ${giorni.map(g => { const d = dataDi(g.giorno); return `<li class="${g.fatto ? 'fatto' : ''}${g.oggi ? ' oggi' : ''}${g.futuro ? ' futuro' : ''}"><i></i><span aria-hidden="true">${GIORNI_INIZIALI[d.getDay()]}</span><span class="sr-only">${GIORNI[d.getDay()]}: ${g.fatto ? 'letto' : g.futuro ? 'deve ancora venire' : 'non letto'}</span></li>`; }).join('')}
    </ul>
  </section>`;
}

function schedaObiettivo() {
  const anno = oggi().slice(0, 4);
  const finiti = libriFiniti(data.libri, anno).length;
  const o = obiettivoAnno(finiti, data.impostazioni.obiettivi[anno], anno, oggi());
  if (!o) {
    return `<section class="scheda dato" aria-label="Obiettivo dell’anno">
      <b>${finiti}</b><span>${finiti === 1 ? 'libro finito' : 'libri finiti'} nel ${anno}</span>
      <button type="button" class="bottone-testo" data-azione="obiettivo" style="margin-top:6px">Scegli un obiettivo</button>
    </section>`;
  }
  const stato = { 'raggiunto': 'Obiettivo raggiunto', 'in-linea': 'Sei in linea', 'avanti': `Sei avanti di ${o.scarto}`, 'indietro': `Te ne ${-o.scarto === 1 ? 'manca 1' : 'mancano ' + -o.scarto} per essere in linea` }[o.stato] || '';
  return `<section class="scheda dato" aria-label="Obiettivo dell’anno">
    <b>${finiti} <small>di ${o.obiettivo}</small></b><span>libri nel ${anno}. ${stato}.</span>
    <div class="barra" style="--p:${o.percento}%"></div>
    <button type="button" class="bottone-testo" data-azione="obiettivo" style="margin-top:4px">Cambia</button>
  </section>`;
}

function vista() {
  const adesso = new Date();
  const titolo = `${maiuscola(GIORNI[adesso.getDay()])} ${adesso.getDate()} ${MESI[adesso.getMonth()]}`;
  const inLettura = libriDi(data.libri, 'leggendo', data.letture);
  const inAttesa = libriDi(data.libri, 'da-leggere');
  const ripasso = daRipassare(data.parole, oggi()).length;

  let corpo;
  if (!data.libri.length) {
    corpo = `<div class="vuoto">
      <h2 class="titolo-scheda">Che libro hai sul comodino?</h2>
      <p>Aggiungilo: da qui segni la pagina, riassumi i capitoli e raccogli le parole nuove.</p>
      <button type="button" class="bottone" data-azione="aggiungi-libro" data-lista="leggendo">${icona('piu')}Aggiungi il primo libro</button>
    </div>`;
  } else if (!inLettura.length) {
    corpo = `<div class="vuoto">
      <h2 class="titolo-scheda">Non stai leggendo niente</h2>
      <p>${inAttesa.length ? 'Scegli il prossimo tra quelli che aspettano.' : 'Aggiungi il libro che vuoi cominciare.'}</p>
      ${inAttesa.length ? '' : `<button type="button" class="bottone" data-azione="aggiungi-libro" data-lista="leggendo">${icona('piu')}Aggiungi un libro</button>`}
    </div>
    ${inAttesa.length ? `<section class="sezione"><h2 class="titolo-sezione">Da leggere</h2>
      <ul>${inAttesa.slice(0, 4).map(l => `<li class="riga-libro">
        <a href="#/libro/${esc(l.id)}" aria-label="Apri ${esc(l.titolo)}">${copertina(l)}</a>
        <div><h3>${esc(l.titolo)}</h3>${l.autore ? `<p class="autore">${esc(l.autore)}</p>` : ''}</div>
        <button type="button" class="bottone bottone--piccolo" data-azione="inizia" data-id="${esc(l.id)}">Inizia</button></li>`).join('')}</ul>
      ${inAttesa.length > 4 ? `<a class="bottone-testo" href="#/libreria" data-azione="vai-lista" data-id="da-leggere">Vedi tutti e ${inAttesa.length}</a>` : ''}
    </section>` : ''}`;
  } else {
    corpo = schedaInLettura(inLettura[0]);
    if (inLettura.length > 1) {
      corpo += `<section class="sezione"><h2 class="titolo-sezione">Anche in lettura</h2><ul>${inLettura.slice(1).map(l => rigaLibro(l)).join('')}</ul></section>`;
    }
  }

  const backup = data.libri.length >= 3 && (!data.ultimoBackup || giorniTra(data.ultimoBackup, oggi()) > 30);

  return `
    <header class="testata"><h1 class="titolo-pagina">${titolo}</h1></header>
    ${soloInMemoria && !globalThis.__LIBRI_ANTEPRIMA__ ? '<p class="nota-avviso">Questo browser non lascia salvare i dati (succede in navigazione privata): quello che scrivi si perde chiudendo la pagina. Apri l’app in una finestra normale.</p>' : ''}
    ${corpo}
    ${ripasso ? `<section class="scheda invito" style="margin-top:12px">
      <p>${plurale(ripasso, 'parola', 'parole')} da ripassare<small>Un paio di minuti bastano.</small></p>
      <button type="button" class="bottone bottone--piccolo" data-azione="ripassa">Ripassa</button>
    </section>` : ''}
    ${data.libri.length ? `<div class="due" style="margin-top:12px">${schedaSerie()}${schedaObiettivo()}</div>` : ''}
    ${backup ? `<div class="nota-avviso" style="margin-top:14px"><p>${data.ultimoBackup ? 'L’ultimo backup è di più di un mese fa.' : 'Non hai ancora fatto un backup.'} I tuoi appunti stanno solo su questo telefono.</p>
      <a class="bottone-testo" href="#/altro">Fai un backup</a></div>` : ''}`;
}

registraVista('oggi', vista);

registraAzioni({
  // avvia il cronometro (o ci torna, se sta già andando per questo libro)
  'leggi': el => {
    const id = el.dataset.id;
    if (data.timer && data.timer.libroId !== id) {
      const altro = libro(data.timer.libroId);
      vai('#/lettura');
      avviso(`Hai già una lettura in corso${altro ? ' con “' + altro.titolo + '”' : ''}: chiudi prima quella.`, { durata: 5000 });
      return;
    }
    if (!data.timer) avviaTimer(id);
    vai('#/lettura');
  },
  'pagina': el => apriPagina(el.dataset.id),
  'finisci': el => apriGiudizio(el.dataset.id, { finisci: true }),
  'nuovo-capitolo': el => apriCapitolo(el.dataset.id),
  'nuova-parola': el => apriParola({ libroId: el.dataset.id || undefined }),
  'nuova-citazione': el => apriCitazione({ libroId: el.dataset.id || null }),
  'ripassa': () => apriRipasso(),
  'obiettivo': el => apriObiettivo(el.dataset.id || undefined),
  'inizia': el => { cambiaStato(el.dataset.id, 'leggendo'); render(); avviso('Buona lettura'); },
  'vai-lista': el => { ui.lista = el.dataset.id; ui.cercaLibri = ''; }
});
