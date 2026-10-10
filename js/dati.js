// Tutto ciò che riguarda il salvataggio: leggere e scrivere i dati nel browser, e le operazioni
// che li cambiano (aggiungere un libro, segnare la pagina, salvare un riassunto…).
// Il formato dei dati è descritto in migrazione.js. Le schermate non modificano mai "data" a mano:
// chiamano le funzioni di questo file, così le regole stanno in un posto solo.
import { deposito } from './deposito.js';
import { oggi, uid, piuGiorni } from './utili.js';
import { upgrade, datiVuoti, CURRENT_VERSION, STATI, ripulisciLibro, ripulisciCapitolo, ripulisciCitazione, ripulisciParola, ripulisciLettura, TEMI, MAX_SCARTATI, chiaveScartatoValida } from './migrazione.js';
import { pagineDi } from './calcoli.js';

// Nome sotto cui i dati sono salvati nel browser. Deve essere unico: tutte le app
// pubblicate su lelloclappato.github.io condividono lo stesso localStorage.
// ("v1" è la versione del nome, non del formato: il formato è nel campo "version" dei dati.)
// (I test in tests/ usano un nome diverso, così non toccano mai i dati veri: vedi tests/test.html.)
export const STORE = globalThis.__LIBRI_PROVA__ ? 'libri-app-PROVA' : 'libri-app-v1';

// ---------- lettura ----------

function leggi() {
  let raw = null;
  try { raw = deposito.getItem(STORE); } catch (e) { return datiVuoti(); }
  if (raw === null) return datiVuoti();
  let d = null;
  try { d = JSON.parse(raw); } catch (e) { d = null; }
  if (!d || typeof d !== 'object' || !Array.isArray(d.libri)) {
    // c'è qualcosa di illeggibile: lo mettiamo da parte invece di sovrascriverlo
    copiaDiSicurezza('illeggibile', raw);
    return datiVuoti();
  }
  if (d.version !== CURRENT_VERSION) copiaDiSicurezza('backup-formato-v' + (d.version || 0), raw);
  return upgrade(d);
}

// Mette da parte una copia del testo salvato sotto un nome a sé, senza sovrascrivere
// una copia già esistente (la prima copia è quella più preziosa).
function copiaDiSicurezza(nome, raw) {
  const chiave = STORE + '-' + nome;
  try { if (deposito.getItem(chiave) === null) deposito.setItem(chiave, raw); } catch (e) {}
}

// I dati in memoria. Gli altri file li leggono con `import { data }`;
// per sostituirli del tutto (es. importando un backup) si usa setData.
export let data = leggi();
export function setData(d) { data = upgrade(d); return save(); }
// Rilegge i dati dal browser: serve quando li ha cambiati un'altra finestra della stessa app
// (per esempio l'app installata e una scheda del browser aperte insieme). Vedi app.js.
export function ricarica() { data = leggi(); }

// Se il salvataggio non riesce (memoria piena o bloccata) lo si dice tramite questa funzione,
// che app.js sostituisce con un avviso a schermo.
let avvisaErrore = () => {};
export function quandoNonSalva(fn) { avvisaErrore = fn; }
// L'ultimo salvataggio è andato a buon fine? Le schermate lo chiedono prima di dire "Salvato".
let ultimoRiuscito = true;
export function salvataggioRiuscito() { return ultimoRiuscito; }

export function save() {
  try { deposito.setItem(STORE, JSON.stringify(data)); ultimoRiuscito = true; return true; }
  catch (e) { ultimoRiuscito = false; avvisaErrore(); return false; }
}

// ---------- libri ----------

export function libro(id) { return data.libri.find(l => l.id === id) || null; }

// Aggiunge un libro nella lista scelta. "campi" arriva dalla ricerca o dal modulo scritto a mano.
//   giornoFine:      per un libro già letto, il giorno in cui l'hai finito
//   paginaIniziale:  per un libro che stai già leggendo, la pagina a cui sei: quelle pagine le hai lette
//                    prima di usare l'app, quindi non finiscono nel diario e nelle statistiche
export function aggiungiLibro(campi, stato = 'da-leggere', giornoFine = null, paginaIniziale = 0) {
  const l = ripulisciLibro({ ...campi, id: uid(), stato: 'da-leggere', aggiunto: oggi(), pagina: 0, finitoPrima: [], capitoli: [], citazioni: [] });
  data.libri.push(l);
  applicaStato(l, STATI.includes(stato) ? stato : 'da-leggere', giornoFine, false);
  if (l.stato === 'leggendo' && paginaIniziale > 0) l.pagina = l.pagine ? Math.min(paginaIniziale, l.pagine) : paginaIniziale;
  save();
  return l;
}

