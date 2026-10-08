// Tutto ciò che rende l'app "installabile" e aggiornabile (PWA):
// - registra il service worker (sw.js)
// - quando è pronta una versione nuova mostra l'avviso "Aggiorna"
// - gestisce il pulsante "Installa l'app"

let installPrompt = null;   // l'evento del browser che permette di mostrare la richiesta di installazione
let onChange = () => {};    // funzione da chiamare quando cambia qualcosa (per ridisegnare la schermata)
let aggiornaRichiesto = false; // diventa true quando l'utente tocca "Aggiorna"

// L'app è aperta come app installata (e non in una scheda del browser)?
export function isInstallata() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
// iPhone e iPad non hanno la richiesta automatica: si installa da Safari con "Condividi"
export function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
export function puoInstallare() { return !!installPrompt; }

export async function installa() {
  if (!installPrompt) return;
  installPrompt.prompt();                 // il browser mostra la sua finestra "Installare l'app?"
  await installPrompt.userChoice;
  installPrompt = null; onChange();
}

export function setupPWA(ridisegna) {
  onChange = ridisegna;

  // Chrome/Edge/Android: il browser avvisa quando l'app si può installare.
  // Blocchiamo il suo banner automatico e mostriamo noi il pulsante, nella scheda "Altro".
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; onChange(); });
  window.addEventListener('appinstalled', () => { installPrompt = null; onChange(); });

  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    // una versione nuova era già scaricata e in attesa (es. dall'apertura precedente)
    if (reg.waiting && navigator.serviceWorker.controller) mostraAggiorna(reg.waiting);
    // una versione nuova inizia a scaricarsi adesso
    reg.addEventListener('updatefound', () => {
      const nuovo = reg.installing;
      nuovo.addEventListener('statechange', () => {
        // "installed" + c'è già un service worker attivo = è un aggiornamento (non la prima installazione)
        if (nuovo.state === 'installed' && navigator.serviceWorker.controller) mostraAggiorna(nuovo);
      });
    });
    // se l'app resta aperta a lungo, ogni ora controlla se è uscita una versione nuova
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(() => {});

  // Quando la versione nuova prende il controllo, si ricarica la pagina per usarla.
  // Solo se l'ha chiesto l'utente: alla primissima installazione il service worker prende
  // il controllo da solo, e lì non c'è niente da ricaricare.
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!aggiornaRichiesto) return;
    aggiornaRichiesto = false;
    window.location.reload();
  });
}

// Avviso in alto. Ha un suo spazio (#aggiornamento), così gli altri avvisi non lo cancellano.
function mostraAggiorna(worker) {
  const t = document.getElementById('aggiornamento');
  t.innerHTML = `<div class="toast" role="status">
    <span>È pronta una nuova versione dell’app.</span>
    <button type="button" id="toast-ok">Aggiorna</button>
    <button type="button" class="secondo" id="toast-no">Più tardi</button></div>`;
  document.getElementById('toast-ok').onclick = () => { aggiornaRichiesto = true; worker.postMessage({ type: 'SKIP_WAITING' }); t.innerHTML = ''; };
  document.getElementById('toast-no').onclick = () => { t.innerHTML = ''; };
}
