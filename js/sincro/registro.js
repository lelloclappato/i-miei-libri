// SINCRONIZZAZIONE, la parte senza rete: capire cosa è cambiato, impacchettare i dati,
// unire due copie (questo dispositivo e quella su Google Drive) e ricostruire i dati dell'app.
// Questo file è identico in tutte le mie app: ogni app descrive i suoi dati con uno "schema".
//
//   schema = {
//     raccolte: [
//       { percorso: 'libri', chiave: l => l.id,                       // un elenco di oggetti con un id…
//         figli: [{ campo: 'capitoli', chiave: c => c.id }] },         // …che possono contenere elenchi a loro volta
//       { percorso: 'logs', mappa: true }                              // un oggetto { chiave: valore }
//     ],
//     singoli: ['impostazioni', 'timer']                               // pezzi che si sincronizzano interi
//   }
//   Tutto quello che non è nello schema resta solo su questo dispositivo (es. il giorno dell'ultimo backup).
//
// Come si capisce cosa è cambiato, senza toccare il resto dell'app: dopo ogni salvataggio si confronta
// ogni elemento con la sua "impronta" dell'ultima volta. Se è diversa, l'elemento è stato modificato adesso;
// se l'elemento non c'è più, è stato eliminato e se ne tiene una traccia (così non "risorge" dall'altra copia).
// Queste informazioni stanno nel "registro", salvato a parte: i dati dell'app restano esattamente come prima.
//
// Come si uniscono due copie: elemento per elemento vince la versione modificata per ultima;
// un elemento eliminato dopo la sua ultima modifica sparisce.

export const FORMATO = 1;
const MAX_ELIMINATI = 5000;                 // tracce delle eliminazioni ricordate al massimo…
const DURATA_ELIMINATI = 730 * 86400000;    // …e per al massimo due anni

// JSON con le chiavi sempre nello stesso ordine: due oggetti uguali danno lo stesso testo
export function stabile(v) {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stabile).join(',') + ']';
  return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stabile(v[k])).join(',') + '}';
}

// un'impronta corta di un testo (cyrb53): due testi diversi danno quasi sempre impronte diverse
export function impronta(testo) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const copia = v => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

// Scompone i dati in elementi: Map chiave → { v: valore, p, c, g, f, s }
//   p = percorso della raccolta, c = chiave dell'elemento, g = chiave del genitore e f = campo (per i figli),
//   s = nome di un pezzo "singolo". Un elemento con figli NON contiene i figli: sono elementi a sé.
export function elementi(dati, schema) {
  const m = new Map();
  for (const r of schema.raccolte || []) {
    const contenuto = dati[r.percorso];
    if (r.mappa) {
      if (!contenuto || typeof contenuto !== 'object') continue;
      for (const [c, v] of Object.entries(contenuto)) m.set(`${r.percorso}:${c}`, { v: copia(v), p: r.percorso, c });
      continue;
    }
    if (!Array.isArray(contenuto)) continue;
    const figli = r.figli || [];
    for (const x of contenuto) {
      if (!x || typeof x !== 'object') continue;
      const c = r.chiave(x);
      if (c === null || c === undefined || c === '') continue;
      const k = `${r.percorso}:${c}`;
      const v = copia(x);
      for (const f of figli) delete v[f.campo];
      m.set(k, { v, p: r.percorso, c });
      for (const f of figli) {
        for (const y of Array.isArray(x[f.campo]) ? x[f.campo] : []) {
          if (!y || typeof y !== 'object') continue;
          const cf = f.chiave(y);
          if (cf === null || cf === undefined || cf === '') continue;
          m.set(`${k}/${f.campo}:${cf}`, { v: copia(y), p: r.percorso, c: cf, g: c, f: f.campo });
        }
      }
    }
  }
  for (const s of schema.singoli || []) {
    if (s in dati) m.set(`=${s}`, { v: copia(dati[s]), s });
  }
  return m;
}

// Il contrario: rimette insieme i dati partendo da "base" (che dà tutto ciò che non si sincronizza)
// e dagli elementi, nell'ordine in cui sono. I figli il cui genitore non c'è più si scartano.
export function ricostruisci(base, elems, schema) {
  const out = { ...base };
  const genitori = new Map();
  for (const r of schema.raccolte || []) out[r.percorso] = r.mappa ? {} : [];
  const perPercorso = new Map((schema.raccolte || []).map(r => [r.percorso, r]));
  const lista = elems instanceof Map ? [...elems.values()] : Object.values(elems);
  for (const e of lista) {
    if (e.s !== undefined) { out[e.s] = copia(e.v); continue; }
    if (e.g !== undefined) continue;
    const r = perPercorso.get(e.p);
    if (!r) continue;
    if (r.mappa) { out[e.p][e.c] = copia(e.v); continue; }
    const v = copia(e.v);
    for (const f of r.figli || []) v[f.campo] = [];
    out[e.p].push(v);
    genitori.set(`${e.p}:${e.c}`, v);
  }
  for (const e of lista) {
    if (e.g === undefined) continue;
    const genitore = genitori.get(`${e.p}:${e.g}`);
    if (genitore && Array.isArray(genitore[e.f])) genitore[e.f].push(copia(e.v));
  }
  return out;
}

