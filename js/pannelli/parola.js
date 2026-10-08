// Pannello per salvare (o correggere) una parola nuova: la parola, cosa vuol dire,
// la frase in cui l'hai trovata, il libro e la pagina. Con un aiuto dal dizionario.
import { data, libro, parola, salvaParola, eliminaParola } from '../dati.js';
import { esc, intero, semplice } from '../utili.js';
import { icona } from '../icone.js';
import { NOMI_LIVELLO } from '../calcoli.js';
import { cercaSignificato, linkTreccani } from '../dizionario.js';
import { apriPannello, chiudiPannello, conferma, segnaScritto } from './pannello.js';
import { render, avviso } from '../viste/comune.js';
import { opzioniLibri, libroPredefinito } from './citazione.js';

//   libroId:  il libro da proporre (undefined = quello che stai leggendo)
//   parolaId: per modificare una parola già salvata
export function apriParola({ libroId, parolaId = null } = {}) {
  const esistente = parolaId ? parola(parolaId) : null;
  const scelto = esistente ? esistente.libroId : (libroId === undefined ? libroPredefinito() : libroId);
  const l = scelto ? libro(scelto) : null;
  const v = esistente || { parola: '', significato: '', frase: '', pagina: null };
  const corpo = apriPannello({
    titolo: esistente ? 'Modifica la parola' : 'Parola nuova',
    corpo: `<form novalidate>
      <label class="campo"><span>Parola</span>
        <input name="parola" value="${esc(v.parola)}" maxlength="120" autocomplete="off" autocapitalize="none" spellcheck="false" ${esistente ? '' : 'autofocus'}></label>
      <div class="azioni-testo" style="margin:-8px 0 8px">
        <button type="button" class="bottone-testo" id="suggerisci">${icona('scintille')}Suggerisci il significato</button>
        <a class="bottone-testo" id="treccani" href="#" target="_blank" rel="noopener" aria-label="Cerca la parola sul vocabolario Treccani (si apre in un’altra scheda)">${icona('esterno')}Treccani</a>
      </div>
      <div id="suggerimenti" aria-live="polite"></div>
      <label class="campo"><span>Cosa vuol dire</span>
        <textarea name="significato" maxlength="3000" rows="3" placeholder="Con parole tue, come la spiegheresti a un amico">${esc(v.significato)}</textarea></label>
      <label class="campo"><span>La frase in cui l’hai trovata <span class="tenue" style="font-weight:400">(facoltativo)</span></span>
        <textarea name="frase" maxlength="3000" rows="2" style="min-height:76px;font-family:var(--titoli);font-style:italic">${esc(v.frase)}</textarea></label>
      <div class="campi-2" style="grid-template-columns:2fr 1fr">
        <label class="campo"><span>Libro</span><select name="libro">${opzioniLibri(l ? l.id : null, true)}</select></label>
        <label class="campo"><span>Pagina</span>
          <input name="pagina" value="${v.pagina ?? (!esistente && l ? l.pagina || '' : '')}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
      </div>
      ${esistente ? `<p class="tenue piccolo" style="margin-bottom:12px">Nel ripasso: ${NOMI_LIVELLO[esistente.livello]}${esistente.ripassi ? `, ripassata ${esistente.ripassi === 1 ? 'una volta' : esistente.ripassi + ' volte'}` : ''}.</p>` : ''}
      <p class="errore" id="errore" hidden></p>
      <div class="azioni">
        ${esistente ? '<button type="button" class="bottone bottone--secondario" id="elimina">Elimina</button>' : ''}
        <button type="submit" class="bottone">Salva la parola</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form'), zona = corpo.querySelector('#suggerimenti'), treccani = corpo.querySelector('#treccani');
  const aggiornaLink = () => { treccani.href = linkTreccani(form.elements.parola.value || ''); };
  form.elements.parola.addEventListener('input', aggiornaLink); aggiornaLink();
  treccani.addEventListener('click', e => { if (!form.elements.parola.value.trim()) { e.preventDefault(); form.elements.parola.focus(); } });

  // --- aiuto dal Wikizionario ---
  let richiesta = null; // la ricerca in corso nel dizionario
  corpo.querySelector('#suggerisci').addEventListener('click', async () => {
    const p = form.elements.parola.value.trim();
    if (!p) { form.elements.parola.focus(); return; }
    if (richiesta) richiesta.abort(); // una ricerca precedente ancora in corso non deve arrivare dopo e coprire questa
    const questa = richiesta = new AbortController();
    zona.innerHTML = '<p class="attesa" style="padding:8px 0">Cerco nel dizionario…</p>';
    try {
      const gruppi = await cercaSignificato(p, questa.signal);
      if (questa !== richiesta || !zona.isConnected) return;
      if (!gruppi.length) { zona.innerHTML = `<p class="nota-avviso">Il Wikizionario non ha “${esc(p)}”. Prova con la forma base (il singolare, l’infinito del verbo) oppure cerca su Treccani.</p>`; return; }
      zona.innerHTML = `<div class="suggerimenti">${gruppi.map(g => `<h4>${esc(g.tipo)}</h4>${g.definizioni.map(d => `<button type="button" class="suggerimento">${esc(d)}</button>`).join('')}`).join('')}
        <p class="tenue piccolo" style="margin-top:8px">Dal Wikizionario. Tocca una definizione per copiarla qui sotto, poi riscrivila con parole tue: si ricorda meglio.</p></div>`;
    } catch (e) {
      if (questa === richiesta && zona.isConnected) zona.innerHTML = '<p class="nota-avviso">Non riesco a raggiungere il dizionario: controlla la connessione.</p>';
    }
  });
  zona.addEventListener('click', e => {
    const b = e.target.closest('.suggerimento');
    if (!b) return;
    const campo = form.elements.significato;
    campo.value = campo.value.trim() ? campo.value.trim() + '\n' + b.textContent : b.textContent;
    segnaScritto();
    campo.focus();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const scritta = form.elements.parola.value.trim();
    if (!scritta) { const er = corpo.querySelector('#errore'); er.textContent = 'Scrivi la parola.'; er.hidden = false; form.elements.parola.focus(); return; }
    const gia = data.parole.find(x => x.id !== parolaId && semplice(x.parola) === semplice(scritta));
    if (gia && !(await conferma(`Hai già “${gia.parola}” nel quaderno.`, { ok: 'Salvala lo stesso', annulla: 'Annulla' }))) return;
    const libroScelto = form.elements.libro.value || null;
    salvaParola({
      id: parolaId, parola: scritta,
      significato: form.elements.significato.value.trim(),
      frase: form.elements.frase.value.trim(),
      libroId: libroScelto,
      pagina: intero(form.elements.pagina.value)
    });
    chiudiPannello(); render();
    if (esistente) avviso('Parola aggiornata');
    else avviso('Parola salvata: la ripassi da domani', { etichetta: 'Un’altra', azione: () => apriParola({ libroId: libroScelto }) });
  });
  const elimina = corpo.querySelector('#elimina');
  if (elimina) elimina.addEventListener('click', async () => {
    if (!(await conferma(`Eliminare “${esistente.parola}” dal quaderno?`))) return;
    eliminaParola(parolaId);
    chiudiPannello(); render();
    avviso('Parola eliminata');
  });
}
