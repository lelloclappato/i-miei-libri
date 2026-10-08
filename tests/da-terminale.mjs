// Esegue gli stessi test senza browser:  node tests/da-terminale.mjs
// (serve Node.js; è comodo per un controllo veloce, ma la pagina tests/test.html resta il modo principale)
// Node non ha localStorage: se ne costruisce uno finto in memoria.
const memoria = new Map();
globalThis.localStorage = {
  getItem: k => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => { memoria.set(k, String(v)); },
  removeItem: k => { memoria.delete(k); }
};
globalThis.__LIBRI_PROVA__ = true;
await import('./tutti.test.js');
