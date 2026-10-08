// Tutti i conti dell'app: avanzamento, serie di giorni, statistiche, stime, ripasso delle parole.
// Sono funzioni "pure": ricevono i dati e il giorno di oggi, restituiscono un risultato e non toccano
// nient'altro (né lo schermo né il salvataggio). Per questo si possono provare con i test in tests/.
import { piuGiorni, giorniTra, dataDi, lunediDi, semplice } from './utili.js';

// ---------- avanzamento di un libro ----------

// Percentuale letta, da 0 a 100; null se non si sa quante pagine ha il libro.
export function percento(libro) {
  if (libro.stato === 'letto') return 100;
  if (!libro.pagine) return null;
  return Math.min(100, Math.max(0, Math.round((libro.pagina / libro.pagine) * 100)));
}
export function pagineMancanti(libro) {
  if (!libro.pagine) return null;
  return Math.max(0, libro.pagine - libro.pagina);
}
// Numero da proporre per il prossimo riassunto: uno in più del capitolo più alto già scritto.
export function prossimoCapitolo(libro) {
  return libro.capitoli.reduce((max, c) => Math.max(max, c.numero), 0) + 1;
}
export function capitoliInOrdine(libro) {
  return [...libro.capitoli].sort((a, b) => a.numero - b.numero || a.data.localeCompare(b.data));
}

// ---------- letture (cronometro, aggiunte a mano, aggiornamenti di pagina) ----------

// Pagine lette in una lettura: da "da" fino ad "a"; 0 se manca uno dei due.
export function pagineDi(lettura) {
  if (!Number.isFinite(lettura.da) || !Number.isFinite(lettura.a)) return 0;
  return Math.max(0, lettura.a - lettura.da);
}
// Una lettura "conta" come giorno di lettura se ha dei minuti o delle pagine.
const conta = l => l.minuti > 0 || pagineDi(l) > 0;

// Somma minuti e pagine per giorno: { "2026-10-08": { minuti, pagine } }
export function perGiorno(letture) {
  const giorni = {};
  for (const l of letture) {
    if (!conta(l)) continue;
    const g = giorni[l.giorno] || (giorni[l.giorno] = { minuti: 0, pagine: 0 });
    g.minuti += l.minuti; g.pagine += pagineDi(l);
  }
  return giorni;
}

// Serie di giorni consecutivi con almeno una lettura.
// "attuale" arriva fino a oggi; se oggi non hai ancora letto la serie non è persa: si conta fino a ieri.
export function serie(letture, oggiK) {
  const giorni = Object.keys(perGiorno(letture)).filter(k => k <= oggiK).sort();
  const fatti = new Set(giorni);
  const fattoOggi = fatti.has(oggiK);
  let attuale = 0;
  for (let k = fattoOggi ? oggiK : piuGiorni(oggiK, -1); fatti.has(k); k = piuGiorni(k, -1)) attuale++;
  let record = 0, corrente = 0, precedente = null;
  for (const k of giorni) {
    corrente = precedente && giorniTra(precedente, k) === 1 ? corrente + 1 : 1;
    if (corrente > record) record = corrente;
    precedente = k;
  }
  return { attuale, record, fattoOggi };
}

// I sette giorni (da lunedì a domenica) della settimana di oggi: per i pallini in "Oggi".
export function settimana(letture, oggiK) {
  const giorni = perGiorno(letture), lun = lunediDi(oggiK);
  return Array.from({ length: 7 }, (_, i) => {
    const k = piuGiorni(lun, i);
    return { giorno: k, fatto: !!giorni[k], oggi: k === oggiK, futuro: k > oggiK };
  });
}

