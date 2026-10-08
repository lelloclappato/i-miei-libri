// Pannello per salvare (o correggere) una frase che ti ha colpito.
import { data, libro, salvaCitazione, eliminaCitazione, spostaCitazione } from '../dati.js';
import { esc, intero } from '../utili.js';
import { libriDi } from '../calcoli.js';
import { apriPannello, chiudiPannello, conferma } from './pannello.js';
import { render, avviso } from '../viste/comune.js';

// Elenco dei libri per il menu "Libro": prima quelli in lettura, poi gli altri in ordine alfabetico.
export function opzioniLibri(scelto, conNessuno = false) {
  const inLettura = libriDi(data.libri, 'leggendo', data.letture);
  const altri = data.libri.filter(l => l.stato !== 'leggendo').sort((a, b) => a.titolo.localeCompare(b.titolo, 'it'));
  const opzione = l => `<option value="${esc(l.id)}" ${l.id === scelto ? 'selected' : ''}>${esc(l.titolo)}</option>`;
  return (conNessuno ? `<option value="" ${!scelto ? 'selected' : ''}>Nessun libro</option>` : '')
    + (inLettura.length ? `<optgroup label="Sto leggendo">${inLettura.map(opzione).join('')}</optgroup>` : '')
    + (altri.length ? `<optgroup label="Altri libri">${altri.map(opzione).join('')}</optgroup>` : '');
}
// Il libro da proporre quando non è stato indicato: quello che stai leggendo (il più recente).
export function libroPredefinito() {
  const l = libriDi(data.libri, 'leggendo', data.letture)[0];
  return l ? l.id : (data.libri[0] ? data.libri[0].id : null);
}

export function apriCitazione({ libroId = null, citazioneId = null } = {}) {
  if (!data.libri.length) { avviso('Prima aggiungi un libro: le citazioni stanno dentro i libri.'); return; }
  const l = libro(libroId || libroPredefinito());
  const esistente = citazioneId && l ? l.citazioni.find(c => c.id === citazioneId) : null;
  const v = esistente || { testo: '', pagina: null, nota: '' };
  const corpo = apriPannello({
    titolo: esistente ? 'Modifica la citazione' : 'Nuova citazione',
    corpo: `<form novalidate>
      <label class="campo"><span>La frase</span>
        <textarea name="testo" class="lettura" style="min-height:150px" maxlength="5000" placeholder="Ricopiala com’è scritta nel libro" ${esistente ? '' : 'autofocus'}>${esc(v.testo)}</textarea></label>
      <div class="campi-2" style="grid-template-columns:2fr 1fr">
        <label class="campo"><span>Libro</span><select name="libro">${opzioniLibri(l.id)}</select></label>
        <label class="campo"><span>Pagina</span>
          <input name="pagina" value="${v.pagina ?? (esistente ? '' : l.pagina || '')}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
      </div>
      <label class="campo"><span>Perché ti ha colpito <span class="tenue" style="font-weight:400">(facoltativo)</span></span>
        <textarea name="nota" maxlength="2000" rows="2" style="min-height:70px">${esc(v.nota)}</textarea></label>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni">
        ${esistente ? '<button type="button" class="bottone bottone--secondario" id="elimina">Elimina</button>' : ''}
        <button type="submit" class="bottone">Salva la citazione</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const testo = form.elements.testo.value.trim();
    if (!testo) { const er = corpo.querySelector('#errore'); er.textContent = 'Scrivi la frase da ricordare.'; er.hidden = false; form.elements.testo.focus(); return; }
    const scelto = form.elements.libro.value;
    const salvata = salvaCitazione(l.id, { id: citazioneId, testo, pagina: intero(form.elements.pagina.value), nota: form.elements.nota.value.trim() });
    // libro cambiato nel menu: la citazione va (o si sposta) in quello scelto
    if (salvata && scelto && scelto !== l.id) spostaCitazione(l.id, scelto, salvata.id);
    chiudiPannello(); render();
    avviso(esistente ? 'Citazione aggiornata' : 'Citazione salvata');
  });
  const elimina = corpo.querySelector('#elimina');
  if (elimina) elimina.addEventListener('click', async () => {
    if (!(await conferma('Eliminare questa citazione?'))) return;
    eliminaCitazione(l.id, citazioneId);
    chiudiPannello(); render();
    avviso('Citazione eliminata');
  });
}
