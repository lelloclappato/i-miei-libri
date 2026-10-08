// Piccole funzioni di uso generale: date, numeri, testo.
// Non sanno nulla dei libri: si possono riusare ovunque.

export const APP_VERSION = '1.1';

export const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato']; // indice = Date.getDay()
export const GIORNI_INIZIALI = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];
export const MESI = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
export const MESI_BREVI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

// ---------- date ----------
// Un giorno è identificato da una "chiave" testuale AAAA-MM-GG (es. "2026-10-08"),
// che si confronta in ordine alfabetico come in ordine di tempo.
export function pad(n) { return String(n).padStart(2, '0'); }
export function chiaveDi(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
export function oggi() { return chiaveDi(new Date()); }
export function dataDi(k) { const [a, m, g] = k.split('-').map(Number); return new Date(a, m - 1, g); }
export function piuGiorni(k, n) { const d = dataDi(k); d.setDate(d.getDate() + n); return chiaveDi(d); }
// quanti giorni passano da a fino a b (b - a); usa mezzogiorno per non inciampare nel cambio d'ora
export function giorniTra(a, b) {
  const da = dataDi(a), db = dataDi(b);
  da.setHours(12); db.setHours(12);
  return Math.round((db - da) / 86400000);
}
// lunedì della settimana che contiene il giorno k
export function lunediDi(k) { const d = dataDi(k); return piuGiorni(k, -((d.getDay() + 6) % 7)); }
// una chiave è scritta bene ed è un giorno che esiste davvero? ("2026-02-31" no)
export function chiaveValida(k) {
  if (typeof k !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return false;
  return chiaveDi(dataDi(k)) === k;
}

// "8 ottobre 2026"; con breve = true "8 ott 2026"; senza l'anno se è quello in corso e annoSempre = false
export function dataTesto(k, { breve = false, annoSempre = true } = {}) {
  if (!k) return '';
  const d = dataDi(k);
  const mese = (breve ? MESI_BREVI : MESI)[d.getMonth()];
  const conAnno = annoSempre || d.getFullYear() !== new Date().getFullYear();
  return `${d.getDate()} ${mese}${conAnno ? ' ' + d.getFullYear() : ''}`;
}
// In italiano l'articolo si accorcia davanti a "otto" e "undici": l'8 ottobre, l'11 marzo, l'80º libro.
function siElide(n) { return n === 11 || String(n).charAt(0) === '8'; }
// La data con l'articolo davanti: "il 7 ottobre 2026", "l’8 ottobre 2026", "il 1º ottobre 2026".
// "con" sceglie la preposizione: 'il' (finito il…), 'del' (la lettura del…), 'al' (aggiornato al…).
export function ilGiorno(k, opzioni = {}, con = 'il') {
  const g = dataDi(k).getDate();
  const articolo = { il: ['il ', 'l’'], del: ['del ', 'dell’'], al: ['al ', 'all’'] }[con][siElide(g) ? 1 : 0];
  return articolo + dataTesto(k, opzioni).replace(/^1 /, '1º ');
}
// Un numero d'ordine con l'articolo: "il 3º", "l’8º", "il primo".
export function ilNumero(n) {
  if (n === 1) return 'il primo';
  return (siElide(n) ? 'l’' : 'il ') + n + 'º';
}
// "oggi", "ieri", "3 giorni fa", poi la data
export function quandoTesto(k, adesso = oggi()) {
  const n = giorniTra(k, adesso);
  if (n === 0) return 'oggi';
  if (n === 1) return 'ieri';
  if (n > 1 && n < 7) return `${n} giorni fa`;
  return dataTesto(k, { breve: true, annoSempre: false });
}

// ---------- numeri e testo ----------
export function uid() { return 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
export function limita(n, min, max) { return Math.min(max, Math.max(min, n)); }
// numero all'italiana con il punto delle migliaia: 12345 → "12.345"
export function num(n) { return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
// un decimale con la virgola: 3.75 → "3,8"
export function decimale(n) { return (Math.round(n * 10) / 10).toString().replace('.', ','); }
// sceglie singolare o plurale: plurale(1, 'libro', 'libri') → "1 libro"
export function plurale(n, uno, molti) { return `${num(n)} ${n === 1 ? uno : molti}`; }
// minuti in parole: 135 → "2 h 15 min", 40 → "40 min", 120 → "2 h"
export function durata(minuti) {
  const m = Math.max(0, Math.round(minuti));
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r} min`;
  return r ? `${h} h ${r} min` : `${h} h`;
}
// cronometro: millisecondi → "1:05:09" oppure "05:09"
export function cronometro(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (h ? h + ':' + pad(m) : pad(m)) + ':' + pad(sec);
}

// "esc" rende sicuro un testo scritto dall'utente prima di metterlo nell'HTML
// (altrimenti un titolo come "<b>" verrebbe interpretato come codice)
export function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
// come esc, ma gli "a capo" del testo diventano <br>
export function escRighe(s) { return esc(s).replace(/\n/g, '<br>'); }

// Toglie accenti e maiuscole, per cercare e confrontare: "Perché" → "perche"
export function semplice(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
// prima lettera maiuscola
export function maiuscola(s) { s = String(s ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); }
// un numero intero ≥ 0 da quello che l'utente ha scritto in un campo; null se vuoto o non valido
export function intero(v) {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Math.round(Number(String(v).replace(',', '.')));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
