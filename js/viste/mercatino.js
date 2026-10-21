// Schermata "Mercatino": giri tra le bancarelle con il telefono in mano.
//  - la fotocamera resta accesa e legge da sola i codici a barre, uno dopo l'altro
//  - per i libri senza codice (quelli vecchi) tocchi "Leggi il titolo": legge la copertina o il dorso
//  - puoi anche scrivere titolo o ISBN, o usare uno scanner Bluetooth (scrive il codice come una tastiera)
// Per ogni libro dice subito se è nei desideri, se ce l'hai già, se potrebbe piacerti (vedi mercatino.js).
import { data, libro, aggiungiLibro, cambiaStato } from '../dati.js';
import { esc, oggi, plurale } from '../utili.js';
import { icona } from '../icone.js';
import { NOMI_STATO, coloreDaTitolo } from '../migrazione.js';
import { comeIsbn, cercaInRete } from '../ricerca.js';
import { avviaFotocamera, puoUsareFotocamera, spiegaErrore, prendiLettore } from '../fotocamera.js';
import { leggiTesto, bastano, spegniLettore, lettoreScaricato, scaricaLettore } from '../ocr.js';
import { riconosci, giudica, cercaDaParole, vistiOggi, segnaVisto } from '../mercatino.js';
import { consigliSalvati, gustiSalvati, argomentiDi, preparaConsigli, vannoRifatti } from '../consigli.js';
import { copertina, registraVista, registraAzioni, vai, avviso, annuncia, rotta } from './comune.js';

const ICONE = { desiderio: 'cuore', 'ce-l-hai': 'segnalibro', piacere: 'scintille', attenzione: 'occhio', neutro: 'libro', sconosciuto: 'cerca' };
const ATTESA_ARGOMENTI = 6000; // ms: oltre, il giudizio si dà senza gli argomenti del libro

// Lo stato della schermata (non si salva: riaprendola si riparte, tranne i "visti oggi")
let camera = null;
let esito = null;       // { trovato, giudizio, letto (parole lette), altri (scelte possibili), aggiunto }
let occupato = false;   // si sta cercando un libro: i codici letti nel frattempo si ignorano
// L'ultimo codice letto dalla fotocamera: finché resta inquadrato non si ricerca (né dopo "Prossimo", né mentre
// guardi il risultato di un titolo scritto). Torna a valere appena la fotocamera vede un codice diverso.
let ultimoDallaCamera = '';
let ricerca = null;     // AbortController della ricerca in corso

// ---------- disegno ----------

function schedaEsito() {
  if (!esito) return '';
  const { trovato, giudizio, letto, altri, aggiunto } = esito;
  const g = giudizio;
  const tuo = g.libro ? libro(g.libro.id) : null;
  const sotto = trovato ? [trovato.editore, trovato.anno, trovato.pagine ? plurale(trovato.pagine, 'pagina', 'pagine') : ''].filter(Boolean).join(', ') : '';
  let azioni = '';
  if (aggiunto) {
    azioni = `<p class="esito-fatto">${icona('fatto')}${esc(aggiunto)}</p>
      <div class="azioni">${tuo || esito.nuovoId ? `<button type="button" class="bottone bottone--secondario" data-azione="mercatino-apri" data-id="${esc((tuo || {}).id || esito.nuovoId)}">Apri</button>` : ''}
      <button type="button" class="bottone" data-azione="mercatino-prossimo">Prossimo libro</button></div>`;
  } else if (g.tipo === 'desiderio') {
    azioni = `<div class="azioni"><button type="button" class="bottone" data-azione="mercatino-comprato">${icona('fatto')}L’ho comprato</button>
      <button type="button" class="bottone bottone--secondario" data-azione="mercatino-prossimo">Prossimo</button></div>`;
  } else if (g.tipo === 'ce-l-hai') {
    azioni = `<div class="azioni"><button type="button" class="bottone bottone--secondario" data-azione="mercatino-apri" data-id="${esc(g.libro.id)}">Apri</button>
      <button type="button" class="bottone" data-azione="mercatino-prossimo">Prossimo</button></div>`;
  } else if (trovato) {
    azioni = `<div class="azioni"><button type="button" class="bottone" data-azione="mercatino-comprato">${icona('fatto')}L’ho comprato</button>
      <button type="button" class="bottone bottone--secondario" data-azione="mercatino-desidero">${icona('cuore')}Ai desideri</button></div>
      <button type="button" class="bottone-testo" data-azione="mercatino-prossimo">Prossimo libro</button>`;
  } else {
    azioni = `<div class="azioni"><button type="button" class="bottone" data-azione="mercatino-prossimo">Riprova</button></div>`;
  }
  return `<article class="esito esito--${g.tipo}">
    <p class="esito-titolo">${icona(ICONE[g.tipo])}<span>${esc(g.titolo)}</span></p>
    ${trovato ? `<div class="esito-libro">${copertina({ ...trovato, colore: coloreDaTitolo(trovato.titolo) })}
      <div><h3>${esc(trovato.titolo)}</h3>${trovato.autore ? `<p class="autore">${esc(trovato.autore)}</p>` : ''}${sotto ? `<p class="dettaglio">${esc(sotto)}</p>` : ''}</div></div>` : ''}
    <p class="esito-motivo">${esc(g.motivo)}</p>
    ${letto && letto.length ? `<p class="tenue piccolo">Ho letto: «${esc(letto.join(' '))}»</p>` : ''}
    ${altri && altri.length ? `<p class="piccolo" style="margin-top:10px"><b>È uno di questi?</b></p>
      <ul class="mercatino-scelte">${altri.map((a, i) => `<li><button type="button" class="risultato" data-azione="mercatino-scegli" data-id="${i}">
        ${copertina({ ...a, colore: coloreDaTitolo(a.titolo) }, 's')}<span><b>${esc(a.titolo)}</b><span>${esc([a.autore, a.anno].filter(Boolean).join(', '))}</span></span></button></li>`).join('')}</ul>` : ''}
    ${azioni}
  </article>`;
}