// Cambia i dati di scheda (titolo, autore, pagine, date…). Non tocca stato, capitoli e citazioni.
export function modificaLibro(id, campi) {
  const l = libro(id);
  if (!l) return null;
  const nuovo = ripulisciLibro({ ...l, ...campi, id: l.id, stato: l.stato, finitoPrima: l.finitoPrima, capitoli: l.capitoli, citazioni: l.citazioni });
  Object.assign(l, nuovo);
  // se il titolo cambia, le parole collegate ricordano il titolo nuovo
  for (const p of data.parole) if (p.libroId === l.id) p.titoloLibro = l.titolo;
  save();
  return l;
}

// Elimina un libro con i suoi riassunti, citazioni e letture.
// Le parole imparate restano nel quaderno, senza più il collegamento (ma con il titolo scritto).
// Toglie un libro dalla libreria, con il suo diario. Le parole imparate restano nel quaderno, senza collegamento.
// Restituisce una copia di quello che è stato tolto, da passare a ripristinaLibro per l'"Annulla".
export function eliminaLibro(id) {
  const indice = data.libri.findIndex(l => l.id === id);
  if (indice < 0) return null;
  const copia = {
    libro: JSON.parse(JSON.stringify(data.libri[indice])), indice,
    letture: data.letture.filter(s => s.libroId === id).map(s => ({ ...s })),
    parole: data.parole.filter(p => p.libroId === id).map(p => p.id),
    timer: data.timer && data.timer.libroId === id ? { ...data.timer } : null
  };
  data.libri.splice(indice, 1);
  data.letture = data.letture.filter(s => s.libroId !== id);
  for (const p of data.parole) if (p.libroId === id) p.libroId = null;
  if (data.timer && data.timer.libroId === id) data.timer = null;
  save();
  return copia;
}
// "Annulla" dopo aver tolto un libro: lo rimette dov'era, con diario, collegamento delle parole e cronometro.
export function ripristinaLibro(copia) {
  if (!copia || !copia.libro || libro(copia.libro.id)) return false;
  data.libri.splice(Math.min(copia.indice, data.libri.length), 0, copia.libro);
  data.letture.push(...copia.letture);
  for (const p of data.parole) if (copia.parole.includes(p.id) && !p.libroId) p.libroId = copia.libro.id;
  if (copia.timer && !data.timer) data.timer = copia.timer;
  save();
  return true;
}

// Le regole di ogni passaggio di lista. conLettura = registra le pagine che mancavano come lette quel giorno.
function applicaStato(l, stato, giorno, conLettura) {
  const g = giorno || oggi();
  const prima = l.stato;
  l.stato = stato;
  if (stato === 'leggendo') {
    if (!l.iniziato || prima === 'letto' || prima === 'abbandonato') l.iniziato = g; // una rilettura riparte da oggi
    if (prima === 'letto') {
      // rilettura: si riparte da pagina 0, ma resta scritto quando l'avevi finito la volta prima
      if (l.finito && !l.finitoPrima.includes(l.finito)) l.finitoPrima = [...l.finitoPrima, l.finito].sort();
      l.pagina = 0;
    }
    l.finito = null;
  } else if (stato === 'letto') {
    l.finito = g;
    if (!l.iniziato || l.iniziato > g) l.iniziato = null;
    if (l.pagine) {
      // le pagine che mancavano contano come lette nel giorno in cui l'hai finito,
      // ma solo se lo stavi leggendo: un libro letto anni fa non deve gonfiare le statistiche di oggi
      if (conLettura && prima === 'leggendo' && l.pagina < l.pagine) aggiungiPagine(l, l.pagina, l.pagine, g);
      l.pagina = l.pagine;
    }
  } else if (stato === 'abbandonato') {
    l.finito = g;
  } else {
    // da leggere / voglio leggere. Se era tra i letti vuol dire "in realtà non l'ho letto": si azzera tutto.
    if (prima === 'letto') { l.pagina = 0; l.iniziato = null; }
    l.finito = null;
  }
}

