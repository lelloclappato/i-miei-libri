// Pannello per aggiungere un libro (prima la ricerca in rete, poi la conferma dei dati)
// e per modificare la scheda di un libro che c'è già.
import { data, libro, aggiungiLibro, modificaLibro } from '../dati.js';
import { ui } from '../stato.js';
import { esc, oggi, intero, plurale, chiaveValida, ilGiorno } from '../utili.js';
import { icona } from '../icone.js';
import { NOMI_STATO, coloreDaTitolo } from '../migrazione.js';
import { doppione } from '../calcoli.js';
import { cercaInRete, comeIsbn, chiaveGoogleRifiutata } from '../ricerca.js';
import { apriPannello, chiudiPannello, conferma } from './pannello.js';
import { copertina, render, vai, vaiPoi, avviso, annuncia } from '../viste/comune.js';
import { apriGiudizio } from './giudizio.js';
import { apriScansione, puoScansionare } from './scansione.js';

// ---------- passo 1: la ricerca ----------

const AIUTO = '<p class="tenue piccolo">Scrivi il titolo: cerco copertina, autore e numero di pagine. L’ISBN è il numero sotto il codice a barre, sul retro del libro.</p>';

// isbnLetto: l'ISBN appena letto con la fotocamera. È quello della TUA copia: resta nella scheda del libro
// anche se poi lo cerchi per titolo e scegli un risultato (che potrebbe essere un'altra edizione).
export function apriAggiungiLibro({ lista = null, testo = '', isbnLetto = null } = {}) {
  const scansione = puoScansionare();
  const corpo = apriPannello({
    titolo: 'Aggiungi un libro',
    corpo: `
      <div class="cerca">${icona('cerca')}
        <input type="search" id="cerca-rete" value="${esc(testo)}" placeholder="Titolo, autore o ISBN" aria-label="Cerca un libro per titolo, autore o ISBN" autocomplete="off" enterkeyhint="search" ${isbnLetto ? '' : 'autofocus'}>
      </div>
      ${scansione ? `<button type="button" class="bottone bottone--secondario bottone--largo scansiona" id="scansiona" ${isbnLetto ? 'autofocus' : ''}>${icona('codice')}${isbnLetto ? 'Scansiona di nuovo' : 'Scansiona il codice a barre'}</button>` : ''}
      <div id="risultati" aria-live="polite">${AIUTO}</div>
      <button type="button" class="bottone-testo" id="a-mano">${icona('matita')}Scrivilo a mano</button>`
  });
  const campo = corpo.querySelector('#cerca-rete'), zona = corpo.querySelector('#risultati');
  let attesa = null, ricerca = null, trovati = [];
  // dopo una scansione: se il catalogo trova un libro solo, si va dritti alla scheda (una volta sola)
  let saltaSeUnico = !!isbnLetto;
  // Il risultato scelto prende l'ISBN letto se è stato trovato proprio con quello, o se non ne ha uno suo
  // (un risultato trovato per titolo con il suo ISBN potrebbe essere un altro libro: lì non si tocca).
  const conIsbn = c => (isbnLetto && (!c.isbn || comeIsbn(campo.value) === isbnLetto) ? { ...c, isbn: isbnLetto } : c);

  async function cerca() {
    const q = campo.value.trim();
    if (ricerca) ricerca.abort();      // se stavi ancora aspettando la ricerca di prima, la si interrompe
    ricerca = null;
    if (q.length < 3) { zona.innerHTML = AIUTO; return; }
    ricerca = new AbortController();
    const questa = ricerca;
    zona.innerHTML = '<p class="attesa">Cerco…</p>';
    try {
      const { libri, errore } = await cercaInRete(q, { chiaveGoogle: data.impostazioni.chiaveGoogle, segnale: questa.signal });
      if (questa !== ricerca || !zona.isConnected) return; // nel frattempo è partita un'altra ricerca, o il pannello è stato chiuso
      trovati = libri;
      const dallaScansione = isbnLetto && comeIsbn(q) === isbnLetto;
      if (saltaSeUnico && dallaScansione && libri.length === 1 && !errore) {
        saltaSeUnico = false;
        moduloLibro({ campi: conIsbn(libri[0]), lista, daRicerca: q, isbnLetto });
        return;
      }
      saltaSeUnico = false;
      if (errore) zona.innerHTML = '<p class="nota-avviso">Non riesco a cercare: controlla la connessione. Intanto puoi scriverlo a mano.</p>';
      else if (!libri.length && dallaScansione) zona.innerHTML = `<p class="nota-avviso">Ho letto l’ISBN ${esc(isbnLetto)}, ma i cataloghi gratuiti non lo conoscono (capita con parecchi libri italiani). Scrivi il titolo qui sopra, oppure aggiungilo a mano: l’ISBN resta segnato.</p>`;
      else if (!libri.length) zona.innerHTML = `<p class="nota-avviso">Nessun libro trovato per “${esc(q)}”. Prova con meno parole, con l’ISBN, oppure scrivilo a mano.</p>`;
      else {
        zona.innerHTML = `<ul>${libri.map((l, i) => {
          const gia = doppione(data.libri, l);
          const riga = [l.autore, l.anno, l.pagine ? plurale(l.pagine, 'pagina', 'pagine') : ''].filter(Boolean).join(', ');
          return `<li><button type="button" class="risultato" data-i="${i}">
            ${copertina({ ...l, colore: coloreDaTitolo(l.titolo) }, 's')}
            <span><b>${esc(l.titolo)}</b><span>${esc(riga)}</span>${gia ? `<span>Già in libreria (${NOMI_STATO[gia.stato]})</span>` : ''}</span>
          </button></li>`;
        }).join('')}</ul>`;
        annuncia(plurale(libri.length, 'libro trovato', 'libri trovati'));
      }
      // la chiave scritta in Altro non funziona: lo si dice, altrimenti non c'è modo di accorgersene
      if (chiaveGoogleRifiutata()) zona.insertAdjacentHTML('beforeend', '<p class="tenue piccolo" style="margin-top:10px">Google Books ha rifiutato la chiave scritta in Altro: per ora cerco solo su Open Library.</p>');
    } catch (e) {
      if (e.name !== 'AbortError' && questa === ricerca && zona.isConnected) zona.innerHTML = '<p class="nota-avviso">Non riesco a cercare in questo momento. Puoi scriverlo a mano.</p>';
    }
  }

  campo.addEventListener('input', () => { clearTimeout(attesa); attesa = setTimeout(cerca, 500); }); // aspetta che tu smetta di scrivere
  campo.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(attesa); cerca(); } });
  zona.addEventListener('click', e => {
    const b = e.target.closest('.risultato');
    if (b) { if (ricerca) ricerca.abort(); moduloLibro({ campi: conIsbn(trovati[Number(b.dataset.i)]), lista, daRicerca: campo.value, isbnLetto }); }
  });
  corpo.querySelector('#a-mano').addEventListener('click', () => {
    if (ricerca) ricerca.abort();
    // quello che hai scritto nella ricerca diventa il titolo; se è un ISBN, resta come ISBN del libro
    const scritto = campo.value.trim(), isbn = comeIsbn(scritto) || isbnLetto;
    moduloLibro({ campi: { titolo: comeIsbn(scritto) || /^[\d\s-]+$/.test(scritto) ? '' : scritto, isbn: isbn || '', origine: 'manuale' }, lista, daRicerca: scritto, isbnLetto });
  });
  const bottoneScansione = corpo.querySelector('#scansiona');
  if (bottoneScansione) bottoneScansione.addEventListener('click', () => { if (ricerca) ricerca.abort(); clearTimeout(attesa); apriScansione({ lista }); });
  if (testo.trim().length >= 3) cerca();
}

