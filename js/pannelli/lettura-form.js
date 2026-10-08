// Pannelli delle letture: quello di fine lettura (quando fermi il cronometro)
// e quello per aggiungere a mano una lettura fatta senza cronometro.
import { data, libro, registraLettura, annullaTimer, tempoTimer, pausaTimer, riprendiTimer } from '../dati.js';
import { esc, intero, oggi, chiaveValida, plurale } from '../utili.js';
import { apriPannello, chiudiPannello, conferma } from './pannello.js';
import { render, vai, vaiPoi, avviso } from '../viste/comune.js';
import { apriGiudizio } from './giudizio.js';

// Controlla minuti e pagine scritti nel modulo. Restituisce { minuti, da, a } oppure mostra l'errore e restituisce null.
//   partenza: la pagina da cui si parte quando il modulo non ha il campo "Da pagina" (fine del cronometro)
function leggi(form, corpo, l, partenza = l.pagina) {
  const errore = corpo.querySelector('#errore');
  const sbagliato = (testo, campo) => { errore.textContent = testo; errore.hidden = false; campo.focus(); return null; };
  const minuti = intero(form.elements.minuti.value) ?? 0;
  const a = intero(form.elements.a.value);
  const da = form.elements.da ? intero(form.elements.da.value) : partenza;
  if (minuti > 24 * 60) return sbagliato('I minuti sono troppi: una giornata ne ha 1.440.', form.elements.minuti);
  if (a !== null && l.pagine && a > l.pagine) return sbagliato(`Il libro ha ${l.pagine} pagine: controlla il numero.`, form.elements.a);
  if (a !== null && da !== null && a < da) return sbagliato(`La pagina di arrivo viene prima di quella di partenza (${da}).`, form.elements.a);
  if (!minuti && (a === null || da === null || a === da)) return sbagliato('Scrivi quanti minuti hai letto, oppure a che pagina sei arrivato.', form.elements.minuti);
  return { minuti, da: a === null ? null : (da ?? 0), a };
}

// Dopo aver salvato: se sei arrivato all'ultima pagina si passa al voto, altrimenti si chiude.
function dopoSalvataggio(libroId, messaggio) {
  const l = libro(libroId);
  chiudiPannello();
  if (l.pagine && l.pagina >= l.pagine && l.stato === 'leggendo') { vaiPoi('#/libro/' + libroId, () => apriGiudizio(libroId, { finisci: true })); return; }
  vai('#/oggi');
  avviso(messaggio);
}

// ---------- fine della lettura col cronometro ----------
export function apriFineLettura() {
  const t = data.timer, l = t ? libro(t.libroId) : null;
  if (!l) { annullaTimer(); render(); return; }
  pausaTimer(); // mentre compili il modulo il tempo non scorre
  render();
  const trascorsi = Math.max(1, Math.round(tempoTimer() / 60000));
  // Cronometro dimenticato acceso (più di 12 ore): il numero non dice quanto hai letto davvero, lo scrivi tu.
  const dimenticato = trascorsi > 12 * 60;
  const minuti = dimenticato ? '' : trascorsi;
  // La pagina da cui eri partito quando hai avviato il cronometro (anche se nel frattempo hai spostato il segnalibro).
  const partenza = Number.isFinite(t.paginaInizio) ? Math.min(t.paginaInizio, l.pagina) : l.pagina;
  const giorno = t.giornoInizio || oggi();
  const corpo = apriPannello({
    titolo: 'Fine della lettura',
    corpo: `<form novalidate>
      <p class="tenue" style="margin-bottom:14px">${esc(l.titolo)}</p>
      ${dimenticato ? '<p class="nota-avviso">Il cronometro è rimasto acceso per più di mezza giornata: scrivi tu quanti minuti hai letto davvero.</p>' : ''}
      <div class="campi-2">
        <label class="campo"><span>Minuti letti</span>
          <input name="minuti" value="${minuti}" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off"></label>
        <label class="campo"><span>Arrivato a pagina</span>
          <input name="a" value="" placeholder="${l.pagina ? 'eri a ' + l.pagina : ''}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off" autofocus></label>
      </div>
      <p class="aiuto" style="margin:-6px 0 14px">Con la pagina l’app impara la tua velocità e stima quanto ti manca.</p>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni"><button type="submit" class="bottone">Salva la lettura</button></div>
      <div class="azioni-testo" style="margin-top:10px">
        <button type="button" class="bottone-testo" id="continua">Continua a leggere</button>
        <button type="button" class="bottone-testo bottone-testo--pericolo" id="scarta">Scarta questa lettura</button>
      </div>
    </form>`
  });
  const form = corpo.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = leggi(form, corpo, l, partenza);
    if (!v) return;
    // la lettura appartiene al giorno in cui è cominciata (conta se hai letto a cavallo di mezzanotte)
    registraLettura({ libroId: l.id, giorno, minuti: v.minuti, da: v.da, a: v.a, tipo: 'timer' });
    annullaTimer();
    dopoSalvataggio(l.id, `Lettura salvata: ${v.minuti} min${v.a !== null && v.a > v.da ? ', ' + plurale(v.a - v.da, 'pagina', 'pagine') : ''}`);
  });
  // "Continua a leggere": il cronometro riparte da dove si era fermato
  corpo.querySelector('#continua').addEventListener('click', () => { riprendiTimer(); chiudiPannello(); render(); });
  corpo.querySelector('#scarta').addEventListener('click', async () => {
    if (!(await conferma('Scartare questa lettura?', { ok: 'Scarta', dettaglio: 'Il tempo del cronometro non verrà salvato.' }))) return;
    annullaTimer(); chiudiPannello(); vai('#/oggi');
  });
}

// ---------- lettura aggiunta a mano ----------
export function apriLetturaManuale(libroId) {
  const l = libro(libroId);
  if (!l) return;
  const corpo = apriPannello({
    titolo: 'Aggiungi una lettura',
    corpo: `<form novalidate>
      <p class="tenue" style="margin-bottom:14px">${esc(l.titolo)}</p>
      <div class="campi-2">
        <label class="campo"><span>Giorno</span>
          <input type="date" name="giorno" value="${oggi()}" max="${oggi()}" required></label>
        <label class="campo"><span>Minuti letti</span>
          <input name="minuti" value="" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" autofocus></label>
      </div>
      <div class="campi-2">
        <label class="campo"><span>Da pagina</span>
          <input name="da" value="${l.pagina}" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
        <label class="campo"><span>A pagina</span>
          <input name="a" value="" inputmode="numeric" pattern="[0-9]*" maxlength="5" autocomplete="off"></label>
      </div>
      <p class="errore" id="errore" hidden></p>
      <div class="azioni"><button type="submit" class="bottone">Salva la lettura</button></div>
    </form>`
  });
  const form = corpo.querySelector('form');
  form.addEventListener('submit', e => {
    e.preventDefault();
    const v = leggi(form, corpo, l);
    if (!v) return;
    const g = form.elements.giorno.value;
    if (!chiaveValida(g) || g > oggi()) { const er = corpo.querySelector('#errore'); er.textContent = 'Scegli un giorno, non nel futuro.'; er.hidden = false; form.elements.giorno.focus(); return; }
    registraLettura({ libroId, giorno: g, minuti: v.minuti, da: v.da, a: v.a, tipo: 'manuale' });
    const ora = libro(libroId);
    if (ora.pagine && ora.pagina >= ora.pagine && ora.stato === 'leggendo') { apriGiudizio(libroId, { finisci: true }); return; }
    chiudiPannello(); render();
    avviso('Lettura aggiunta');
  });
}
