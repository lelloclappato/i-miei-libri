// Il formato dei dati dell'app, e la funzione che completa/ripara dati incompleti o di versioni vecchie.
//
// {
//   version: 1,
//   ultimoBackup: "AAAA-MM-GG" | null,
//   libri: [{
//     id, titolo, autore, pagine, anno, editore, isbn, genere,
//     copertina,            // indirizzo dell'immagine, oppure null (si disegna una copertina colorata)
//     origine,              // 'openlibrary' | 'google' | 'manuale'
//     stato,                // 'leggendo' | 'da-leggere' | 'voglio' | 'letto' | 'abbandonato'
//     aggiunto, iniziato, finito,   // giorni "AAAA-MM-GG" (iniziato e finito possono essere null)
//     finitoPrima,          // se lo stai rileggendo (o l'hai riletto): i giorni in cui l'avevi già finito
//     pagina,               // pagina a cui sei arrivato
//     voto,                 // 0 = nessun voto, altrimenti da 1 a 5
//     recensione, nota,
//     capitoli:  [{ id, numero, titolo, riassunto, finoAPagina, data }],
//     citazioni: [{ id, testo, pagina, nota, preferita, data }]
//   }],
//   parole:  [{ id, parola, significato, frase, libroId, titoloLibro, pagina, data,
//               livello, prossimo, ripassi, errori }],   // livello 0-5 e "prossimo" servono al ripasso
//   letture: [{ id, libroId, giorno, minuti, da, a, tipo }],  // tipo: 'timer' | 'manuale' | 'pagina'
//   timer:   null | { libroId, inizio, accumulato, inPausa, giornoInizio, paginaInizio }, // lettura in corso (cronometro)
//   impostazioni: { obiettivi: { "2026": 12 }, tema: 'auto' | 'chiaro' | 'scuro', chiaveGoogle: '' },
//   scartati: ["OL123W", …]  // consigli a cui hai detto "No, grazie": non vengono più proposti (vedi consigli.js)
// }
import { oggi, uid, chiaveValida, piuGiorni } from './utili.js';

export const CURRENT_VERSION = 1;

// Le liste in cui può stare un libro, nell'ordine in cui compaiono nella Libreria.
export const STATI = ['leggendo', 'da-leggere', 'voglio', 'letto', 'abbandonato'];
export const NOMI_STATO = {
  'leggendo': 'Sto leggendo',
  'da-leggere': 'Da leggere',
  'voglio': 'Voglio leggere',
  'letto': 'Letti',
  'abbandonato': 'Abbandonati'
};
// La stessa cosa detta di un libro solo ("Letto", non "Letti")
export const NOME_STATO_LIBRO = {
  'leggendo': 'Lo sto leggendo',
  'da-leggere': 'Da leggere',
  'voglio': 'Voglio leggerlo',
  'letto': 'Letto',
  'abbandonato': 'Abbandonato'
};
export const TEMI = ['auto', 'chiaro', 'scuro'];
export const COLORI_COPERTINA = 7; // quante tinte ha la copertina disegnata (vedi css/style.css)

export function impostazioniBase() {
  return { obiettivi: {}, tema: 'auto', chiaveGoogle: '' };
}

export function datiVuoti() {
  return { version: CURRENT_VERSION, ultimoBackup: null, libri: [], parole: [], letture: [], timer: null, impostazioni: impostazioniBase(), scartati: [] };
}

// ---------- piccoli aiuti per riparare i campi ----------
const testo = (v, max = 20000) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v)).slice(0, max);
const interoONull = v => (Number.isFinite(v) && v >= 0 ? Math.round(v) : null);
const giornoONull = v => (chiaveValida(v) ? v : null);
const oggetto = v => !!v && typeof v === 'object' && !Array.isArray(v);
// Quanti consigli scartati si ricordano al massimo: oltre, si dimenticano i più vecchi.
export const MAX_SCARTATI = 1000;
// Un consiglio scartato si riconosce dalla sua "chiave": il codice dell'opera su Open Library ("OL123W")
// oppure, se manca, titolo e autore semplificati ("il nome della rosa|umberto eco").
export const chiaveScartatoValida = v => typeof v === 'string' && /^[a-z0-9 |A-Z_-]{1,200}$/.test(v);
// Un id va bene solo se è fatto di lettere, cifre, "-" e "_": finisce negli indirizzi (#/libro/…) e nell'HTML.
// Se non va bene (o manca) se ne crea uno nuovo.
const idBuono = v => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(v) ? v : uid());
// Dà un id nuovo a ogni elemento che ha lo stesso id di uno venuto prima (può capitare in un backup ritoccato a mano):
// due cose con lo stesso id si confonderebbero quando ne modifichi o elimini una.
function idUnici(lista) {
  const visti = new Set();
  for (const x of lista) { while (visti.has(x.id)) x.id = uid(); visti.add(x.id); }
  return lista;
}