// Velocità di lettura in pagine all'ora, dalle letture che hanno sia i minuti sia le pagine.
// Se per questo libro ci sono almeno 30 minuti misurati si usa la sua velocità (ogni libro ha la sua),
// altrimenti quella di tutti i libri. null finché non ci sono abbastanza dati (meno di 20 minuti).
export function ritmo(letture, libroId = null) {
  const somma = lista => {
    let minuti = 0, pagine = 0;
    for (const l of lista) if (l.minuti > 0 && pagineDi(l) > 0) { minuti += l.minuti; pagine += pagineDi(l); }
    return { minuti, pagine };
  };
  if (libroId) {
    const s = somma(letture.filter(l => l.libroId === libroId));
    if (s.minuti >= 30) return (s.pagine / s.minuti) * 60;
  }
  const t = somma(letture);
  return t.minuti >= 20 ? (t.pagine / t.minuti) * 60 : null;
}

// Quanto manca a finire il libro.
//   minuti: tempo di lettura che resta, alla tua velocità (null se non si può stimare)
//   giorno: il giorno in cui lo finirai se continui come nelle ultime due settimane (null se non hai letto)
export function stima(libro, letture, oggiK) {
  const mancano = pagineMancanti(libro);
  if (!mancano) return { minuti: null, giorno: null };
  const r = ritmo(letture, libro.id);
  const minuti = r ? Math.round((mancano / r) * 60) : null;
  // media di pagine al giorno negli ultimi 14 giorni (contando anche i giorni senza lettura)
  const dal = piuGiorni(oggiK, -13);
  // i giorni si contano da quando hai iniziato il libro, se è meno di due settimane fa
  // (così non entrano nel conto le letture di una volta precedente, se lo stai rileggendo)
  const inizio = libro.iniziato && libro.iniziato > dal ? libro.iniziato : dal;
  let pagine = 0;
  for (const l of letture) if (l.libroId === libro.id && l.giorno >= inizio && l.giorno <= oggiK) pagine += pagineDi(l);
  const giorniContati = Math.max(1, giorniTra(inizio, oggiK) + 1);
  const alGiorno = pagine / giorniContati;
  const giorno = alGiorno > 0 ? piuGiorni(oggiK, Math.ceil(mancano / alGiorno)) : null;
  return { minuti, giorno };
}

// ---------- statistiche di un anno ----------

// I libri finiti in un anno, dal più recente. Un libro riletto compare una volta per ogni volta che l'hai finito
// in quell'anno: ogni voce è una copia del libro con "finito" messo a quel giorno.
export function libriFiniti(libri, anno) {
  const finiti = [];
  for (const l of libri) {
    const giorni = [...(l.finitoPrima || []), l.stato === 'letto' ? l.finito : null];
    for (const g of giorni) if (g && g.startsWith(anno + '-')) finiti.push(g === l.finito ? l : { ...l, finito: g });
  }
  return finiti.sort((a, b) => b.finito.localeCompare(a.finito));
}

export function statisticheAnno(dati, anno) {
  const finiti = libriFiniti(dati.libri, anno);
  const mesi = Array.from({ length: 12 }, () => ({ pagine: 0, minuti: 0, libri: 0 }));
  let pagine = 0, minuti = 0;
  const giorni = new Set();
  for (const l of dati.letture) {
    if (!l.giorno.startsWith(anno + '-') || !conta(l)) continue;
    const m = Number(l.giorno.slice(5, 7)) - 1;
    mesi[m].pagine += pagineDi(l); mesi[m].minuti += l.minuti;
    pagine += pagineDi(l); minuti += l.minuti; giorni.add(l.giorno);
  }
  for (const l of finiti) mesi[Number(l.finito.slice(5, 7)) - 1].libri++;

  const votati = finiti.filter(l => l.voto > 0);
  const votoMedio = votati.length ? votati.reduce((s, l) => s + l.voto, 0) / votati.length : null;

  // autori letti più volte nell'anno
  const perAutore = {};
  for (const l of finiti) if (l.autore) perAutore[l.autore] = (perAutore[l.autore] || 0) + 1;
  const autori = Object.entries(perAutore).map(([nome, n]) => ({ nome, n })).sort((a, b) => b.n - a.n || a.nome.localeCompare(b.nome));

  const conPagine = finiti.filter(l => l.pagine);
  const piuLungo = conPagine.length ? conPagine.reduce((a, b) => (b.pagine > a.pagine ? b : a)) : null;

  return {
    finiti, mesi, pagine, minuti, giorni: giorni.size, votoMedio, autori, piuLungo,
    pagineLibriFiniti: conPagine.reduce((s, l) => s + l.pagine, 0)
  };
}

