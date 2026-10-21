// La logica della modalità Mercatino: dato un libro trovato su una bancarella (dal codice a barre o dalle
// parole lette sulla copertina), capire quale libro è e dirti se ti interessa:
//   'desiderio'  è nella tua lista dei desideri
//   'ce-l-hai'   è già nella tua libreria (letto, da leggere, in lettura, abbandonato): niente doppioni
//   'piacere'    potrebbe piacerti (è tra i "Per te", è di un autore che ti è piaciuto, è un genere che leggi)
//   'attenzione' è di un autore che ti è piaciuto poco
//   'neutro'     niente di particolare per i tuoi gusti
// Le parole lette dalla fotocamera sono spesso sporche ("IRRTOLKIEN ANELLI"): il confronto con i titoli
// è tollerante (una o due lettere sbagliate, parole attaccate). Le funzioni pure hanno i loro test.
import { semplice } from './utili.js';
import { deposito } from './deposito.js';
import { STORE } from './dati.js';
import { cercaInRete } from './ricerca.js';

// Parole troppo comuni per riconoscere un titolo
const VUOTE = new Set(['il', 'lo', 'la', 'le', 'gli', 'un', 'una', 'uno', 'di', 'del', 'della', 'dello', 'dei', 'degli', 'delle', 'da', 'dal', 'dalla',
  'in', 'nel', 'nella', 'nei', 'con', 'per', 'tra', 'fra', 'su', 'sul', 'sulla', 'che', 'non', 'come', 'dove', 'quando', 'piu', 'mio', 'mia', 'tuo', 'suo',
  'the', 'and', 'of', 'romanzo', 'edizione', 'editore', 'libro', 'volume', 'oscar', 'tascabili', 'nuova', 'prima', 'bestseller']);

// Le parole che contano di un testo: semplificate, almeno 3 lettere, senza quelle comuni.
export function paroleChiave(testo) {
  return semplice(testo).split(' ').filter(p => p.length >= 3 && !VUOTE.has(p));
}

// Quante lettere bisogna cambiare per passare da una parola all'altra (distanza di Levenshtein).
export function distanza(a, b) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > 2) return 3; // basta sapere che è "tanta"
  let prima = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const ora = [i];
    for (let j = 1; j <= b.length; j++) ora[j] = Math.min(prima[j] + 1, ora[j - 1] + 1, prima[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prima = ora;
  }
  return prima[b.length];
}
// Due parole sono "la stessa" se sono uguali o se differiscono di poco: le parole di 4 lettere devono essere
// identiche ("rosa" non è "rosi"), da 5 a 6 lettere si perdona una lettera sbagliata, da 7 in su due.
export function simili(a, b) {
  if (a === b) return true;
  const corta = Math.min(a.length, b.length);
  if (corta < 5) return false;
  return distanza(a, b) <= (corta >= 7 ? 2 : 1);
}
const cognomeDi = autore => { const p = semplice(String(autore || '').split(',')[0]).split(' ').filter(Boolean); return p.length ? p[p.length - 1] : ''; };

// Quanto le parole lette somigliano a un libro: { titolo: frazione delle parole del titolo ritrovate (0-1),
// autore: il cognome dell'autore è tra le parole, lunghe: almeno una parola ritrovata è lunga (non un caso) }.
export function punteggio(parole, titolo, autore) {
  const lette = parole.flatMap(p => semplice(p).split(' ')).filter(Boolean);
  const unite = lette.join('');
  let t = paroleChiave(titolo);
  if (!t.length) t = semplice(titolo).split(' ').filter(p => p.length >= 2);
  const c = (p, lungaPerUnite) => lette.some(q => simili(p, q)) || (p.length >= lungaPerUnite && unite.includes(p));
  const trovate = t.filter(p => c(p, 6));
  const cognome = cognomeDi(autore);
  return {
    titolo: t.length ? trovate.length / t.length : 0,
    autore: cognome.length >= 3 && c(cognome, 5),
    lunghe: trovate.some(p => p.length >= 5) || (trovate.length >= 2)
  };
}

