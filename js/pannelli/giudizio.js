// Pannello di fine libro: il giorno in cui l'hai finito, il voto in stelle e cosa ti ha lasciato.
// Lo stesso pannello serve per cambiare voto e recensione più tardi.
import { data, libro, cambiaStato, salvaGiudizio } from '../dati.js';
import { ui } from '../stato.js';
import { esc, oggi, chiaveValida, ilNumero } from '../utili.js';
import { icona } from '../icone.js';
import { libriFiniti } from '../calcoli.js';
import { apriPannello, chiudiPannello, segnaScritto } from './pannello.js';
import { render, avviso } from '../viste/comune.js';

const VOTI = ['Non mi è piaciuto', 'Così così', 'Buono', 'Molto bello', 'Tra i miei preferiti'];

//   finisci: true = il libro passa a "Letto" quando salvi (con il giorno scelto)
//   appenaAggiunto: true = libro aggiunto come già letto: il pannello si può saltare
export function apriGiudizio(id, { finisci = false, appenaAggiunto = false } = {}) {
  const l = libro(id);
  if (!l) return;
  let voto = l.voto;
  const corpo = apriPannello({
    titolo: finisci ? 'Hai finito il libro' : 'Voto e pensieri',
    corpo: `<form novalidate>
      <p class="tenue" style="margin-bottom:14px">${esc(l.titolo)}</p>
      ${finisci ? `<label class="campo"><span>Finito il</span>
        <input type="date" name="finito" value="${oggi()}" max="${oggi()}" required></label>` : ''}
      <span class="etichetta" id="et-voto">Quanto ti è piaciuto?</span>
      <div class="voto" role="group" aria-labelledby="et-voto">
        ${[1, 2, 3, 4, 5].map(n => `<button type="button" data-voto="${n}" aria-pressed="${n <= voto}" aria-label="${n} su 5: ${VOTI[n - 1]}">${icona('stella')}</button>`).join('')}
      </div>
      <p class="tenue piccolo" id="voto-testo" style="margin:-8px 0 14px;min-height:1.45em">${voto ? VOTI[voto - 1] : ''}</p>
      <label class="campo"><span>Cosa ti ha lasciato?</span>
        <textarea name="recensione" class="lettura" style="min-height:160px" maxlength="20000" placeholder="Cosa ti porti via, a chi lo consiglieresti, cosa non ti ha convinto…">${esc(l.recensione)}</textarea></label>
      <div class="azioni">
        ${appenaAggiunto ? '<button type="button" class="bottone bottone--secondario" data-chiudi>Salta</button>' : ''}
        <button type="submit" class="bottone">${finisci ? 'Segna come letto' : 'Salva'}</button>
      </div>
    </form>`,
    chiuso: render
  });
  const form = corpo.querySelector('form'), testoVoto = corpo.querySelector('#voto-testo');
  corpo.querySelector('.voto').addEventListener('click', e => {
    const b = e.target.closest('[data-voto]');
    if (!b) return;
    const n = Number(b.dataset.voto);
    voto = voto === n ? 0 : n; // toccare di nuovo la stessa stella toglie il voto
    segnaScritto();
    for (const s of corpo.querySelectorAll('[data-voto]')) s.setAttribute('aria-pressed', Number(s.dataset.voto) <= voto);
    testoVoto.textContent = voto ? VOTI[voto - 1] : '';
  });
  form.addEventListener('submit', e => {
    e.preventDefault();
    if (finisci) {
      const g = form.elements.finito.value;
      cambiaStato(id, 'letto', chiaveValida(g) && g <= oggi() ? g : oggi());
      ui.lista = 'letto';
    }
    salvaGiudizio(id, voto, form.elements.recensione.value);
    chiudiPannello();
    if (finisci) {
      const anno = libro(id).finito.slice(0, 4);
      const n = libriFiniti(data.libri, anno).length;
      avviso(`Libro finito: è ${ilNumero(n)} del ${anno}.`, { durata: 5000 });
    } else avviso('Salvato');
  });
}