export function cambiaStato(id, stato, giorno = null) {
  const l = libro(id);
  if (!l || !STATI.includes(stato)) return null;
  // Chi smette di leggere un libro ferma anche il cronometro: il tempo passato finora non va perso,
  // diventa una lettura nel diario (se è almeno un minuto).
  if (stato !== 'leggendo' && data.timer && data.timer.libroId === id) {
    const minuti = Math.round(tempoTimer() / 60000);
    if (minuti >= 1 && minuti <= 24 * 60) data.letture.push(ripulisciLettura({ id: uid(), libroId: id, giorno: data.timer.giornoInizio, minuti, da: null, a: null, tipo: 'timer' }));
    data.timer = null;
  }
  applicaStato(l, stato, giorno, true);
  save();
  return l;
}

// Voto (0 = nessuno, 1-5) e recensione, di solito a fine libro.
export function salvaGiudizio(id, voto, recensione) {
  const l = libro(id);
  if (!l) return;
  l.voto = Number.isInteger(voto) && voto >= 1 && voto <= 5 ? voto : 0;
  l.recensione = String(recensione || '').trim();
  save();
}

// ---------- pagine e letture ----------

// Aggiunge pagine lette in un giorno come lettura di tipo "pagina" (senza minuti).
// Se quel giorno c'è già un aggiornamento che finisce dove questo comincia, lo allunga invece di crearne un altro.
function aggiungiPagine(l, da, a, giorno) {
  const stessa = data.letture.find(s => s.libroId === l.id && s.giorno === giorno && s.tipo === 'pagina' && s.a === da);
  if (stessa) stessa.a = a;
  else data.letture.push(ripulisciLettura({ id: uid(), libroId: l.id, giorno, minuti: 0, da, a, tipo: 'pagina' }));
}

// La pagina più avanti a cui sei già arrivato in questa lettura del libro (cioè da quando l'hai iniziato):
// fino a lì le pagine sono già nel diario, e non vanno contate una seconda volta.
function giaContate(l) {
  let max = 0;
  for (const s of data.letture) {
    if (s.libroId === l.id && Number.isFinite(s.a) && (!l.iniziato || s.giorno >= l.iniziato)) max = Math.max(max, s.a);
  }
  return max;
}

// Prima di registrare una lettura con le sue pagine (da → a): gli aggiornamenti di pagina dello stesso giorno
// che cadono in quell'intervallo vengono tolti o accorciati, altrimenti le stesse pagine conterebbero due volte.
function togliDoppioni(libroId, giorno, da, a) {
  if (!Number.isFinite(da) || !Number.isFinite(a) || a <= da) return;
  const pezzi = [];
  data.letture = data.letture.filter(e => {
    if (e.libroId !== libroId || e.giorno !== giorno || e.tipo !== 'pagina' || !Number.isFinite(e.da) || !Number.isFinite(e.a)) return true;
    if (e.a <= da || e.da >= a) return true;                                   // non si sovrappongono
    if (e.da < da && e.a > a) { pezzi.push({ ...e, id: uid(), da: a }); e.a = da; return true; } // sporge da tutte e due le parti
    if (e.da < da) { e.a = da; return true; }                                  // sporge all'inizio
    if (e.a > a) { e.da = a; return true; }                                    // sporge alla fine
    return false;                                                              // tutto dentro: si toglie
  });
  data.letture.push(...pezzi);
}

// I libri in attesa passano da soli in "Sto leggendo" quando cominci a leggerli.
// (Un libro abbandonato no: per riprenderlo c'è il suo pulsante.)
function iniziaSeInAttesa(l, giorno) {
  if (l.stato === 'da-leggere' || l.stato === 'voglio') applicaStato(l, 'leggendo', giorno, false);
}