function elencoVisti() {
  const visti = vistiOggi(oggi());
  if (!visti.length) return '';
  const nomi = { desiderio: 'Nei desideri', 'ce-l-hai': 'Ce l’hai', piacere: 'Potrebbe piacerti', attenzione: 'Occhio', neutro: '', sconosciuto: '' };
  return `<section class="sezione"><h2 class="titolo-sezione">Visti oggi</h2>
    <ul>${visti.map((v, i) => `<li><button type="button" class="riga-visto" data-azione="mercatino-rivedi" data-id="${i}">
      <span class="pallino-esito esito--${esc(v.tipo)}" aria-hidden="true"></span>
      <span><b>${esc(v.titolo)}</b>${v.autore ? `<span>${esc(v.autore)}</span>` : ''}</span>
      ${nomi[v.tipo] ? `<span class="etichetta-esito">${nomi[v.tipo]}</span>` : ''}</button></li>`).join('')}</ul></section>`;
}

function vista() {
  const conCamera = puoUsareFotocamera();
  return `
    <a class="torna" href="#/libreria">${icona('indietro')}Libreria</a>
    <header class="testata"><h1 class="titolo-pagina">Mercatino</h1></header>
    <p class="tenue piccolo" style="margin:-8px 0 10px">Inquadra il codice a barre: lo leggo da solo. Se non c’è, inquadra il titolo e tocca «Leggi il titolo».</p>
    ${conCamera ? `<div class="mirino mirino--mercatino" id="mirino">
        <video id="video-mercatino" playsinline muted autoplay disablepictureinpicture></video>
        <div class="mirino-riquadro" aria-hidden="true"><i></i></div>
      </div>
      <div class="azioni" style="margin-top:12px">
        <button type="button" class="bottone" id="leggi-titolo" data-azione="mercatino-leggi" disabled>${icona('documento')}Leggi il titolo</button>
        <button type="button" class="bottone bottone--secondario" id="torcia-mercatino" data-azione="mercatino-torcia" aria-pressed="false" hidden>${icona('torcia')}Luce</button>
      </div>` : '<p class="nota-avviso">Qui la fotocamera non è disponibile: scrivi il titolo o l’ISBN.</p>'}
    <p class="mirino-testo" id="stato-mercatino" aria-live="polite">${conCamera ? 'Accendo la fotocamera…' : ''}</p>
    <div id="esito-mercatino">${schedaEsito()}</div>
    <form class="cerca cerca--mercatino" id="cerca-mercatino" role="search">${icona('cerca')}
      <input type="search" id="testo-mercatino" placeholder="Oppure scrivi titolo, autore o ISBN" aria-label="Titolo, autore o ISBN" autocomplete="off" enterkeyhint="search">
    </form>
    <div id="visti-mercatino">${elencoVisti()}</div>
    <section class="sezione scheda scheda--piatta" id="prepara-mercatino">
      <h2 class="titolo-scheda">Prima di uscire</h2>
      <p class="tenue piccolo" id="stato-preparazione">Controllo cosa c’è già nel telefono…</p>
      <button type="button" class="bottone bottone--secondario" data-azione="mercatino-prepara" style="margin-top:10px">${icona('scarica')}Prepara per il mercatino</button>
    </section>`;
}