// ---------- il registro ----------
// { iniziato, sincronizzato, impronte: { chiave: impronta }, mod: { chiave: ms }, eliminati: { chiave: ms } }

export function registroVuoto() {
  return { iniziato: false, sincronizzato: false, impronte: {}, mod: {}, eliminati: {} };
}

function potaEliminati(eliminati, ora) {
  const voci = Object.entries(eliminati).filter(([, t]) => ora - t < DURATA_ELIMINATI);
  voci.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(voci.slice(0, MAX_ELIMINATI));
}

// Da chiamare dopo ogni salvataggio dell'app. Aggiorna il registro e dice se qualcosa è cambiato.
// La prima volta (registro mai usato) tutto quello che c'è riceve la data 1, cioè "vecchio":
// così i dati che il dispositivo aveva già non vincono contro modifiche vere fatte altrove.
export function osserva(registro, dati, schema, ora = Date.now()) {
  const elems = elementi(dati, schema);
  let cambiati = 0;
  if (!registro.iniziato) {
    registro.iniziato = true;
    for (const [k, e] of elems) { registro.impronte[k] = impronta(stabile(e.v)); registro.mod[k] = 1; }
    return elems.size;
  }
  for (const [k, e] of elems) {
    const h = impronta(stabile(e.v));
    if (registro.impronte[k] !== h) {
      registro.impronte[k] = h;
      registro.mod[k] = Math.max(ora, (registro.eliminati[k] || 0) + 1, (registro.mod[k] || 0) + 1);
      delete registro.eliminati[k];
      cambiati++;
    }
  }
  for (const k of Object.keys(registro.impronte)) {
    if (!elems.has(k)) {
      delete registro.impronte[k]; delete registro.mod[k];
      registro.eliminati[k] = ora;
      cambiati++;
    }
  }
  registro.eliminati = potaEliminati(registro.eliminati, ora);
  return cambiati;
}

// Il pacchetto che va su Drive: tutti gli elementi con la loro data di modifica, e le eliminazioni.
export function pacchetto(registro, dati, schema) {
  const out = { formato: FORMATO, elementi: {}, eliminati: { ...registro.eliminati } };
  for (const [k, e] of elementi(dati, schema)) out.elementi[k] = { ...e, m: registro.mod[k] || 1 };
  return out;
}

export function pacchettoValido(p) {
  return !!p && typeof p === 'object' && p.formato === FORMATO && !!p.elementi && typeof p.elementi === 'object'
    && !Array.isArray(p.elementi) && (!p.eliminati || typeof p.eliminati === 'object');
}

// Unisce due pacchetti. A parità di data vince "b" (la copia già su Drive).
// L'ordine segue "a", poi gli elementi che ha solo "b".
export function unisci(a, b) {
  const eliminati = { ...(a.eliminati || {}) };
  for (const [k, t] of Object.entries(b.eliminati || {})) if (!(eliminati[k] >= t)) eliminati[k] = t;
  const elementiOut = {};
  const chiavi = [...Object.keys(a.elementi), ...Object.keys(b.elementi).filter(k => !(k in a.elementi))];
  for (const k of chiavi) {
    const x = a.elementi[k], y = b.elementi[k];
    const scelto = !x ? y : !y ? x : (x.m > y.m ? x : y);
    if (eliminati[k] !== undefined && eliminati[k] >= scelto.m) continue;
    delete eliminati[k];
    elementiOut[k] = scelto;
  }
  return { formato: FORMATO, elementi: elementiOut, eliminati };
}

// Dopo aver scritto i dati uniti: il registro torna a descrivere esattamente i dati che l'app ha adesso,
// con le date di modifica dell'unione. Quello che l'unione conteneva ma l'app ha scartato (es. un figlio
// rimasto senza genitore) conta come eliminato.
export function allinea(registro, dati, schema, unito, ora = Date.now()) {
  const elems = elementi(dati, schema);
  registro.iniziato = true;
  registro.impronte = {}; registro.mod = {};
  registro.eliminati = { ...unito.eliminati };
  for (const [k, e] of elems) {
    const h = impronta(stabile(e.v)), u = unito.elementi[k];
    registro.impronte[k] = h;
    // se il valore non è quello dell'unione (cambiato qui mentre si sincronizzava, o sistemato dall'app) è "nuovo"
    registro.mod[k] = u && impronta(stabile(u.v)) === h ? u.m : Math.max(ora, u ? u.m + 1 : 0);
    delete registro.eliminati[k];
  }
  for (const k of Object.keys(unito.elementi)) if (!elems.has(k)) registro.eliminati[k] = ora;
  registro.eliminati = potaEliminati(registro.eliminati, ora);
}

// impronta di tutto un pacchetto, per capire se c'è bisogno di riscriverlo
export function improntaPacchetto(p) {
  return impronta(stabile({ elementi: p.elementi, eliminati: p.eliminati || {} }));
}
// impronta dei soli dati sincronizzati, per capire se l'unione ha cambiato qualcosa su questo dispositivo
export function improntaDati(dati, schema) {
  return impronta(stabile([...elementi(dati, schema)]));
}