// Tra i candidati ({ titolo, autore, … }), quello che corrisponde alle parole lette; null se nessuno è abbastanza sicuro.
// Restituisce { candidato, sicurezza } (sicurezza tra 0 e 1.3).
export function riconosci(parole, candidati) {
  let meglio = null;
  for (const c of candidati) {
    if (!c || !c.titolo) continue;
    const p = punteggio(parole, c.titolo, c.autore);
    const nTitolo = paroleChiave(c.titolo).length;
    // un titolo di una parola sola (e corta) si riconosce solo se c'è anche l'autore: "Seta" da sola è troppo poco
    const ok = (p.titolo >= 0.6 && p.lunghe && (nTitolo > 1 || p.autore || paroleChiave(c.titolo)[0]?.length >= 6))
      || (p.titolo >= 0.5 && p.autore);
    if (!ok) continue;
    const sicurezza = p.titolo + (p.autore ? 0.3 : 0);
    if (!meglio || sicurezza > meglio.sicurezza || (sicurezza === meglio.sicurezza && nTitolo > paroleChiave(meglio.candidato.titolo).length)) meglio = { candidato: c, sicurezza };
  }
  return meglio;
}

// Due schede parlano dello stesso libro? (stesso ISBN, oppure titolo uguale o quasi e stesso autore)
// "Il colibrì" e "Il colibrì : romanzo" sì; "Il colibrì" di un altro autore no.
export function stessoLibro(a, b) {
  if (!a || !b) return false;
  if (a.isbn && b.isbn && a.isbn === b.isbn) return true;
  const ca = cognomeDi(a.autore), cb = cognomeDi(b.autore);
  if (ca && cb && ca !== cb && !simili(ca, cb)) return false;
  const ta = paroleChiave(a.titolo), tb = paroleChiave(b.titolo);
  if (!ta.length || !tb.length) return semplice(a.titolo) === semplice(b.titolo);
  const [corto, lungo] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  const ritrovate = corto.filter(p => lungo.some(q => simili(p, q))).length;
  return ritrovate / corto.length >= 0.8 && corto.length / lungo.length >= 0.5;
}

const virgolette = t => `«${t}»`;
const STELLE = n => (n === 1 ? '1 stella' : `${n} stelle`);

// Il giudizio su un libro trovato al mercatino.
//   trovato:   { titolo, autore, isbn, … } (dal catalogo, dalla tua libreria o dai consigli)
//   libri:     la tua libreria
//   consigli:  i consigli "Per te" salvati (con il loro motivo)
//   gusti:     i tuoi generi preferiti [{ chiave, motivo }] (vedi gustiSalvati in consigli.js)
//   argomenti: gli argomenti del libro trovato, se Open Library li ha detti (altrimenti null)
// Restituisce { tipo, titolo (la frase grande), motivo (la frase piccola), libro (il tuo, se ce l'hai) }.
export function giudica(trovato, libri, { consigli = [], gusti = [], argomenti = null } = {}) {
  const tuo = libri.find(l => stessoLibro(l, trovato));
  if (tuo && tuo.stato === 'voglio') {
    return { tipo: 'desiderio', titolo: 'È nella tua lista dei desideri!', motivo: tuo.nota ? tuo.nota.split('\n')[0].slice(0, 140) : 'L’avevi segnato tra i libri che vuoi leggere.', libro: tuo };
  }
  if (tuo) {
    const dove = { 'letto': 'L’hai già letto', 'leggendo': 'Lo stai leggendo', 'da-leggere': 'Ce l’hai già: è tra i tuoi “Da leggere”', 'abbandonato': 'L’avevi cominciato e lasciato' }[tuo.stato];
    const voto = tuo.stato === 'letto' && tuo.voto ? ` (gli hai dato ${STELLE(tuo.voto)})` : '';
    return { tipo: 'ce-l-hai', titolo: 'Ce l’hai già', motivo: dove + voto + '.', libro: tuo };
  }
  const consiglio = consigli.find(c => stessoLibro(c, trovato));
  if (consiglio) return { tipo: 'piacere', titolo: 'Potrebbe piacerti', motivo: `Era tra i tuoi consigli “Per te”: ${consiglio.motivo}.`, libro: null };

  const cognome = cognomeDi(trovato.autore);
  const stessoAutore = cognome ? libri.filter(l => cognomeDi(l.autore) === cognome) : [];
  const piaciuti = stessoAutore.filter(l => (l.stato === 'letto' && l.voto >= 4) || l.stato === 'leggendo')
    .sort((a, b) => (b.voto || 0) - (a.voto || 0));
  if (piaciuti.length) {
    const p = piaciuti[0];
    const perche = p.stato === 'leggendo' ? 'che stai leggendo' : `a cui hai dato ${STELLE(p.voto)}`;
    return { tipo: 'piacere', titolo: 'Potrebbe piacerti', motivo: `È dello stesso autore di ${virgolette(p.titolo)}, ${perche}.`, libro: null };
  }
  const delusioni = stessoAutore.filter(l => (l.stato === 'letto' && l.voto && l.voto <= 2) || l.stato === 'abbandonato');
  if (delusioni.length) {
    const d = delusioni[0];
    return { tipo: 'attenzione', titolo: 'Occhio', motivo: `È dello stesso autore di ${virgolette(d.titolo)}, che ${d.stato === 'abbandonato' ? 'hai lasciato a metà' : `ti è piaciuto poco (${STELLE(d.voto)})`}.`, libro: null };
  }
  const desiderati = stessoAutore.filter(l => l.stato === 'voglio');
  if (desiderati.length) return { tipo: 'piacere', titolo: 'Potrebbe piacerti', motivo: `Nei desideri hai già ${virgolette(desiderati[0].titolo)}, dello stesso autore.`, libro: null };
  if (Array.isArray(argomenti) && argomenti.length) {
    const g = gusti.find(x => argomenti.includes(x.chiave));
    if (g) return { tipo: 'piacere', titolo: 'Potrebbe piacerti', motivo: g.motivo + '.', libro: null };
  }
  const giaLetti = stessoAutore.filter(l => l.stato === 'letto');
  const nota = giaLetti.length ? ` Di questo autore hai già letto ${virgolette(giaLetti[0].titolo)}.` : '';
  return { tipo: 'neutro', titolo: 'Niente di speciale per i tuoi gusti', motivo: `Non è nella tua libreria né nei desideri.${nota}`, libro: null };
}