function stato(testo) { const el = document.getElementById('stato-mercatino'); if (el) el.textContent = testo; }
function ridisegnaEsito() {
  const el = document.getElementById('esito-mercatino');
  if (el) el.innerHTML = schedaEsito();
  const v = document.getElementById('visti-mercatino');
  if (v) v.innerHTML = elencoVisti();
}

// Dopo il disegno: si collega il campo di testo, si accende la fotocamera e si controlla se il lettore
// del testo è già nel telefono.
function dopo() {
  aggiornaPreparazione();
  document.getElementById('cerca-mercatino').addEventListener('submit', e => {
    e.preventDefault();
    const campo = document.getElementById('testo-mercatino');
    const t = campo.value.trim();
    if (t.length < 2) return;
    campo.blur();
    const isbn = comeIsbn(t);
    if (isbn) cercaIsbn(isbn); else cercaParole(t.split(/\s+/), { scritto: true });
  });
  accendiCamera();
}

function accendiCamera() {
  const video = document.getElementById('video-mercatino');
  if (!video) return;
  if (camera) camera.ferma();
  const leggi = document.getElementById('leggi-titolo'), torcia = document.getElementById('torcia-mercatino');
  let ultimoAvviso = 0;
  camera = avviaFotocamera(video, {
    suPronta: ({ torcia: conTorcia }) => {
      leggi.disabled = false;
      torcia.hidden = !conTorcia;
      if (!esito) stato('Pronto: inquadra un codice a barre.');
    },
    suIsbn: isbn => {
      if (occupato || isbn === ultimoDallaCamera) return;
      ultimoDallaCamera = isbn;
      cercaIsbn(isbn);
    },
    suAltroCodice: () => {
      if (occupato || Date.now() - ultimoAvviso < 3000) return;
      ultimoAvviso = Date.now();
      stato('Questo non è l’ISBN: cerca il codice che comincia con 978 o 979.');
    },
    suErrore: e => {
      const m = document.getElementById('mirino');
      if (m) m.remove();
      if (leggi) leggi.closest('.azioni').remove();
      stato(spiegaErrore(e) + ' Intanto puoi scrivere il titolo o l’ISBN qui sotto.');
    }
  });
}

// Fuori dalla schermata (o con il telefono in tasca) la fotocamera si spegne; il lettore del testo dopo un po'.
window.addEventListener('hashchange', () => {
  if (rotta().nome === 'mercatino') return;
  if (camera) { camera.ferma(); camera = null; }
  if (ricerca) ricerca.abort();
  occupato = false; ultimoDallaCamera = '';
  spegniLettore();
});
document.addEventListener('visibilitychange', () => {
  if (rotta().nome !== 'mercatino') return;
  if (document.visibilityState === 'hidden') { if (camera) { camera.ferma(); camera = null; } }
  else if (!camera && document.getElementById('video-mercatino')) accendiCamera();
});

// Scanner Bluetooth: scrive le cifre del codice velocissimo e poi "Invio", come una tastiera.
// Se non stai scrivendo in un campo, quelle cifre si raccolgono qui.
let tasti = '', ultimoTasto = 0;
document.addEventListener('keydown', e => {
  if (rotta().nome !== 'mercatino' || e.target.closest('input, textarea, select')) return;
  const adesso = Date.now();
  if (adesso - ultimoTasto > 120) tasti = '';
  ultimoTasto = adesso;
  if (/^[0-9Xx]$/.test(e.key)) { tasti += e.key; return; }
  if (e.key === 'Enter' && tasti.length >= 10) {
    const isbn = comeIsbn(tasti);
    tasti = '';
    if (isbn) { e.preventDefault(); cercaIsbn(isbn); }
  }
});

// ---------- cercare e giudicare ----------

