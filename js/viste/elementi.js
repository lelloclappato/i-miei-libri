// Pezzi di schermata usati sia nella pagina di un libro sia nel Quaderno: una parola, una citazione.
import { esc, quandoTesto } from '../utili.js';
import { icona } from '../icone.js';
import { LIVELLO_MASSIMO, NOMI_LIVELLO } from '../calcoli.js';
import { fraseEvidenziata } from './comune.js';

// Cinque tacche che si riempiono man mano che impari la parola.
export function tacche(livello) {
  return `<span class="tacche" role="img" aria-label="${esc(NOMI_LIVELLO[livello])}">${Array.from({ length: LIVELLO_MASSIMO }, (_, i) => `<i${i < livello ? ' class="su"' : ''}></i>`).join('')}</span>`;
}

// Una parola del quaderno: toccandola si apre per modificarla.
export function voceParola(p, { conLibro = true } = {}) {
  const dove = [conLibro && p.titoloLibro ? p.titoloLibro : '', p.pagina !== null ? 'pagina ' + p.pagina : ''].filter(Boolean).join(', ');
  return `<li><button type="button" class="voce" data-azione="apri-parola" data-id="${esc(p.id)}">
    <span class="voce-testa"><span class="parola"><span class="evid">${esc(p.parola)}</span></span>${tacche(p.livello)}</span>
    ${p.significato.trim() ? `<span class="significato">${esc(p.significato)}</span>` : '<span class="significato tenue">Significato ancora da scrivere</span>'}
    ${p.frase.trim() ? `<span class="frase">«${fraseEvidenziata(p.frase.trim(), p.parola)}»</span>` : ''}
    ${dove ? `<span class="dove">${esc(dove)}</span>` : ''}
  </button></li>`;
}

// Una citazione con il cuore (preferita), copia e modifica.
export function bloccoCitazione(c, l, { conLibro = true } = {}) {
  const dove = c.pagina !== null ? 'pagina ' + c.pagina : quandoTesto(c.data);
  return `<li class="citazione">
    <blockquote>${esc(c.testo.trim())}</blockquote>
    ${c.nota.trim() ? `<p class="nota">${esc(c.nota)}</p>` : ''}
    <div class="citazione-piede">
      <span>${conLibro ? `<a href="#/libro/${esc(l.id)}">${esc(l.titolo)}</a>, ` : ''}${esc(dove)}</span>
      <span class="gruppo">
        <button type="button" class="tonda tonda--nuda" data-azione="preferita" data-libro="${esc(l.id)}" data-id="${esc(c.id)}" aria-pressed="${c.preferita}" aria-label="Tra le preferite">${icona('cuore')}</button>
        <button type="button" class="tonda tonda--nuda" data-azione="copia-citazione" data-libro="${esc(l.id)}" data-id="${esc(c.id)}" aria-label="Copia la citazione">${icona('copia')}</button>
        <button type="button" class="tonda tonda--nuda" data-azione="apri-citazione" data-libro="${esc(l.id)}" data-id="${esc(c.id)}" aria-label="Modifica la citazione">${icona('matita')}</button>
      </span>
    </div>
  </li>`;
}

// Copia un testo negli appunti del telefono; restituisce true se ci è riuscita.
export async function copia(testo) {
  try { await navigator.clipboard.writeText(testo); return true; }
  catch (e) {
    // vecchio metodo, per i browser che non danno accesso agli appunti
    const t = document.createElement('textarea');
    t.value = testo; t.style.position = 'fixed'; t.style.opacity = '0';
    (document.querySelector('dialog[open]') || document.body).appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    t.remove();
    return ok;
  }
}

// Fa scaricare un file di testo creato al momento.
export function scarica(nome, contenuto, tipo = 'text/plain') {
  const blob = new Blob([contenuto], { type: tipo + ';charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
