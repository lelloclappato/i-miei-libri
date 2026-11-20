// Pannello per aggiungere (o correggere) un personaggio del libro: chi è, e dove compare la prima volta.
import { data, libro, salvaPersonaggio, eliminaPersonaggio, personaggioConNome } from '../dati.js';
import { esc, intero } from '../utili.js';
import { apriPannello, chiudiPannello, conferma } from './pannello.js';
import { render, avviso } from '../viste/comune.js';
import { libroPredefinito } from './citazione.js';

export function apriPersonaggio({ libroId = null, personaggioId = null } = {}) {
  if (!data.libri.length) { avviso('Prima aggiungi un libro: i personaggi stanno dentro i libri.'); return; }
  const l = libro(libroId || libroPredefinito());
  if (!l) return;
  const esistente = personaggioId ? l.personaggi.find(p => p.id === personaggioId) : null;
  const v = esistente || { nome: '', chi: '', pagina: null };
  const corpo = apriPannello({
    titolo: esistente ? 'Modifica il personaggio' : 'Nuovo personaggio',
    corpo: `<form novalidate>
      <p class="tenue" style="margin-bottom:14px">${esc(l.titolo)}</p>
      <label class="campo"><span>Nome</span>
        <input name="nome" value="${esc(v.nome)}" maxlength="120" autocomplete="off" autocapitalize="words" enterkeyhint="next" ${esistente ? '' : 'autofocus'}></label>
      <label class="campo"><span>Chi è</span>
        <textarea name="chi" class="lettura" style="min-height:120px" maxlength="3000" placeholder="Il ruolo, con chi è legato, cosa ha fatto finora">${esc(v.chi)}</textarea>
        <small>Puoi tornare ad aggiungere cose mentre vai avanti a leggere.</small></label>
      <label class="campo" style="max-width:200px"><span>Compare a pagina</span>
        <input name="pagina" value="${v.pagina ?? (esistente ? '' : l.pagina || '')}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni">
        ${esistente ? '<button type="button" class="bottone bottone--secondario" id="elimina">Elimina</button>' : ''}
        <button type="submit" class="bottone">Salva il personaggio</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form');
  const errore = testo => { const er = corpo.querySelector('#errore'); er.textContent = testo; er.hidden = false; form.elements.nome.focus(); };
  form.addEventListener('submit', e => {
    e.preventDefault();
    const nome = form.elements.nome.value.trim();
    if (!nome) { errore('Scrivi il nome del personaggio.'); return; }
    const gia = personaggioConNome(l.id, nome, esistente ? esistente.id : null);
    if (gia) { errore(`“${gia.nome}” c’è già in questo libro: aggiungi le novità alla sua scheda.`); return; }
    salvaPersonaggio(l.id, { id: personaggioId, nome, chi: form.elements.chi.value.trim(), pagina: intero(form.elements.pagina.value) });
    chiudiPannello(); render();
    avviso(esistente ? 'Personaggio aggiornato' : 'Personaggio salvato');
  });
  const elimina = corpo.querySelector('#elimina');
  if (elimina) elimina.addEventListener('click', async () => {
    if (!(await conferma(`Eliminare “${esistente.nome}”?`))) return;
    eliminaPersonaggio(l.id, personaggioId);
    chiudiPannello(); render();
    avviso('Personaggio eliminato');
  });
}
