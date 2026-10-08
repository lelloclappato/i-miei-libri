// Schermata del cronometro: il tempo che scorre mentre leggi, pausa, fine,
// e le tre azioni veloci per segnare al volo un riassunto, una parola o una citazione.
import { data, libro, pausaTimer, riprendiTimer, tempoTimer } from '../dati.js';
import { esc, cronometro } from '../utili.js';
import { icona } from '../icone.js';
import { copertina, registraVista, registraAzioni, render } from './comune.js';
import { azioniVeloci } from './oggi.js';
import { apriFineLettura } from '../pannelli/lettura-form.js';

function vista() {
  const t = data.timer, l = t ? libro(t.libroId) : null;
  if (!l) {
    return `<a class="torna" href="#/oggi">${icona('indietro')}Oggi</a>
      <div class="vuoto"><h1 class="titolo-scheda">Nessuna lettura in corso</h1>
      <p>Il cronometro parte da “Leggi adesso”, nella scheda del libro che stai leggendo.</p>
      <a class="bottone" href="#/oggi">Vai a Oggi</a></div>`;
  }
  return `
    <a class="torna" href="#/oggi">${icona('indietro')}Oggi</a>
    <div class="lettura-ora">
      ${copertina(l)}
      <h1>${esc(l.titolo)}</h1>
      <p class="tenue">${l.pagina ? `Sei a pagina ${l.pagina}${l.pagine ? ' di ' + l.pagine : ''}` : 'Dalla prima pagina'}</p>
      <p class="tempo${t.inPausa ? ' in-pausa' : ''}" role="timer" aria-label="Tempo di lettura"><span data-tempo>${cronometro(tempoTimer())}</span></p>
      <p class="tenue piccolo">${t.inPausa ? 'In pausa.' : 'Puoi spegnere lo schermo o chiudere l’app: il tempo continua a contare.'}</p>
      <div class="azioni">
        <button type="button" class="bottone bottone--secondario" data-azione="timer-pausa">${t.inPausa ? icona('avvia') + 'Riprendi' : icona('pausa') + 'Pausa'}</button>
        <button type="button" class="bottone" data-azione="timer-fine">${icona('fatto')}Ho finito</button>
      </div>
      ${azioniVeloci(l.id)}
    </div>`;
}

registraVista('lettura', vista);

registraAzioni({
  'timer-pausa': () => { if (data.timer && data.timer.inPausa) riprendiTimer(); else pausaTimer(); render(); },
  'timer-fine': () => apriFineLettura()
});