// Le parole da usare per cercare nei cataloghi un libro di cui si sono lette solo alcune parole:
// prima tutte le parole buone insieme, poi le due più lunghe una alla volta (una parola letta male,
// per esempio due parole attaccate, fa fallire la ricerca con tutte le altre). Al massimo tre ricerche.
export function ricercheDaParole(parole) {
  const buone = [...new Set(parole.flatMap(p => paroleChiave(p)).filter(p => p.length >= 4 && /[aeiou]/.test(p) && !/(.)\1\1/.test(p)))];
  const perLunghezza = [...buone].sort((a, b) => b.length - a.length);
  const prove = [buone.slice(0, 5).join(' '), ...perLunghezza.slice(0, 2)];
  return [...new Set(prove.filter(p => p.length >= 4))];
}

// ---------- in rete ----------

// Cerca nei cataloghi il libro di cui si sono lette queste parole. Restituisce { libro, altri, errore }:
//   libro = quello che corrisponde con sicurezza (o null); altri = i risultati migliori, per chiederti "è uno di questi?"
export async function cercaDaParole(parole, { segnale = null } = {}) {
  let altri = [], errore = false;
  for (const q of ricercheDaParole(parole)) {
    const r = await cercaInRete(q, { segnale, schede: false });
    if (r.errore) { errore = true; break; }
    const trovato = riconosci(parole, r.libri);
    if (trovato) return { libro: trovato.candidato, altri: r.libri.slice(0, 4), errore: false };
    if (!altri.length) altri = r.libri.slice(0, 4);
  }
  return { libro: null, altri, errore };
}

// ---------- i libri visti oggi ----------
// Restano sul telefono solo per la giornata (non vanno nel backup): servono a confrontare le bancarelle.
const NOME_VISTI = STORE + '-mercatino';
const MAX_VISTI = 60;
export function vistiOggi(giorno) {
  try {
    const v = JSON.parse(deposito.getItem(NOME_VISTI) || 'null');
    return v && v.giorno === giorno && Array.isArray(v.voci) ? v.voci : [];
  } catch (e) { return []; }
}
export function segnaVisto(giorno, voce) {
  const voci = vistiOggi(giorno).filter(v => !stessoLibro(v, voce));
  voci.unshift(voce);
  try { deposito.setItem(NOME_VISTI, JSON.stringify({ giorno, voci: voci.slice(0, MAX_VISTI) })); } catch (e) {}
  return voci;
}