// ---------- passo 2: i dati del libro ----------

const LISTE_AGGIUNTA = [['leggendo', 'Lo sto leggendo'], ['da-leggere', 'Da leggere'], ['voglio', 'Voglio leggerlo'], ['letto', 'L’ho già letto']];

function campiLibro(c) {
  return `
    <label class="campo"><span>Titolo</span>
      <input name="titolo" value="${esc(c.titolo || '')}" required maxlength="300" autocomplete="off" ${c.titolo ? '' : 'autofocus'}></label>
    <label class="campo"><span>Autore</span>
      <input name="autore" value="${esc(c.autore || '')}" maxlength="200" autocomplete="off"></label>
    <div class="campi-2">
      <label class="campo"><span>Pagine</span>
        <input name="pagine" value="${c.pagine || ''}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off">
        <small>Della tua edizione: serve per l’avanzamento.</small></label>
      <label class="campo"><span>Anno</span>
        <input name="anno" value="${c.anno || ''}" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></label>
    </div>
    <div class="campi-2">
      <label class="campo"><span>Genere</span>
        <input name="genere" value="${esc(c.genere || '')}" maxlength="80" list="generi" autocomplete="off"></label>
      <label class="campo"><span>Editore</span>
        <input name="editore" value="${esc(c.editore || '')}" maxlength="200" autocomplete="off"></label>
    </div>
    <datalist id="generi">${generiUsati().map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;
}

// I generi già usati (più alcuni comuni) da proporre mentre scrivi.
function generiUsati() {
  const comuni = ['Romanzo', 'Giallo', 'Fantasy', 'Fantascienza', 'Saggio', 'Biografia', 'Classico', 'Storico', 'Crescita personale', 'Racconti', 'Poesia', 'Fumetto'];
  return [...new Set([...data.libri.map(l => l.genere).filter(Boolean), ...comuni])];
}

function leggiCampi(form) {
  const f = new FormData(form);
  return {
    titolo: String(f.get('titolo') || '').trim(),
    autore: String(f.get('autore') || '').trim(),
    pagine: intero(f.get('pagine')),
    anno: intero(f.get('anno')),
    genere: String(f.get('genere') || '').trim(),
    editore: String(f.get('editore') || '').trim(),
    nota: String(f.get('nota') || '').trim()
  };
}

function moduloLibro({ campi, lista, daRicerca, isbnLetto = null }) {
  const scelta = lista && LISTE_AGGIUNTA.some(([s]) => s === lista) ? lista : 'da-leggere';
  const corpo = apriPannello({
    titolo: 'Aggiungi un libro',
    corpo: `<form novalidate>
      ${campi.copertina ? `<div class="scelto">${copertina({ ...campi, colore: 0 })}<p class="tenue piccolo">Controlla i dati: le pagine cambiano da un’edizione all’altra.</p></div>` : ''}
      ${campiLibro(campi)}
      <fieldset class="campo">
        <legend class="etichetta">In quale lista?</legend>
        <div class="scelte">${LISTE_AGGIUNTA.map(([s, nome]) => `<label class="scelta"><input type="radio" name="stato" value="${s}" ${s === scelta ? 'checked' : ''}><span>${nome}</span></label>`).join('')}</div>
      </fieldset>
      <label class="campo" id="campo-finito" hidden><span>Finito il</span>
        <input type="date" name="finito" value="${oggi()}" max="${oggi()}">
        <small>Se non ricordi il giorno, va bene una data vicina.</small></label>
      <label class="campo" id="campo-pagina" hidden><span>Sono già a pagina <span class="tenue" style="font-weight:400">(se l’hai già cominciato)</span></span>
        <input name="paginaIniziale" value="" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off">
        <small>Le pagine lette finora non entrano nelle statistiche: si conta da qui in avanti.</small></label>
      <label class="campo"><span>Perché questo libro <span class="tenue" style="font-weight:400">(facoltativo)</span></span>
        <textarea name="nota" maxlength="2000" rows="2" placeholder="Chi te l’ha consigliato, cosa ti incuriosisce…">${esc(campi.nota || '')}</textarea></label>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni">
        <button type="button" class="bottone bottone--secondario" id="indietro">Torna alla ricerca</button>
        <button type="submit" class="bottone">Aggiungi alla libreria</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form');
  const campoFinito = corpo.querySelector('#campo-finito');
  const campoPagina = corpo.querySelector('#campo-pagina');
  // "Finito il" serve solo per un libro già letto, "Sono già a pagina" solo per uno che stai leggendo
  const mostraFinito = () => { campoFinito.hidden = form.elements.stato.value !== 'letto'; campoPagina.hidden = form.elements.stato.value !== 'leggendo'; };
  form.addEventListener('change', mostraFinito); mostraFinito();
  corpo.querySelector('#indietro').addEventListener('click', () => apriAggiungiLibro({ lista, testo: daRicerca || '', isbnLetto }));

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const c = leggiCampi(form), errore = corpo.querySelector('#errore');
    if (!c.titolo) { errore.textContent = 'Scrivi almeno il titolo.'; errore.hidden = false; form.elements.titolo.focus(); return; }
    const stato = form.elements.stato.value;
    const nuovo = { ...campi, ...c };
    const gia = doppione(data.libri, nuovo);
    if (gia && !(await conferma(`“${gia.titolo}” è già in libreria, nella lista “${NOMI_STATO[gia.stato]}”.`, { ok: 'Aggiungilo lo stesso', annulla: 'Annulla' }))) return;
    const finito = stato === 'letto' && chiaveValida(form.elements.finito.value) && form.elements.finito.value <= oggi() ? form.elements.finito.value : null;
    const paginaIniziale = stato === 'leggendo' ? intero(form.elements.paginaIniziale.value) || 0 : 0;
    if (paginaIniziale && c.pagine && paginaIniziale > c.pagine) { errore.textContent = `Il libro ha ${c.pagine} pagine: controlla la pagina a cui sei.`; errore.hidden = false; form.elements.paginaIniziale.focus(); return; }
    const l = aggiungiLibro(nuovo, stato, finito, paginaIniziale);
    ui.lista = stato; ui.cercaLibri = '';
    if (stato === 'letto') {
      // un libro già letto: subito voto e due righe, finché il ricordo c'è (si può saltare)
      chiudiPannello();
      vaiPoi('#/libro/' + l.id, () => apriGiudizio(l.id, { appenaAggiunto: true }));
    } else {
      chiudiPannello();
      if (stato === 'leggendo') vai('#/libro/' + l.id);
      else { vai('#/libreria'); avviso(`Aggiunto a “${NOMI_STATO[stato]}”`, { etichetta: 'Apri', azione: () => vai('#/libro/' + l.id) }); }
    }
  });
}