// Gli anni di cui c'è qualcosa da mostrare, dal più recente; l'anno in corso c'è sempre.
export function anniConDati(dati, oggiK) {
  const anni = new Set([oggiK.slice(0, 4)]);
  for (const l of dati.libri) {
    if (l.finito) anni.add(l.finito.slice(0, 4));
    for (const g of l.finitoPrima || []) anni.add(g.slice(0, 4));
  }
  for (const l of dati.letture) anni.add(l.giorno.slice(0, 4));
  return [...anni].sort().reverse();
}

// Obiettivo di libri nell'anno: a che punto dovresti essere oggi per arrivarci.
//   attesi: libri che "dovresti" aver finito a oggi andando a passo costante
//   scarto: finiti - attesi (positivo = in anticipo)
//   stato:  'raggiunto' | 'in-linea' | 'avanti' | 'indietro' | 'mancato' (anno finito senza arrivarci)
export function obiettivoAnno(finiti, obiettivo, anno, oggiK) {
  if (!obiettivo) return null;
  const inizio = anno + '-01-01', fine = anno + '-12-31';
  const giorniAnno = giorniTra(inizio, fine) + 1;
  const passati = oggiK > fine ? giorniAnno : oggiK < inizio ? 0 : giorniTra(inizio, oggiK) + 1;
  const attesi = Math.floor((obiettivo * passati) / giorniAnno);
  const scarto = finiti - attesi;
  const stato = finiti >= obiettivo ? 'raggiunto' : oggiK > fine ? 'mancato' : scarto > 0 ? 'avanti' : scarto < 0 ? 'indietro' : 'in-linea';
  return { obiettivo, finiti, attesi, scarto, stato, percento: Math.min(100, Math.round((finiti / obiettivo) * 100)) };
}

// Griglia delle ultime settimane (colonne = settimane, righe = giorni da lunedì a domenica).
// livello: 0 niente, poi da 1 a 4 secondo quanto hai letto (minuti, oppure pagine se non hai cronometrato).
export function grigliaAttivita(letture, oggiK, settimane = 18) {
  const giorni = perGiorno(letture);
  const primo = piuGiorni(lunediDi(oggiK), -7 * (settimane - 1));
  return Array.from({ length: settimane }, (_, s) => Array.from({ length: 7 }, (_, g) => {
    const k = piuGiorni(primo, s * 7 + g);
    const d = giorni[k];
    const quanto = d ? Math.max(d.minuti, d.pagine) : 0;
    const livello = !quanto ? 0 : quanto < 15 ? 1 : quanto < 30 ? 2 : quanto < 60 ? 3 : 4;
    return { giorno: k, livello, futuro: k > oggiK, minuti: d ? d.minuti : 0, pagine: d ? d.pagine : 0 };
  }));
}

// ---------- ripasso delle parole (ripetizione dilazionata) ----------
// Ogni parola ha un livello da 0 a 5. Se la sai, sale di un livello e la rivedi più in là;
// se non la ricordi, torna a 0 e la rivedi domani. Giorni di attesa per ogni livello raggiunto:
export const INTERVALLI = [1, 3, 7, 16, 35, 90];
export const LIVELLO_MASSIMO = INTERVALLI.length - 1;
export const NOMI_LIVELLO = ['nuova', 'vista una volta', 'la sto imparando', 'quasi mia', 'la conosco', 'imparata'];

export function daRipassare(parole, oggiK) {
  return parole.filter(p => p.prossimo <= oggiK)
    .sort((a, b) => a.prossimo.localeCompare(b.prossimo) || a.livello - b.livello);
}