// tinta della copertina disegnata: sempre la stessa per lo stesso titolo
export function coloreDaTitolo(titolo) {
  let h = 0;
  for (const c of String(titolo)) h = (h * 31 + c.codePointAt(0)) % 9973;
  return h % COLORI_COPERTINA;
}

export function ripulisciCapitolo(c) {
  return {
    id: idBuono(c.id),
    numero: interoONull(c.numero) ?? 1,
    titolo: testo(c.titolo, 200).trim(),
    riassunto: testo(c.riassunto),
    finoAPagina: interoONull(c.finoAPagina),
    data: giornoONull(c.data) || oggi()
  };
}

export function ripulisciCitazione(c) {
  return {
    id: idBuono(c.id),
    testo: testo(c.testo, 5000),
    pagina: interoONull(c.pagina),
    nota: testo(c.nota, 2000),
    preferita: c.preferita === true,
    data: giornoONull(c.data) || oggi()
  };
}

export function ripulisciLibro(l) {
  const stato = STATI.includes(l.stato) ? l.stato : 'da-leggere';
  const pagine = interoONull(l.pagine) || null; // 0 pagine non ha senso: vale come "non lo so"
  let pagina = interoONull(l.pagina) ?? 0;
  if (pagine && pagina > pagine) pagina = pagine;
  const titolo = testo(l.titolo, 300).trim() || 'Senza titolo';
  return {
    id: idBuono(l.id),
    titolo,
    autore: testo(l.autore, 200).trim(),
    pagine,
    anno: interoONull(l.anno) || null,
    editore: testo(l.editore, 200).trim(),
    isbn: testo(l.isbn, 20).replace(/[^0-9Xx]/g, ''),
    genere: testo(l.genere, 80).trim(),
    copertina: typeof l.copertina === 'string' && /^https:\/\//.test(l.copertina) ? l.copertina.slice(0, 500) : null,
    colore: Number.isInteger(l.colore) && l.colore >= 0 && l.colore < COLORI_COPERTINA ? l.colore : coloreDaTitolo(titolo),
    origine: ['openlibrary', 'google', 'manuale'].includes(l.origine) ? l.origine : 'manuale',
    stato,
    aggiunto: giornoONull(l.aggiunto) || oggi(),
    iniziato: giornoONull(l.iniziato),
    finito: giornoONull(l.finito),
    finitoPrima: [...new Set((Array.isArray(l.finitoPrima) ? l.finitoPrima : []).filter(chiaveValida))].sort(),
    pagina,
    voto: Number.isInteger(l.voto) && l.voto >= 1 && l.voto <= 5 ? l.voto : 0,
    recensione: testo(l.recensione),
    nota: testo(l.nota, 2000),
    capitoli: idUnici((Array.isArray(l.capitoli) ? l.capitoli : []).filter(oggetto).map(ripulisciCapitolo)),
    citazioni: idUnici((Array.isArray(l.citazioni) ? l.citazioni : []).filter(oggetto).map(ripulisciCitazione).filter(c => c.testo.trim()))
  };
}

export function ripulisciParola(p) {
  const data = giornoONull(p.data) || oggi();
  return {
    id: idBuono(p.id),
    parola: testo(p.parola, 120).trim(),
    significato: testo(p.significato, 3000),
    frase: testo(p.frase, 3000),
    libroId: typeof p.libroId === 'string' && p.libroId ? p.libroId : null,
    titoloLibro: testo(p.titoloLibro, 300),
    pagina: interoONull(p.pagina),
    data,
    livello: Number.isInteger(p.livello) && p.livello >= 0 && p.livello <= 5 ? p.livello : 0,
    prossimo: giornoONull(p.prossimo) || piuGiorni(data, 1),
    ripassi: interoONull(p.ripassi) ?? 0,
    errori: interoONull(p.errori) ?? 0
  };
}

