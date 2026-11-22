// Schermata "Altro": obiettivo dell'anno, aspetto, installazione, backup, esportazioni, ricerca dei libri.
import { data, setTema, setChiaveGoogle, setData } from '../dati.js';
import { esc, oggi, dataTesto, ilGiorno, giorniTra, plurale, APP_VERSION } from '../utili.js';
import { icona } from '../icone.js';
import { datiVuoti } from '../migrazione.js';
import { vocabolarioInMarkdown } from '../markdown.js';
import { registraVista, registraAzioni, registraScritture, render, avviso } from './comune.js';
import { scarica } from './elementi.js';
import { esportaBackup, chiediImport, giornoDellaCopia, annullaImport, salvaCopia } from '../backup.js';
import { isInstallata, isIOS, puoInstallare, installa } from '../pwa.js';
import { conferma } from '../pannelli/pannello.js';
import { sincro } from '../sincronizzazione.js';

// Applica il tema scelto: 'auto' segue il telefono, gli altri due lo forzano (vedi css/style.css).
export function applicaTema() {
  const tema = data.impostazioni.tema;
  if (tema === 'auto') document.documentElement.removeAttribute('data-tema');
  else document.documentElement.setAttribute('data-tema', tema);
  // colore della barra del browser in alto
  const scuro = tema === 'scuro' || (tema === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  const meta = document.getElementById('colore-tema');
  if (meta) meta.setAttribute('content', scuro ? '#0d1422' : '#e3eaf1');
}

function installazione() {
  if (isInstallata()) return '<p class="tenue">L’app è installata su questo dispositivo.</p>';
  if (puoInstallare()) return `<p class="tenue">Mettila sulla schermata Home: si apre come un’app e funziona anche senza connessione.</p>
    <div class="azioni" style="margin-top:12px"><button type="button" class="bottone" data-azione="installa">${icona('scarica')}Installa l’app</button></div>`;
  if (isIOS()) return '<p class="tenue">Su iPhone: apri questa pagina in Safari, tocca <b>Condividi</b> e poi <b>Aggiungi alla schermata Home</b>.</p>';
  return '<p class="tenue">Su Android: nel menu ⋮ di Chrome scegli <b>Installa app</b> (o <b>Aggiungi a schermata Home</b>). Poi si apre come un’app e funziona anche senza connessione.</p>';
}

// "oggi alle 19:40", "ieri alle 8:05", "il 3 novembre alle 21:10"
export function quandoSincro(ms) {
  const d = new Date(ms);
  const ora = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
  const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const g = giorniTra(k, oggi());
  return (g === 0 ? 'oggi' : g === 1 ? 'ieri' : ilGiorno(k, { annoSempre: false })) + ' alle ' + ora;
}

function sezioneSincro() {
  if (!sincro.disponibile) return '';
  const s = sincro.stato();
  let corpo;
  if (s.fase === 'spento') {
    corpo = `<p class="tenue">Accedi con Google per avere gli stessi libri e appunti sul telefono e sul computer. I dati vanno in una cartella nascosta del tuo Google Drive, riservata a queste app: non vedono gli altri tuoi file.</p>
      <div class="azioni" style="margin-top:12px"><button type="button" class="bottone" data-azione="sincro-collega">${icona('nuvola')}Accedi con Google</button></div>`;
  } else {
    const riga = s.fase === 'in-corso' ? `${icona('ripeti')}Sincronizzo…`
      : s.fase === 'errore' ? `<span class="sincro-errore">${esc(s.errore)}</span>`
      : s.fase === 'da-riconnettere' ? `${icona('orologio')}L’accesso a Google è scaduto (dura un’ora)${sincro.daInviare() ? ': ci sono modifiche da inviare' : ''}.`
      : s.ultima ? `${icona('fatto')}Sincronizzato ${quandoSincro(s.ultima)}.` : '';
    corpo = `${s.email ? `<p class="tenue">Collegato come <b>${esc(s.email)}</b>. Usa lo stesso account sugli altri dispositivi.</p>` : ''}
      ${riga ? `<p class="sincro-stato" role="status">${riga}</p>` : ''}
      <div class="azioni" style="margin-top:12px"><button type="button" class="bottone bottone--secondario" data-azione="sincro-ora" ${s.fase === 'in-corso' ? 'disabled' : ''}>${icona('ripeti')}Sincronizza adesso</button></div>
      <button type="button" class="bottone-testo" data-azione="sincro-scollega" style="margin-top:6px">Scollega questo dispositivo</button>`;
  }
  return `<section class="scheda"><h2 class="titolo-scheda">Telefono e computer</h2>${corpo}</section>`;
}

function vista() {
  const anno = oggi().slice(0, 4);
  const obiettivo = data.impostazioni.obiettivi[anno];
  const tema = data.impostazioni.tema;
  const nCitazioni = data.libri.reduce((s, l) => s + l.citazioni.length, 0);
  const nRiassunti = data.libri.reduce((s, l) => s + l.capitoli.length, 0);
  const giorni = data.ultimoBackup ? giorniTra(data.ultimoBackup, oggi()) : null;
  const copia = giornoDellaCopia();
  const quandoBackup = giorni === null ? 'Non hai ancora fatto un backup.'
    : giorni === 0 ? 'Ultimo backup: oggi.' : giorni === 1 ? 'Ultimo backup: ieri.' : `Ultimo backup: ${dataTesto(data.ultimoBackup)} (${giorni} giorni fa).`;

  return `
    <header class="testata"><h1 class="titolo-pagina">Altro</h1></header>

    <section class="scheda">
      <h2 class="titolo-scheda">Obiettivo del ${anno}</h2>
      <p class="tenue">${obiettivo ? `Vuoi leggere ${plurale(obiettivo, 'libro', 'libri')} quest’anno.` : 'Decidi quanti libri vuoi leggere quest’anno: in Oggi vedrai se sei in linea.'}</p>
      <div class="azioni" style="margin-top:12px"><button type="button" class="bottone bottone--secondario" data-azione="obiettivo">${obiettivo ? 'Cambia l’obiettivo' : 'Scegli un obiettivo'}</button></div>
    </section>

    <section class="scheda">
      <h2 class="titolo-scheda" id="et-tema">Aspetto</h2>
      <div class="scelte" role="radiogroup" aria-labelledby="et-tema" style="margin-top:10px">
        ${[['auto', 'Come il telefono'], ['chiaro', 'Chiaro'], ['scuro', 'Scuro']].map(([v, nome]) => `<label class="scelta"><input type="radio" name="tema" value="${v}" data-scrivi="tema" ${tema === v ? 'checked' : ''}><span>${nome}</span></label>`).join('')}
      </div>
    </section>

    ${sezioneSincro()}

    <section class="scheda">
      <h2 class="titolo-scheda">Sul telefono</h2>
      ${installazione()}
    </section>

    <section class="scheda">
      <h2 class="titolo-scheda">Backup</h2>
      <p class="tenue">${sincro.stato().fase === 'spento' || !sincro.disponibile ? 'Libri, riassunti, parole e citazioni stanno solo su questo dispositivo: se cambi telefono o cancelli i dati del browser li perdi. ' : 'I dati sono anche sul tuo Google Drive, ma un backup in più non fa mai male. '}Il backup è un file da conservare altrove (Drive, email, computer).</p>
      <p style="margin-top:8px"><b>${quandoBackup}</b></p>
      <p class="tenue piccolo" style="margin-top:4px">Adesso: ${plurale(data.libri.length, 'libro', 'libri')}, ${plurale(nRiassunti, 'riassunto', 'riassunti')}, ${plurale(data.parole.length, 'parola', 'parole')}, ${plurale(nCitazioni, 'citazione', 'citazioni')}.</p>
      <div class="azioni" style="margin-top:12px">
        <button type="button" class="bottone" data-azione="esporta-backup">${icona('scarica')}Scarica il backup</button>
        <button type="button" class="bottone bottone--secondario" data-azione="importa-backup">${icona('carica')}Importa un backup</button>
      </div>
      ${copia ? `<button type="button" class="bottone-testo" data-azione="annulla-import" style="margin-top:8px">Torna ai dati che avevi ${esc(ilGiorno(copia, { annoSempre: false }))}</button>
      <p class="tenue piccolo">Prima dell’ultima importazione o cancellazione ho messo da parte i dati di allora: restano una settimana.</p>` : ''}
    </section>

    ${data.parole.length ? `<section class="scheda">
      <h2 class="titolo-scheda">Il vocabolario in Obsidian</h2>
      <p class="tenue">Tutte le parole nuove in una nota Markdown, in ordine alfabetico. Le note dei singoli libri si scaricano dalla scheda di ogni libro.</p>
      <div class="azioni" style="margin-top:12px"><button type="button" class="bottone bottone--secondario" data-azione="scarica-vocabolario">${icona('scarica')}Scarica il vocabolario</button></div>
    </section>` : ''}

    <section class="scheda">
      <h2 class="titolo-scheda">Ricerca dei libri</h2>
      <p class="tenue">Quando aggiungi un libro l’app lo cerca su Open Library e su Google Books. Google, senza una chiave personale, spesso non risponde: se molti libri italiani non si trovano, crea una chiave gratuita e incollala qui (le istruzioni sono nel file README dell’app).</p>
      <label class="campo" style="margin:12px 0 0"><span>Chiave di Google Books <span class="tenue" style="font-weight:400">(facoltativa)</span></span>
        <input data-scrivi="chiave-google" value="${esc(data.impostazioni.chiaveGoogle)}" autocomplete="off" autocapitalize="none" spellcheck="false" maxlength="100" placeholder="AIza…"></label>
    </section>

    <section class="scheda">
      <h2 class="titolo-scheda">Ricominciare da capo</h2>
      <p class="tenue">Cancella tutti i libri e gli appunti da questo dispositivo.</p>
      <button type="button" class="bottone-testo bottone-testo--pericolo" data-azione="cancella-tutto">${icona('cestino')}Cancella tutti i dati</button>
    </section>

    <p class="tenue piccolo" style="margin-top:18px;text-align:center">I miei libri, versione ${APP_VERSION}</p>`;
}

registraVista('altro', vista);

registraAzioni({
  'sincro-collega': async () => {
    const s = await sincro.collega();
    if (s.fase === 'pronto') avviso('Collegato: i dati sono sincronizzati');
    else if (s.errore) avviso(s.errore, { errore: true, durata: 7000 });
    render();
  },
  'sincro-ora': async () => {
    const s = await sincro.collega();
    if (s.fase === 'pronto') avviso('Sincronizzato');
    else if (s.errore) avviso(s.errore, { errore: true, durata: 7000 });
    render();
  },
  'sincro-scollega': async () => {
    if (!(await conferma('Scollegare questo dispositivo da Google?', { ok: 'Scollega', dettaglio: 'I dati restano qui e sul tuo Drive, ma smettono di sincronizzarsi su questo dispositivo.' }))) return;
    await sincro.scollega(); render(); avviso('Scollegato');
  },
  'installa': () => installa(),
  'esporta-backup': () => esportaBackup(),
  'importa-backup': () => chiediImport(),
  'scarica-vocabolario': () => { scarica('Parole nuove.md', vocabolarioInMarkdown(data.parole, oggi()), 'text/markdown'); avviso('Vocabolario scaricato'); },
  'annulla-import': () => annullaImport(),
  'cancella-tutto': async () => {
    if (!data.libri.length && !data.parole.length) { avviso('Non c’è niente da cancellare.'); return; }
    if (!(await conferma('Cancellare tutti i libri e gli appunti?', { ok: 'Cancella tutto', dettaglio: 'Ne tengo una copia per una settimana: se ci ripensi la ritrovi qui in Altro, nel riquadro Backup.' }))) return;
    if (!salvaCopia()) { avviso('Non riesco a mettere da parte una copia (memoria piena), quindi non cancello niente. Scarica prima un backup.', { durata: 9000, errore: true }); return; }
    const vuoti = datiVuoti();
    vuoti.impostazioni = { ...data.impostazioni, obiettivi: {} };
    setData(vuoti); render();
    avviso('Dati cancellati');
  }
});

registraScritture({
  'tema': el => { setTema(el.value); applicaTema(); },
  'chiave-google': el => setChiaveGoogle(el.value)
});