// "Sono arrivato a pagina N". Restituisce true se con questa pagina il libro è finito.
export function aggiornaPagina(id, nuova) {
  const l = libro(id);
  if (!l) return false;
  if (l.pagine) nuova = Math.min(nuova, l.pagine);
  nuova = Math.max(0, Math.round(nuova));
  const prima = l.pagina, g = oggi();
  if (nuova > 0) iniziaSeInAttesa(l, g);
  if (nuova > prima) {
    // si contano solo le pagine non ancora contate (conta se eri tornato indietro per una correzione)
    const da = Math.max(prima, Math.min(nuova, giaContate(l)));
    if (nuova > da) aggiungiPagine(l, da, nuova, g);
  } else if (nuova < prima) {
    // correzione all'indietro: si accorcia l'aggiornamento di oggi, se c'è (le letture col cronometro non si toccano)
    const s = data.letture.find(x => x.libroId === id && x.giorno === g && x.tipo === 'pagina' && x.a === prima);
    if (s) { s.a = Math.max(s.da, nuova); if (!pagineDi(s)) data.letture = data.letture.filter(x => x !== s); }
  }
  l.pagina = nuova;
  save();
  return !!l.pagine && nuova >= l.pagine && l.stato === 'leggendo';
}

// Registra una lettura con i minuti (dal cronometro o scritta a mano).
// Se "a" (pagina di arrivo) è più avanti della pagina segnata, il libro avanza.
export function registraLettura({ libroId, giorno, minuti, da, a, tipo }) {
  const l = libro(libroId);
  if (!l) return null;
  if (l.pagine && Number.isFinite(a)) a = Math.min(a, l.pagine);
  if (Number.isFinite(a) && Number.isFinite(da) && a < da) a = da;
  const s = ripulisciLettura({ id: uid(), libroId, giorno: giorno || oggi(), minuti, da, a, tipo });
  if (!s.minuti && !pagineDi(s)) return null; // niente minuti e niente pagine: non c'è nulla da registrare
  togliDoppioni(libroId, s.giorno, s.da, s.a);
  data.letture.push(s);
  iniziaSeInAttesa(l, s.giorno);
  if (Number.isFinite(s.a) && s.a > l.pagina && l.stato !== 'letto') l.pagina = s.a;
  save();
  return s;
}

export function eliminaLettura(id) {
  data.letture = data.letture.filter(s => s.id !== id);
  save();
}

// ---------- cronometro di lettura ----------
// Non si salva il tempo che scorre, ma il momento in cui è partito: così il conto continua
// anche se chiudi l'app o si spegne lo schermo.

export function avviaTimer(libroId) {
  const l = libro(libroId);
  if (!l) return;
  if (l.stato !== 'leggendo') applicaStato(l, 'leggendo', null, false);
  // giornoInizio: una lettura a cavallo di mezzanotte appartiene al giorno in cui è cominciata.
  // paginaInizio: la pagina di partenza, anche se sposti il segnalibro mentre il cronometro va.
  data.timer = { libroId, inizio: Date.now(), accumulato: 0, inPausa: false, giornoInizio: oggi(), paginaInizio: l.pagina };
  save();
}
export function pausaTimer() {
  const t = data.timer;
  if (!t || t.inPausa) return;
  t.accumulato += Math.max(0, Date.now() - t.inizio); t.inPausa = true; save();
}
export function riprendiTimer() {
  const t = data.timer;
  if (!t || !t.inPausa) return;
  t.inizio = Date.now(); t.inPausa = false; save();
}
export function annullaTimer() { data.timer = null; save(); }
// millisecondi letti finora
export function tempoTimer(adesso = Date.now()) {
  const t = data.timer;
  if (!t) return 0;
  return t.accumulato + (t.inPausa ? 0 : Math.max(0, adesso - t.inizio));
}

// ---------- riassunti dei capitoli ----------

// Crea o aggiorna (se c.id esiste già) il riassunto di un capitolo.
export function salvaCapitolo(libroId, c) {
  const l = libro(libroId);
  if (!l) return null;
  const esistente = c.id ? l.capitoli.find(x => x.id === c.id) : null;
  const pulito = ripulisciCapitolo({ ...(esistente || {}), ...c, id: esistente ? esistente.id : uid(), data: esistente ? esistente.data : oggi() });
  if (esistente) Object.assign(esistente, pulito); else l.capitoli.push(pulito);
  save();
  // "fino a pagina" più avanti del segnalibro: il libro avanza
  if (pulito.finoAPagina && pulito.finoAPagina > l.pagina && l.stato !== 'letto') aggiornaPagina(libroId, pulito.finoAPagina);
  return pulito;
}
export function eliminaCapitolo(libroId, capitoloId) {
  const l = libro(libroId);
  if (!l) return;
  l.capitoli = l.capitoli.filter(c => c.id !== capitoloId);
  save();
}

