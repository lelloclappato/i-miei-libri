// Pannello a tutto schermo per scrivere (o correggere) il riassunto di un capitolo.
// Mentre scrivi il testo viene messo da parte come "bozza": se l'app si chiude per sbaglio,
// alla riapertura lo ritrovi.
import { deposito } from '../deposito.js';
import { libro, salvaCapitolo, eliminaCapitolo, STORE } from '../dati.js';
import { ui } from '../stato.js';
import { esc, intero, plurale } from '../utili.js';
import { prossimoCapitolo } from '../calcoli.js';
import { apriPannello, chiudiPannello, conferma } from './pannello.js';
import { render, avviso } from '../viste/comune.js';
import { apriGiudizio } from './giudizio.js';

// Le bozze stanno tutte sotto questo nome, una per ogni riassunto lasciato a metà:
// { "idLibro|idCapitolo": { numero, titolo, finoAPagina, riassunto }, "idLibro|nuovo": {…} }
const BOZZE = STORE + '-bozza-capitolo';
const MAX_BOZZE = 8; // per non riempire la memoria: oltre queste, si tolgono le più vecchie

const chiaveBozza = (libroId, capitoloId) => libroId + '|' + (capitoloId || 'nuovo');
function tutteLeBozze() {
  try { const b = JSON.parse(deposito.getItem(BOZZE) || '{}'); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; }
  catch (e) { return {}; }
}
function salvaBozze(b) {
  try { if (Object.keys(b).length) deposito.setItem(BOZZE, JSON.stringify(b)); else deposito.removeItem(BOZZE); } catch (e) {}
}
function leggiBozza(libroId, capitoloId) {
  const b = tutteLeBozze()[chiaveBozza(libroId, capitoloId)];
  return b && typeof b === 'object' && typeof b.riassunto === 'string' ? b : null;
}
function scriviBozza(libroId, capitoloId, bozza) {
  const b = tutteLeBozze(), k = chiaveBozza(libroId, capitoloId);
  delete b[k]; b[k] = bozza; // tolta e rimessa: così è l'ultima, cioè la più recente
  for (const vecchia of Object.keys(b).slice(0, -MAX_BOZZE)) delete b[vecchia];
  salvaBozze(b);
}
function cancellaBozza(libroId, capitoloId) {
  const b = tutteLeBozze();
  delete b[chiaveBozza(libroId, capitoloId)];
  salvaBozze(b);
}

const contaParole = t => (t.trim().match(/\S+/g) || []).length;

export function apriCapitolo(libroId, capitoloId = null) {
  const l = libro(libroId);
  if (!l) return;
  const esistente = capitoloId ? l.capitoli.find(c => c.id === capitoloId) : null;
  const bozza = leggiBozza(libroId, capitoloId);
  const v = bozza || esistente || { numero: prossimoCapitolo(l), titolo: '', finoAPagina: '', riassunto: '' };

  const corpo = apriPannello({
    titolo: esistente ? 'Modifica il riassunto' : 'Riassunto del capitolo',
    pieno: true,
    bozza: true, // quello che scrivi viene messo da parte: il pannello si può chiudere senza perdere niente
    corpo: `<form novalidate>
      <p class="tenue" style="margin-bottom:12px">${esc(l.titolo)}</p>
      ${bozza ? '<p class="nota-avviso" id="avviso-bozza">Ho ripreso il testo che non avevi salvato. <button type="button" class="bottone-testo" id="scarta-bozza">Scartalo</button></p>' : ''}
      <div class="campi-2">
        <label class="campo"><span>Capitolo numero</span>
          <input name="numero" value="${esc(v.numero)}" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off">
          <small>0 per prologo o introduzione.</small></label>
        <label class="campo"><span>Fino a pagina</span>
          <input name="finoAPagina" value="${esc(v.finoAPagina ?? '')}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off">
          <small>Sposta anche il segnalibro.</small></label>
      </div>
      <label class="campo"><span>Titolo del capitolo <span class="tenue" style="font-weight:400">(se ce l’ha)</span></span>
        <input name="titolo" value="${esc(v.titolo)}" maxlength="200" autocomplete="off"></label>
      <label class="campo campo--cresce"><span>Riassunto</span>
        <textarea name="riassunto" class="lettura" maxlength="20000" placeholder="Cosa succede? Chi compare? Cosa è cambiato rispetto a prima?" ${esistente ? '' : 'autofocus'}>${esc(v.riassunto)}</textarea>
        <small id="conta" aria-live="off"></small></label>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni">
        ${esistente ? '<button type="button" class="bottone bottone--secondario" id="elimina">Elimina</button>' : ''}
        <button type="submit" class="bottone">Salva il riassunto</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form'), conta = corpo.querySelector('#conta');
  const aggiornaConta = () => { const n = contaParole(form.elements.riassunto.value); conta.textContent = n ? plurale(n, 'parola', 'parole') : ''; };
  aggiornaConta();

  let salvato = false;
  form.addEventListener('input', () => {
    aggiornaConta();
    if (salvato) return;
    scriviBozza(libroId, capitoloId, { numero: form.elements.numero.value, titolo: form.elements.titolo.value, finoAPagina: form.elements.finoAPagina.value, riassunto: form.elements.riassunto.value });
  });

  const scarta = corpo.querySelector('#scarta-bozza');
  if (scarta) scarta.addEventListener('click', () => { cancellaBozza(libroId, capitoloId); apriCapitolo(libroId, capitoloId); });

  form.addEventListener('submit', e => {
    e.preventDefault();
    const errore = corpo.querySelector('#errore');
    const sbagliato = (testo, campo) => { errore.textContent = testo; errore.hidden = false; campo.focus(); };
    const numero = intero(form.elements.numero.value);
    const finoAPagina = intero(form.elements.finoAPagina.value);
    const titolo = form.elements.titolo.value.trim(), riassunto = form.elements.riassunto.value.trim();
    if (numero === null) return sbagliato('Scrivi il numero del capitolo (0 per il prologo).', form.elements.numero);
    if (!riassunto && !titolo) return sbagliato('Scrivi almeno una riga di riassunto, oppure il titolo del capitolo.', form.elements.riassunto);
    if (finoAPagina && l.pagine && finoAPagina > l.pagine) return sbagliato(`Il libro ha ${l.pagine} pagine: controlla “Fino a pagina”.`, form.elements.finoAPagina);
    salvato = true;
    salvaCapitolo(libroId, { id: capitoloId, numero, titolo, finoAPagina: finoAPagina || null, riassunto });
    cancellaBozza(libroId, capitoloId);
    ui.sezioneLibro = 'capitoli';
    const ora = libro(libroId);
    if (ora.pagine && ora.pagina >= ora.pagine && ora.stato === 'leggendo') { apriGiudizio(libroId, { finisci: true }); return; }
    chiudiPannello(); render();
    avviso(esistente ? 'Riassunto aggiornato' : 'Riassunto salvato');
  });

  const elimina = corpo.querySelector('#elimina');
  if (elimina) elimina.addEventListener('click', async () => {
    if (!(await conferma('Eliminare questo riassunto?', { dettaglio: 'Il testo non si potrà recuperare.' }))) return;
    salvato = true;
    eliminaCapitolo(libroId, capitoloId); cancellaBozza(libroId, capitoloId);
    chiudiPannello(); render();
    avviso('Riassunto eliminato');
  });
}
