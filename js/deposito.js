// Il "deposito": dove l'app tiene i dati tra un'apertura e l'altra.
// Di norma è il localStorage del browser. Ma in certi casi il browser non lo concede (navigazione privata
// con i dati dei siti bloccati, alcune finestre incorporate): invece di rompersi, l'app usa un deposito
// finto che vive solo in memoria. Si può usare lo stesso, ma chiudendo la pagina si perde tutto:
// "soloInMemoria" lo dice, così la schermata Oggi può avvisare.
const memoria = new Map();
const finto = {
  getItem: k => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => { memoria.set(k, String(v)); },
  removeItem: k => { memoria.delete(k); }
};

// Il localStorage c'è e si lascia leggere? (Si prova solo a leggere: una scrittura potrebbe fallire
// anche solo perché la memoria è piena, e in quel caso i dati già salvati vanno letti lo stesso.)
function vero() {
  try { globalThis.localStorage.getItem('libri-prova'); return globalThis.localStorage; }
  catch (e) { return null; }
}

// __LIBRI_ANTEPRIMA__: l'anteprima dimostrativa dell'app usa sempre il deposito finto, con dati di esempio.
export const soloInMemoria = !!globalThis.__LIBRI_ANTEPRIMA__ || !vero();
export const deposito = soloInMemoria ? finto : globalThis.localStorage;