function campiDi(l) {
  const { titolo, autore, pagine, anno, editore, isbn, genere, copertina: img, origine } = l;
  return { titolo, autore, pagine, anno, editore, isbn, genere, copertina: img, origine: origine || 'manuale' };
}

// Il giudizio su un libro trovato; se è "niente di speciale" e c'è la rete, si chiedono i suoi argomenti
// (fantasy, gialli…) per vedere se è un genere che ti piace.
async function giudicaCompleto(trovato, segnale) {
  const consigli = consigliSalvati()?.elenco || [];
  let g = giudica(trovato, data.libri, { consigli });
  if (g.tipo !== 'neutro' || !navigator.onLine) return g;
  const gusti = gustiSalvati(data.libri);
  if (!gusti.length) return g;
  try {
    const argomenti = await Promise.race([argomentiDi(trovato, segnale), new Promise(r => setTimeout(() => r(null), ATTESA_ARGOMENTI))]);
    if (argomenti) g = giudica(trovato, data.libri, { consigli, gusti, argomenti });
  } catch (e) { /* senza argomenti: resta il giudizio di prima */ }
  return g;
}

function mostra(nuovo) {
  esito = nuovo;
  if (esito.trovato || esito.giudizio.tipo !== 'sconosciuto') {
    segnaVisto(oggi(), { titolo: esito.trovato ? esito.trovato.titolo : esito.giudizio.titolo, autore: esito.trovato ? esito.trovato.autore : '', isbn: esito.trovato ? esito.trovato.isbn : '', tipo: esito.giudizio.tipo, esito: { trovato: esito.trovato, giudizio: esito.giudizio } });
  }
  ridisegnaEsito();
  if (esito.giudizio.tipo === 'desiderio' && navigator.vibrate) navigator.vibrate([80, 60, 80]);
  else if (esito.giudizio.tipo === 'piacere' && navigator.vibrate) navigator.vibrate(60);
  annuncia(esito.giudizio.titolo + (esito.trovato ? ': ' + esito.trovato.titolo : ''));
  stato(camera ? 'Inquadra il prossimo libro quando vuoi.' : '');
  const el = document.getElementById('esito-mercatino');
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function nuovaRicerca() {
  if (ricerca) ricerca.abort();
  ricerca = new AbortController();
  return ricerca;
}

async function cercaIsbn(isbn) {
  occupato = true;
  const questa = nuovaRicerca();
  stato('Codice letto: ' + isbn + '. Cerco…');
  if (navigator.vibrate) navigator.vibrate(30);
  try {
    // prima tra i tuoi libri e i consigli (funziona anche senza rete)
    const tuo = data.libri.find(l => l.isbn === isbn) || (consigliSalvati()?.elenco || []).find(c => c.isbn === isbn);
    if (tuo) { mostra({ trovato: tuo, giudizio: await giudicaCompleto(tuo, questa.signal) }); return; }
    if (!navigator.onLine) {
      mostra({ trovato: null, giudizio: { tipo: 'sconosciuto', titolo: 'Non è tra i tuoi libri', motivo: `Il codice ${isbn} non è nei desideri né nella tua libreria. Senza connessione non so dirti che libro è.` } });
      return;
    }
    const r = await cercaInRete(isbn, { segnale: questa.signal, schede: false });
    if (questa.signal.aborted) return;
    const trovato = r.libri[0];
    if (!trovato) {
      mostra({ trovato: null, giudizio: { tipo: 'sconosciuto', titolo: r.errore ? 'Non riesco a cercarlo' : 'Libro sconosciuto ai cataloghi', motivo: r.errore ? `Il codice ${isbn} non è tra i tuoi libri. La connessione non risponde: riprova tra poco.` : `Il codice ${isbn} non è tra i tuoi libri né nei cataloghi. Prova a leggere il titolo.` } });
      return;
    }
    mostra({ trovato, giudizio: await giudicaCompleto(trovato, questa.signal) });
  } catch (e) {
    if (e.name !== 'AbortError') mostra({ trovato: null, giudizio: { tipo: 'sconosciuto', titolo: 'Non riesco a cercarlo', motivo: 'Qualcosa è andato storto nella ricerca: riprova.' } });
  } finally { if (questa === ricerca) occupato = false; }
}

// Parole lette dalla copertina (o scritte da te): prima si confrontano con i tuoi libri e i consigli, poi i cataloghi.
async function cercaParole(parole, { scritto = false } = {}) {
  occupato = true;
  const questa = nuovaRicerca();
  try {
    const consigli = consigliSalvati()?.elenco || [];
    const qui = riconosci(parole, [...data.libri, ...consigli]);
    if (qui) { mostra({ trovato: qui.candidato, giudizio: await giudicaCompleto(qui.candidato, questa.signal), letto: scritto ? null : parole }); return; }
    if (!navigator.onLine) {
      mostra({ trovato: null, letto: scritto ? null : parole, giudizio: { tipo: 'sconosciuto', titolo: 'Non è tra i tuoi libri', motivo: 'Non è nei desideri né nella tua libreria. Senza connessione non posso cercarlo nei cataloghi.' } });
      return;
    }
    stato('Cerco nei cataloghi…');
    const { libro: trovato, altri, errore } = await cercaDaParole(parole, { segnale: questa.signal });
    if (questa.signal.aborted) return;
    if (trovato) { mostra({ trovato, giudizio: await giudicaCompleto(trovato, questa.signal), letto: scritto ? null : parole }); return; }
    mostra({
      trovato: null, letto: scritto ? null : parole, altri,
      giudizio: { tipo: 'sconosciuto', titolo: errore ? 'Non riesco a cercarlo' : 'Non sono sicuro di che libro sia', motivo: errore ? 'La connessione non risponde: riprova tra poco.' : altri.length ? 'Non è nei desideri né nella tua libreria. Tocca quello giusto, oppure scrivi il titolo qui sopra.' : 'Non è nei desideri né nella tua libreria, e nei cataloghi non trovo niente con queste parole. Scrivi il titolo qui sopra.' }
    });
  } catch (e) {
    if (e.name !== 'AbortError') mostra({ trovato: null, giudizio: { tipo: 'sconosciuto', titolo: 'Non riesco a cercarlo', motivo: 'Qualcosa è andato storto nella ricerca: riprova.' } });
  } finally { if (questa === ricerca) occupato = false; }
}

// ---------- prepararsi a casa ----------

async function aggiornaPreparazione() {
  const el = document.getElementById('stato-preparazione');
  if (!el) return;
  const pronto = await lettoreScaricato();
  const consigli = consigliSalvati();
  const pezzi = [
    pronto ? 'Lettura del titolo: pronta, anche senza internet.' : 'Lettura del titolo: da scaricare (circa 5 MB, meglio con il wifi).',
    consigli && !vannoRifatti(data.libri) ? '“Per te”: aggiornati.' : '“Per te”: da aggiornare.',
    'Desideri e libreria: sempre pronti, sono nel telefono.'
  ];
  if (document.getElementById('stato-preparazione')) el.textContent = pezzi.join(' ');
}

registraVista('mercatino', vista, dopo);

registraAzioni({
  'mercatino-leggi': async el => {
    if (!camera || occupato) return;
    const foto = camera.fotogramma();
    if (!foto) { stato('La fotocamera non è ancora pronta.'); return; }
    occupato = true; el.disabled = true; camera.pausa(true);
    try {
      const { parole } = await leggiTesto(foto, { avanzamento: stato });
      if (!bastano(parole)) {
        mostra({ trovato: null, letto: parole, giudizio: { tipo: 'sconosciuto', titolo: 'Non riesco a leggere il titolo', motivo: 'Avvicinati un po’, metti il titolo dritto e con più luce (c’è il pulsante «Luce»), oppure scrivilo qui sopra.' } });
        occupato = false;
        return;
      }
      occupato = false;
      await cercaParole(parole);
    } catch (e) {
      occupato = false;
      mostra({ trovato: null, giudizio: { tipo: 'sconosciuto', titolo: 'Non riesco a leggere', motivo: navigator.onLine ? 'Il lettore del testo non si è avviato: riprova.' : 'Il lettore del testo non è ancora nel telefono: serve la connessione (o «Prepara per il mercatino» a casa).' } });
    } finally {
      if (camera) camera.pausa(false);
      const b = document.getElementById('leggi-titolo'); if (b) b.disabled = false;
      aggiornaPreparazione();
    }
  },
  'mercatino-torcia': el => {
    if (!camera) return;
    const accesa = el.getAttribute('aria-pressed') !== 'true';
    camera.torcia(accesa).then(() => el.setAttribute('aria-pressed', String(accesa))).catch(() => {});
  },
  // "L'ho comprato": un desiderio passa in "Da leggere"; un libro nuovo ci entra direttamente
  'mercatino-comprato': () => {
    if (!esito) return;
    const g = esito.giudizio;
    if (g.tipo === 'desiderio' && g.libro && libro(g.libro.id)) {
      cambiaStato(g.libro.id, 'da-leggere');
      esito.aggiunto = 'Spostato dai desideri a “Da leggere”. Buona lettura!';
    } else if (esito.trovato) {
      const l = aggiungiLibro(campiDi(esito.trovato), 'da-leggere');
      esito.nuovoId = l.id;
      esito.aggiunto = 'Aggiunto a “Da leggere”.';
    }
    segnaVisto(oggi(), { titolo: esito.trovato.titolo, autore: esito.trovato.autore, isbn: esito.trovato.isbn, tipo: 'ce-l-hai', esito: { trovato: esito.trovato, giudizio: { tipo: 'ce-l-hai', titolo: 'Comprato', motivo: 'L’hai comprato oggi al mercatino.' } } });
    ridisegnaEsito();
    avviso('Buon acquisto!');
  },
  'mercatino-desidero': () => {
    if (!esito || !esito.trovato) return;
    const l = aggiungiLibro({ ...campiDi(esito.trovato), nota: 'Visto al mercatino il ' + new Date().toLocaleDateString('it-IT') }, 'voglio');
    esito.nuovoId = l.id;
    esito.aggiunto = `Aggiunto a “${NOMI_STATO.voglio}”.`;
    segnaVisto(oggi(), { titolo: esito.trovato.titolo, autore: esito.trovato.autore, isbn: esito.trovato.isbn, tipo: 'desiderio', esito: { trovato: esito.trovato, giudizio: { tipo: 'desiderio', titolo: 'Nei desideri', motivo: 'L’hai aggiunto ai desideri oggi al mercatino.' } } });
    ridisegnaEsito();
  },
  'mercatino-prossimo': () => {
    esito = null;
    if (ricerca) ricerca.abort();
    occupato = false;
    ridisegnaEsito();
    stato(camera ? 'Pronto: inquadra un codice a barre.' : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  'mercatino-scegli': async el => {
    const a = esito && esito.altri ? esito.altri[Number(el.dataset.id)] : null;
    if (!a) return;
    const questa = nuovaRicerca();
    mostra({ trovato: a, giudizio: await giudicaCompleto(a, questa.signal), letto: esito.letto });
  },
  'mercatino-rivedi': el => {
    const v = vistiOggi(oggi())[Number(el.dataset.id)];
    if (!v || !v.esito) return;
    // il giudizio si rifà adesso: nel frattempo potresti averlo comprato o messo nei desideri
    const trovato = v.esito.trovato;
    // (se adesso risulta "niente di speciale", vale quello di allora: poteva contare anche il genere del libro)
    const ora = trovato ? giudica(trovato, data.libri, { consigli: consigliSalvati()?.elenco || [] }) : null;
    esito = { trovato, giudizio: ora && ora.tipo !== 'neutro' ? ora : v.esito.giudizio };
    ridisegnaEsito();
    const e = document.getElementById('esito-mercatino');
    if (e) e.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  },
  'mercatino-apri': el => vai('#/libro/' + el.dataset.id),
  'mercatino-prepara': async el => {
    const st = document.getElementById('stato-preparazione');
    if (!navigator.onLine) { avviso('Serve la connessione: fallo a casa con il wifi.', { errore: true }); return; }
    el.disabled = true;
    try {
      await scaricaLettore((fatti, tot) => { if (st) st.textContent = `Scarico la lettura del titolo… ${fatti} di ${tot}`; });
      if (st) st.textContent = 'Preparo il lettore dei codici a barre…';
      await prendiLettore().catch(() => {});
      if (vannoRifatti(data.libri)) { if (st) st.textContent = 'Aggiorno i consigli “Per te”…'; await preparaConsigli(data.libri).catch(() => {}); }
      avviso('Pronto per il mercatino');
    } catch (e) {
      avviso('Non sono riuscito a scaricare tutto: riprova con una connessione migliore.', { errore: true });
    } finally {
      el.disabled = false;
      aggiornaPreparazione();
    }
  }
});

