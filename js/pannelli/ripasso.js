// Ripasso delle parole a schede: vedi la parola, provi a ricordare il significato, giri la scheda
// e dici se la sapevi. Le regole (quando rivedrai ogni parola) sono in calcoli.js: dopoRipasso.
import { data, aggiornaRipasso } from '../dati.js';
import { esc, oggi, plurale } from '../utili.js';
import { daRipassare, dopoRipasso } from '../calcoli.js';
import { apriPannello, fermaTocchi } from './pannello.js';
import { render, fraseEvidenziata } from '../viste/comune.js';

// mescola una lista (per l'allenamento libero)
function mescola(lista) {
  const a = [...lista];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

//   allenamento: false = le parole previste per oggi; true = un giro libero su parole a caso
//   (nell'allenamento sapere una parola non cambia il suo calendario: solo sbagliarla la riporta all'inizio)
export function apriRipasso({ allenamento = false } = {}) {
  const coda = allenamento ? mescola(data.parole).slice(0, 15) : daRipassare(data.parole, oggi());
  if (!coda.length) return;
  const totale = coda.length;
  const giaRisposte = new Set(); // parole a cui hai già risposto in questo giro (il secondo passaggio non conta)
  let sapute = 0, daRivedere = 0, fatte = 0;

  const corpo = apriPannello({ titolo: allenamento ? 'Allenamento' : 'Ripasso delle parole', pieno: true, corpo: '<div class="ripasso" id="ripasso"></div>', chiuso: render });
  const zona = corpo.querySelector('#ripasso');

  function fronte() {
    const p = coda[0];
    zona.innerHTML = `
      <p class="ripasso-conto">${fatte < totale ? `Parola ${fatte + 1} di ${totale}` : 'Ancora una volta quelle che non ricordavi'}</p>
      <div class="ripasso-carta">
        <p class="parola"><span class="evid">${esc(p.parola)}</span></p>
        ${p.titoloLibro ? `<p class="da">da ${esc(p.titoloLibro)}</p>` : ''}
        <div class="ripasso-retro" id="retro" hidden>
          <p class="significato">${p.significato.trim() ? esc(p.significato).replace(/\n/g, '<br>') : '<span class="tenue">Non hai ancora scritto il significato.</span>'}</p>
          ${p.frase.trim() ? `<p class="frase">«${fraseEvidenziata(p.frase.trim(), p.parola)}»</p>` : ''}
        </div>
      </div>
      <div class="azioni" id="azioni-fronte"><button type="button" class="bottone bottone--largo" id="gira">Mostra il significato</button></div>
      <div class="azioni" id="azioni-retro" hidden>
        <button type="button" class="bottone bottone--secondario" data-esito="no">Non la ricordavo</button>
        <button type="button" class="bottone" data-esito="si">La sapevo</button>
      </div>`;
    fermaTocchi(); // un doppio tocco non deve girare la scheda appena comparsa
    zona.querySelector('#gira').focus();
  }

  function fine() {
    const domani = daRivedere ? ` ${daRivedere === 1 ? 'Una la rivedi' : daRivedere + ' le rivedi'} domani.` : '';
    zona.innerHTML = `<div class="ripasso-fine">
        <b>${allenamento ? 'Allenamento finito' : 'Ripasso finito'}</b>
        <p>${sapute === totale ? (totale === 1 ? 'La sapevi.' : `Le sapevi tutte e ${totale}.`) : `${plurale(sapute, 'parola saputa', 'parole sapute')} su ${totale}.`}${domani}</p>
      </div>
      <div class="azioni"><button type="button" class="bottone bottone--largo" data-chiudi>Chiudi</button></div>`;
    zona.querySelector('[data-chiudi]').focus();
  }

  zona.addEventListener('click', e => {
    if (e.target.closest('#gira')) {
      zona.querySelector('#retro').hidden = false;
      zona.querySelector('#azioni-fronte').hidden = true;
      zona.querySelector('#azioni-retro').hidden = false;
      fermaTocchi(); // né rispondere prima di aver letto il significato
      zona.querySelector('[data-esito="si"]').focus();
      return;
    }
    const b = e.target.closest('[data-esito]');
    if (!b) return;
    const p = coda.shift(), saputa = b.dataset.esito === 'si';
    if (!giaRisposte.has(p.id)) {
      giaRisposte.add(p.id); fatte++;
      if (saputa) sapute++; else daRivedere++;
      // la parola attuale si rilegge dai dati: potrebbe essere cambiata dall'apertura del ripasso
      const attuale = data.parole.find(x => x.id === p.id);
      if (attuale && (!allenamento || !saputa)) aggiornaRipasso(dopoRipasso(attuale, saputa, oggi()));
    }
    if (!saputa) coda.push(p); // torna in fondo: la rivedi prima di finire
    if (coda.length) fronte(); else fine();
  });

  fronte();
}
