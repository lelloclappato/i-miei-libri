// Pannello "A che pagina sei arrivato?" e pannello dell'obiettivo dell'anno.
import { data, libro, aggiornaPagina, modificaLibro, setObiettivo } from '../dati.js';
import { esc, intero, oggi } from '../utili.js';
import { apriPannello, chiudiPannello } from './pannello.js';
import { render, avviso } from '../viste/comune.js';
import { apriGiudizio } from './giudizio.js';

export function apriPagina(id) {
  const l = libro(id);
  if (!l) return;
  const corpo = apriPannello({
    titolo: 'A che pagina sei arrivato?',
    corpo: `<form novalidate>
      <p class="tenue" style="margin-bottom:14px">${esc(l.titolo)}</p>
      <div class="campi-2">
        <label class="campo"><span>Pagina</span>
          <input name="pagina" value="${l.pagina || ''}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" autofocus></label>
        <label class="campo"><span>${l.pagine ? 'Su un totale di' : 'Pagine del libro'}</span>
          <input name="pagine" value="${l.pagine || ''}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
      </div>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni"><button type="submit" class="bottone">Salva la pagina</button></div>
    </form>`
  });
  const form = corpo.querySelector('form');
  // il numero già scritto si seleziona, così basta digitare quello nuovo
  form.elements.pagina.addEventListener('focus', e => e.target.select());
  form.elements.pagina.select();
  form.addEventListener('submit', e => {
    e.preventDefault();
    const errore = corpo.querySelector('#errore');
    const pagina = intero(form.elements.pagina.value), pagine = intero(form.elements.pagine.value) || null;
    const sbagliato = testo => { errore.textContent = testo; errore.hidden = false; };
    if (pagina === null) { sbagliato('Scrivi il numero della pagina.'); form.elements.pagina.focus(); return; }
    if (pagine && pagina > pagine) { sbagliato(`Il libro ha ${pagine} pagine: controlla il numero.`); form.elements.pagina.focus(); return; }
    if (pagine !== l.pagine) modificaLibro(id, { pagine });
    const finito = aggiornaPagina(id, pagina);
    if (finito) apriGiudizio(id, { finisci: true }); // ultima pagina: si passa al voto
    else { chiudiPannello(); render(); avviso(`Segnalibro a pagina ${pagina}`); }
  });
}

export function apriObiettivo(anno = oggi().slice(0, 4)) {
  const attuale = data.impostazioni.obiettivi[anno] || '';
  const corpo = apriPannello({
    titolo: `Obiettivo del ${anno}`,
    corpo: `<form novalidate>
      <label class="campo"><span>Quanti libri vuoi leggere nel ${anno}?</span>
        <input name="n" value="${attuale}" inputmode="numeric" pattern="[0-9]*" maxlength="3" autocomplete="off" autofocus>
        <small>Uno al mese fa 12. Lo puoi cambiare quando vuoi.</small></label>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni">
        ${attuale ? '<button type="button" class="bottone bottone--secondario" id="togli">Togli l’obiettivo</button>' : ''}
        <button type="submit" class="bottone">Salva l’obiettivo</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const n = intero(form.elements.n.value);
    if (!n) { const er = corpo.querySelector('#errore'); er.textContent = 'Scrivi un numero di libri, almeno 1.'; er.hidden = false; form.elements.n.focus(); return; }
    setObiettivo(anno, n); chiudiPannello(); render(); avviso('Obiettivo salvato');
  });
  const togli = corpo.querySelector('#togli');
  if (togli) togli.addEventListener('click', () => { setObiettivo(anno, 0); chiudiPannello(); render(); avviso('Obiettivo tolto'); });
}
