// Il "telaio" dell'app: sceglie quale schermata disegnare in base all'indirizzo (#/oggi, #/libro/…),
// disegna la barra in basso e offre i pezzi usati da più schermate (copertina, nastro, stelle, avvisi).
//
// Le schermate e le azioni si "registrano" qui (registraVista, registraAzioni): così questo file
// non deve conoscerle una per una, e ogni schermata sta nel suo file.
import { data, libro, tempoTimer, salvataggioRiuscito } from '../dati.js';
import { esc, oggi, cronometro, plurale } from '../utili.js';
import { icona } from '../icone.js';
import { percento, daRipassare } from '../calcoli.js';

const viste = {};   // nome → funzione che restituisce l'HTML della schermata
const azioni = {};  // nome → funzione chiamata quando si tocca un elemento con data-azione="nome"
const scritture = {}; // nome → funzione chiamata mentre si scrive in un campo con data-scrivi="nome"

export function registraVista(nome, fn) { viste[nome] = fn; }
export function registraAzioni(nuove) { Object.assign(azioni, nuove); }
export function registraScritture(nuove) { Object.assign(scritture, nuove); }
export function azione(nome) { return azioni[nome]; }
export function scrittura(nome) { return scritture[nome]; }

// ---------- indirizzi ----------
// L'indirizzo dopo il # dice quale schermata mostrare: "#/libro/x123" → { nome: 'libro', id: 'x123' }.
// Usare l'indirizzo (e non una variabile) fa funzionare il tasto "indietro" del telefono.
export function rotta() {
  const [nome, id] = location.hash.replace(/^#\/?/, '').split('/');
  let idLetto = null;
  // un indirizzo scritto male (es. "%" da solo) farebbe fallire decodeURIComponent: lo si tratta come "nessun id"
  try { idLetto = id ? decodeURIComponent(id) : null; } catch (e) { idLetto = null; }
  return { nome: Object.hasOwn(viste, nome) ? nome : 'oggi', id: idLetto };
}
export function vai(hash) {
  if (location.hash === hash) { render(); window.scrollTo(0, 0); }
  else location.hash = hash;
}
// Va a una schermata e, appena è disegnata, fa una cosa (di solito: apre un pannello).
// Serve perché il cambio di schermata chiude i pannelli aperti: chi ne vuole aprire uno deve farlo DOPO.
export function vaiPoi(hash, poi) {
  if (location.hash === hash) { render(); window.scrollTo(0, 0); poi(); return; }
  // questo ascoltatore è aggiunto dopo quello di app.js, quindi viene chiamato dopo che la schermata è cambiata
  window.addEventListener('hashchange', () => poi(), { once: true });
  location.hash = hash;
}

const SCHEDE = [
  { nome: 'oggi', testo: 'Oggi', icona: 'libro' },
  { nome: 'libreria', testo: 'Libreria', icona: 'libreria' },
  { nome: 'quaderno', testo: 'Quaderno', icona: 'quaderno' },
  { nome: 'statistiche', testo: 'Statistiche', icona: 'statistiche' },
  { nome: 'altro', testo: 'Altro', icona: 'altro' }
];
// a quale scheda in basso appartiene ogni schermata
const SCHEDA_DI = { libro: 'libreria', lettura: 'oggi' };

export function render() {
  const r = rotta();
  const app = document.getElementById('app');
  // Ridisegnare cancella l'elemento che aveva il fuoco della tastiera: si ricorda qual era per ridarglielo dopo.
  const attivo = app.contains(document.activeElement) ? document.activeElement : null;
  const ritrova = attivo && (attivo.dataset.azione || attivo.dataset.scrivi)
    ? ['azione', 'scrivi', 'id', 'libro'].filter(k => attivo.dataset[k] !== undefined).map(k => `[data-${k}="${CSS.escape(attivo.dataset[k])}"]`).join('')
    : null;
  try {
    app.innerHTML = viste[r.nome](r);
  } catch (errore) {
    // Non dovrebbe succedere; ma se una schermata non riesce a disegnarsi, la barra in basso deve restare
    // usabile per arrivare ad "Altro" e scaricare un backup.
    console.error(errore);
    app.innerHTML = `<div class="vuoto"><h1 class="titolo-scheda">Questa schermata non si apre</h1>
      <p>C’è un problema con i dati salvati. Vai in Altro e scarica un backup, così non perdi niente.</p>
      <a class="bottone" href="#/altro">Vai ad Altro</a></div>`;
  }
  disegnaSchede(r);
  disegnaStriscia(r);
  document.title = titoloPagina(r);
  // la lista o la sezione scelta potrebbe essere fuori dallo schermo (la riga scorre di lato): la si porta in vista
  for (const riga of app.querySelectorAll('.segmenti')) {
    const scelto = riga.querySelector('[aria-pressed="true"]');
    if (scelto) riga.scrollLeft = Math.max(0, scelto.offsetLeft - (riga.clientWidth - scelto.offsetWidth) / 2);
  }
  if (ritrova) { const stesso = app.querySelector(ritrova); if (stesso) stesso.focus({ preventScroll: true }); }
}

function titoloPagina(r) {
  if (r.nome === 'libro') { const l = libro(r.id); if (l) return l.titolo + ' – I miei libri'; }
  const s = SCHEDE.find(x => x.nome === (SCHEDA_DI[r.nome] || r.nome));
  return (s ? s.testo + ' – ' : '') + 'I miei libri';
}

function disegnaSchede(r) {
  const attiva = SCHEDA_DI[r.nome] || r.nome;
  const ripasso = daRipassare(data.parole, oggi()).length;
  document.getElementById('schede').innerHTML = SCHEDE.map(s => `
    <a href="#/${s.nome}" ${s.nome === attiva ? 'aria-current="page"' : ''}>
      ${icona(s.icona)}<span>${s.testo}</span>
      ${s.nome === 'quaderno' && ripasso ? `<span class="pallino" aria-label="${plurale(ripasso, 'parola', 'parole')} da ripassare">${ripasso > 99 ? '99+' : ripasso}</span>` : ''}
    </a>`).join('');
}

// La striscia rossa sopra la barra: ricorda che il cronometro sta andando, da qualunque schermata.
function disegnaStriscia(r) {
  const el = document.getElementById('striscia');
  const l = data.timer ? libro(data.timer.libroId) : null;
  const visibile = !!l && r.nome !== 'lettura';
  document.body.classList.toggle('con-timer', visibile);
  el.innerHTML = visibile ? `<div class="striscia-timer"><a href="#/lettura">
    <span>${data.timer.inPausa ? 'In pausa' : 'Stai leggendo'}: ${esc(l.titolo)}</span>
    <span class="numero" data-tempo>${cronometro(tempoTimer())}</span></a></div>` : '';
}

// Aggiorna solo i numeri del cronometro, senza ridisegnare la schermata (chiamata ogni secondo da app.js).
export function aggiornaTempo() {
  if (!data.timer) return;
  const t = cronometro(tempoTimer());
  for (const el of document.querySelectorAll('[data-tempo]')) if (el.textContent !== t) el.textContent = t;
}

// ---------- avvisi ----------

// Messaggio che i lettori di schermo leggono ad alta voce (non si vede).
export function annuncia(testo) {
  const el = document.getElementById('annuncio');
  el.textContent = '';
  setTimeout(() => { el.textContent = testo; }, 50);
}

// Avviso breve in basso, che sparisce da solo. Con "azione" mostra anche un pulsante (es. "Annulla").
let timerAvviso = null;
//   errore: true per gli avvisi che dicono che qualcosa è andato storto
// Se l'ultimo salvataggio non è riuscito, gli avvisi di successo ("Salvato") non vengono mostrati:
// sarebbe una bugia, e c'è già l'avviso dell'errore.
export function avviso(testo, { etichetta = '', azione: fn = null, durata = 3500, errore = false } = {}) {
  if (!errore && !salvataggioRiuscito()) return;
  const t = document.getElementById('toast');
  clearTimeout(timerAvviso);
  t.innerHTML = `<div class="toast" role="status"><span>${esc(testo)}</span>${fn ? `<button type="button">${esc(etichetta)}</button>` : ''}</div>`;
  if (fn) t.querySelector('button').onclick = () => { t.innerHTML = ''; fn(); };
  timerAvviso = setTimeout(() => { t.innerHTML = ''; }, fn ? Math.max(durata, 6000) : durata);
}

// ---------- pezzi usati da più schermate ----------

// Copertina di un libro: sotto c'è sempre quella disegnata (tinta + titolo); se c'è l'immagine le sta sopra.
// Se l'immagine non si carica (offline, indirizzo che non esiste più) si toglie da sola e resta quella disegnata.
export function copertina(l, misura = '') {
  const img = l.copertina
    ? `<img src="${esc(l.copertina)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()" onload="if(this.naturalWidth<10)this.remove()">`
    : '';
  // una parola lunga (più di 7 lettere) fa rimpicciolire il titolo, così entra senza spezzarsi
  const lunga = Math.max(...String(l.titolo).split(/\s+/).map(p => p.length));
  const scala = lunga > 7 ? Math.max(0.55, 7 / lunga).toFixed(2) : 1;
  return `<span class="copertina${misura ? ' copertina--' + misura : ''} tinta-${l.colore ?? 0}" style="--s:${scala}" aria-hidden="true">
    <span class="copertina-testo"><b>${esc(l.titolo)}</b><i>${esc(l.autore || '')}</i></span>${img}</span>`;
}

// Il blocco delle pagine con il nastro segnalibro al punto giusto.
export function nastro(l) {
  const p = percento(l);
  const fermo = p === null || (p === 0 && l.stato !== 'leggendo');
  return `<div class="blocco${fermo ? ' blocco--fermo' : ''}" style="--p:${p ?? 0}%" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p ?? 0}" aria-label="Avanzamento della lettura"></div>`;
}

// Stelle del voto, solo da guardare.
export function stelle(voto) {
  if (!voto) return '';
  return `<span class="stelle" role="img" aria-label="Voto: ${voto} su 5">${[1, 2, 3, 4, 5].map(n => icona('stella', n <= voto ? 'piena' : '')).join('')}</span>`;
}

// Mette il tratto di evidenziatore sulla parola dentro la frase in cui l'hai trovata.
// Cerca anche le forme vicine (plurali, verbi coniugati): basta che la parola della frase cominci
// con le prime lettere della parola salvata.
export function fraseEvidenziata(frase, parola) {
  frase = String(frase);
  const p = String(parola).trim();
  if (p.length < 3) return esc(frase);
  const radice = p.length > 5 ? p.slice(0, p.length - 2) : p.length > 3 ? p.slice(0, p.length - 1) : p;
  const perRegex = radice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let trovata = null;
  try { trovata = new RegExp(`(^|[^\\p{L}])(${perRegex}[\\p{L}’']*)`, 'iu').exec(frase); } catch (e) { trovata = null; }
  if (!trovata) return esc(frase);
  // la frase si divide in tre pezzi (prima, parola, dopo) e ognuno viene protetto per conto suo
  const inizio = trovata.index + trovata[1].length, fine = inizio + trovata[2].length;
  return `${esc(frase.slice(0, inizio))}<span class="evid">${esc(frase.slice(inizio, fine))}</span>${esc(frase.slice(fine))}`;
}