// Restituisce la parola aggiornata dopo una risposta (non modifica quella ricevuta).
export function dopoRipasso(parola, saputa, oggiK) {
  const livello = saputa ? Math.min(LIVELLO_MASSIMO, parola.livello + 1) : 0;
  return {
    ...parola,
    livello,
    prossimo: piuGiorni(oggiK, saputa ? INTERVALLI[livello] : 1),
    ripassi: parola.ripassi + 1,
    errori: parola.errori + (saputa ? 0 : 1)
  };
}

export function riepilogoParole(parole, oggiK) {
  return {
    totale: parole.length,
    daRipassare: daRipassare(parole, oggiK).length,
    imparate: parole.filter(p => p.livello >= LIVELLO_MASSIMO).length,
    perLivello: Array.from({ length: LIVELLO_MASSIMO + 1 }, (_, i) => parole.filter(p => p.livello === i).length)
  };
}

// ---------- elenchi ----------

// Ordina i libri di una lista nel modo più utile per quella lista.
export function libriDi(libri, stato, letture = []) {
  const lista = libri.filter(l => l.stato === stato);
  if (stato === 'letto' || stato === 'abbandonato') {
    return lista.sort((a, b) => (b.finito || b.aggiunto).localeCompare(a.finito || a.aggiunto));
  }
  if (stato === 'leggendo') {
    // prima quello che hai letto più di recente
    const ultima = new Map();
    for (const s of letture) if (!ultima.has(s.libroId) || s.giorno > ultima.get(s.libroId)) ultima.set(s.libroId, s.giorno);
    const chiave = l => ultima.get(l.id) || l.iniziato || l.aggiunto;
    return lista.sort((a, b) => chiave(b).localeCompare(chiave(a)));
  }
  // da leggere / voglio leggere: gli ultimi aggiunti in cima
  return lista.sort((a, b) => b.aggiunto.localeCompare(a.aggiunto) || a.titolo.localeCompare(b.titolo));
}

// Cerca in titolo, autore e genere, senza badare ad accenti e maiuscole.
export function cercaLibri(libri, testo) {
  const q = semplice(testo);
  if (!q) return libri;
  const pezzi = q.split(' ');
  return libri.filter(l => { const dove = semplice(`${l.titolo} ${l.autore} ${l.genere}`); return pezzi.every(p => dove.includes(p)); });
}

export function cercaParole(parole, testo) {
  const q = semplice(testo);
  if (!q) return parole;
  return parole.filter(p => semplice(`${p.parola} ${p.significato}`).includes(q));
}

// C'è già in libreria un libro con questo ISBN, o con lo stesso titolo e autore?
export function doppione(libri, nuovo, tranneId = null) {
  // "semplice" toglie tutto ciò che non è una lettera latina: per i titoli in altri alfabeti (cirillico, giapponese…)
  // resterebbe vuoto e sembrerebbero tutti uguali, quindi lì si confronta il titolo com'è scritto
  const perConfronto = s => semplice(s) || String(s ?? '').trim().toLowerCase();
  const t = perConfronto(nuovo.titolo), a = perConfronto(nuovo.autore || '');
  return libri.find(l => l.id !== tranneId && (
    (nuovo.isbn && l.isbn && l.isbn === nuovo.isbn) ||
    (perConfronto(l.titolo) === t && perConfronto(l.autore) === a)
  )) || null;
}

// Giorno della settimana in cui leggi di più (0 = domenica … 6 = sabato); null se non ci sono letture.
export function giornoPreferito(letture) {
  const tot = [0, 0, 0, 0, 0, 0, 0];
  const giorni = perGiorno(letture);
  for (const [k, d] of Object.entries(giorni)) tot[dataDi(k).getDay()] += Math.max(d.minuti, d.pagine);
  const max = Math.max(...tot);
  return max > 0 ? tot.indexOf(max) : null;
}