// ---------- modifica della scheda ----------

export function apriModificaLibro(id) {
  const l = libro(id);
  if (!l) return;
  // le date si possono correggere: "iniziato" per i libri cominciati, "finito" per quelli letti o abbandonati
  const conFine = l.stato === 'letto' || l.stato === 'abbandonato';
  const conDate = conFine || l.stato === 'leggendo';
  const corpo = apriPannello({
    titolo: 'Modifica il libro',
    corpo: `<form novalidate>
      ${campiLibro(l)}
      <label class="campo"><span>Perché questo libro <span class="tenue" style="font-weight:400">(facoltativo)</span></span>
        <textarea name="nota" maxlength="2000" rows="2">${esc(l.nota)}</textarea></label>
      ${conDate ? `<div class="campi-2">
        <label class="campo"><span>Iniziato il</span>
          <input type="date" name="iniziato" value="${l.iniziato || ''}" max="${oggi()}"></label>
        ${conFine ? `<label class="campo"><span>${l.stato === 'abbandonato' ? 'Abbandonato il' : 'Finito il'}</span>
          <input type="date" name="finito" value="${l.finito || ''}" max="${oggi()}"></label>` : ''}
      </div>` : ''}
      ${l.copertina ? `<label class="campo" style="display:flex;gap:10px;align-items:center"><input type="checkbox" name="togli-copertina" style="width:22px;min-height:22px;height:22px;flex:none"> <span style="margin:0;font-weight:400">Togli l’immagine di copertina (resta quella disegnata)</span></label>` : ''}
      <p class="errore" id="errore" hidden></p>
      <div class="azioni"><button type="submit" class="bottone">Salva le modifiche</button></div>
    </form>`
  });
  const form = corpo.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const c = leggiCampi(form), errore = corpo.querySelector('#errore');
    if (!c.titolo) { errore.textContent = 'Il titolo non può restare vuoto.'; errore.hidden = false; form.elements.titolo.focus(); return; }
    if (c.pagine && l.pagina > c.pagine && l.stato !== 'letto') {
      errore.textContent = `Hai segnato di essere a pagina ${l.pagina}: le pagine totali non possono essere meno.`; errore.hidden = false; form.elements.pagine.focus(); return;
    }
    if (form.elements['togli-copertina'] && form.elements['togli-copertina'].checked) c.copertina = null;
    if (l.stato === 'letto' && c.pagine) c.pagina = c.pagine;
    if (conDate) {
      const sbagliata = (testo, campo) => { errore.textContent = testo; errore.hidden = false; campo.focus(); };
      const iniziato = form.elements.iniziato.value, finito = conFine ? form.elements.finito.value : '';
      if (iniziato && (!chiaveValida(iniziato) || iniziato > oggi())) return sbagliata('La data di inizio non può essere nel futuro.', form.elements.iniziato);
      if (conFine && (!chiaveValida(finito) || finito > oggi())) return sbagliata('Scrivi il giorno in cui l’hai finito, non nel futuro.', form.elements.finito);
      if (iniziato && finito && finito < iniziato) return sbagliata(`Non puoi averlo finito prima di iniziarlo (${ilGiorno(iniziato)}).`, form.elements.finito);
      c.iniziato = iniziato || null;
      if (conFine) c.finito = finito;
    }
    modificaLibro(id, c);
    chiudiPannello(); render();
    avviso('Modifiche salvate');
  });
}