// ---------- citazioni ----------

export function salvaCitazione(libroId, c) {
  const l = libro(libroId);
  if (!l) return null;
  const esistente = c.id ? l.citazioni.find(x => x.id === c.id) : null;
  const pulita = ripulisciCitazione({ ...(esistente || {}), ...c, id: esistente ? esistente.id : uid(), data: esistente ? esistente.data : oggi() });
  if (!pulita.testo.trim()) return null;
  if (esistente) Object.assign(esistente, pulita); else l.citazioni.push(pulita);
  save();
  return pulita;
}
// Sposta una citazione da un libro a un altro (quando modificandola si cambia il libro).
export function spostaCitazione(daLibroId, aLibroId, citazioneId) {
  const da = libro(daLibroId), a = libro(aLibroId);
  if (!da || !a || da === a) return;
  const c = da.citazioni.find(x => x.id === citazioneId);
  if (!c) return;
  da.citazioni = da.citazioni.filter(x => x !== c);
  a.citazioni.push(c);
  save();
}
export function eliminaCitazione(libroId, citazioneId) {
  const l = libro(libroId);
  if (!l) return;
  l.citazioni = l.citazioni.filter(c => c.id !== citazioneId);
  save();
}
export function cambiaPreferita(libroId, citazioneId) {
  const l = libro(libroId);
  const c = l && l.citazioni.find(x => x.id === citazioneId);
  if (!c) return false;
  c.preferita = !c.preferita; save();
  return c.preferita;
}

// ---------- parole nuove ----------

export function parola(id) { return data.parole.find(p => p.id === id) || null; }

export function salvaParola(p) {
  const esistente = p.id ? parola(p.id) : null;
  const l = p.libroId ? libro(p.libroId) : null;
  const base = esistente || { id: uid(), data: oggi(), livello: 0, prossimo: piuGiorni(oggi(), 1), ripassi: 0, errori: 0 };
  // Il titolo del libro si ricopia nella parola, così resta anche se un giorno elimini il libro.
  // Una parola rimasta "orfana" (libro eliminato) tiene il titolo ricordato finché non le dai un altro libro.
  const orfana = esistente && !esistente.libroId;
  const pulita = ripulisciParola({ ...base, ...p, id: base.id, libroId: l ? l.id : null, titoloLibro: l ? l.titolo : (orfana ? esistente.titoloLibro : '') });
  if (!pulita.parola) return null;
  if (esistente) Object.assign(esistente, pulita); else data.parole.push(pulita);
  save();
  return pulita;
}
export function eliminaParola(id) {
  data.parole = data.parole.filter(p => p.id !== id);
  save();
}
// sostituisce una parola con la sua versione aggiornata dopo il ripasso (vedi dopoRipasso in calcoli.js)
export function aggiornaRipasso(aggiornata) {
  const p = parola(aggiornata.id);
  if (!p) return;
  Object.assign(p, ripulisciParola(aggiornata));
  save();
}

// ---------- consigli scartati ----------
// "No, grazie" su un consiglio: la sua chiave viene ricordata (anche nel backup) e non lo si propone più.

export function scartaConsiglio(chiave) {
  if (!chiaveScartatoValida(chiave) || data.scartati.includes(chiave)) return;
  data.scartati.push(chiave);
  if (data.scartati.length > MAX_SCARTATI) data.scartati.splice(0, data.scartati.length - MAX_SCARTATI);
  save();
}
export function riprendiConsiglio(chiave) {
  const i = data.scartati.indexOf(chiave);
  if (i >= 0) { data.scartati.splice(i, 1); save(); }
}
export function dimenticaScartati() { data.scartati = []; save(); }

// ---------- impostazioni ----------

export function setObiettivo(anno, n) {
  if (Number.isInteger(n) && n > 0) data.impostazioni.obiettivi[anno] = Math.min(n, 999);
  else delete data.impostazioni.obiettivi[anno];
  save();
}
export function setTema(tema) {
  if (!TEMI.includes(tema)) return;
  data.impostazioni.tema = tema; save();
}
export function setChiaveGoogle(chiave) {
  data.impostazioni.chiaveGoogle = String(chiave || '').trim().slice(0, 100); save();
}
export function segnaBackup() { data.ultimoBackup = oggi(); save(); }