export function ripulisciLettura(s) {
  const adesso = oggi();
  let giorno = giornoONull(s.giorno) || adesso;
  if (giorno > adesso) giorno = adesso; // una lettura non può essere nel futuro
  return {
    id: idBuono(s.id),
    libroId: testo(s.libroId, 40),
    giorno,
    minuti: Math.min(interoONull(s.minuti) ?? 0, 24 * 60),
    da: interoONull(s.da),
    a: interoONull(s.a),
    tipo: ['timer', 'manuale', 'pagina'].includes(s.tipo) ? s.tipo : 'manuale'
  };
}

// Porta qualunque oggetto al formato attuale: aggiunge i campi che mancano, scarta quelli rotti.
// Va bene sia per dati di una versione vecchia sia per un backup scritto male.
export function upgrade(d) {
  const base = datiVuoti();
  if (!oggetto(d)) return base;
  const libri = [], idUsati = new Set();
  // Parole, letture e cronometro puntano al loro libro tramite l'id scritto nel file. Se quell'id è stato
  // cambiato (non valido, oppure doppione di un altro libro) qui si ricorda quale ha preso il suo posto.
  const idVero = new Map();
  for (const grezzo of (Array.isArray(d.libri) ? d.libri : []).filter(oggetto)) {
    const l = ripulisciLibro(grezzo);
    while (idUsati.has(l.id)) l.id = uid(); // due libri non possono avere lo stesso id
    idUsati.add(l.id);
    if (typeof grezzo.id === 'string' && !idVero.has(grezzo.id)) idVero.set(grezzo.id, l.id);
    libri.push(l);
  }
  const libroDi = id => (typeof id === 'string' && idVero.has(id) ? idVero.get(id) : null);

  // una parola che punta a un libro che non c'è più resta, ma senza collegamento
  const parole = idUnici((Array.isArray(d.parole) ? d.parole : []).filter(oggetto)
    .map(p => ripulisciParola({ ...p, libroId: libroDi(p.libroId) })).filter(p => p.parola));

  // una lettura senza il suo libro non serve più; una senza minuti né pagine neanche
  const letture = idUnici((Array.isArray(d.letture) ? d.letture : []).filter(oggetto)
    .filter(s => libroDi(s.libroId)).map(s => ripulisciLettura({ ...s, libroId: libroDi(s.libroId) }))
    .filter(s => s.minuti > 0 || (s.da !== null && s.a !== null && s.a > s.da)));

  const imp = oggetto(d.impostazioni) ? d.impostazioni : {};
  const obiettivi = {};
  if (oggetto(imp.obiettivi)) {
    for (const [anno, n] of Object.entries(imp.obiettivi)) {
      if (/^\d{4}$/.test(anno) && Number.isInteger(n) && n > 0 && n <= 999) obiettivi[anno] = n;
    }
  }

  let timer = null;
  if (oggetto(d.timer) && libroDi(d.timer.libroId) && Number.isFinite(d.timer.inizio)) {
    timer = {
      libroId: libroDi(d.timer.libroId), inizio: d.timer.inizio,
      accumulato: Number.isFinite(d.timer.accumulato) ? Math.max(0, d.timer.accumulato) : 0,
      inPausa: d.timer.inPausa === true,
      giornoInizio: giornoONull(d.timer.giornoInizio) || oggi(),   // il giorno in cui è partito: la lettura va a quel giorno
      paginaInizio: interoONull(d.timer.paginaInizio)              // la pagina a cui eri quando è partito
    };
  }

  return {
    version: CURRENT_VERSION,
    ultimoBackup: giornoONull(d.ultimoBackup),
    libri, parole, letture, timer,
    impostazioni: {
      obiettivi,
      tema: TEMI.includes(imp.tema) ? imp.tema : 'auto',
      chiaveGoogle: testo(imp.chiaveGoogle, 100).trim()
    },
    scartati: [...new Set((Array.isArray(d.scartati) ? d.scartati : []).filter(chiaveScartatoValida))].slice(-MAX_SCARTATI)
  };
}
