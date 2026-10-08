// Un piccolissimo "motore" per i test, senza librerie.
// test('descrizione', () => { ... uguale(ottenuto, atteso) ... })
// Alla fine esegui() scrive i risultati nella pagina (o nella console, se non c'è una pagina).

const tests = [];
let gruppoAttuale = '';
export function gruppo(nome) { gruppoAttuale = nome; }
export function test(nome, fn) { tests.push({ nome: (gruppoAttuale ? gruppoAttuale + ' › ' : '') + nome, fn }); }

// confronta due valori (anche oggetti e liste) e lancia un errore se sono diversi
export function uguale(ottenuto, atteso, messaggio = '') {
  const a = JSON.stringify(ottenuto), b = JSON.stringify(atteso);
  if (a !== b) throw new Error(`${messaggio ? messaggio + ': ' : ''}atteso ${b}, ottenuto ${a}`);
}
export function vero(valore, messaggio = '') {
  if (!valore) throw new Error(messaggio || 'atteso un valore vero, ottenuto ' + JSON.stringify(valore));
}

export function esegui() {
  let ok = 0;
  const righe = [];
  for (const t of tests) {
    try { t.fn(); ok++; righe.push({ nome: t.nome, ok: true }); }
    catch (e) { righe.push({ nome: t.nome, ok: false, errore: e.message }); }
  }
  const riepilogo = `${ok} di ${tests.length} test superati`;
  if (typeof document !== 'undefined') {
    const el = document.getElementById('elenco');
    for (const r of righe) {
      const li = document.createElement('li');
      li.className = r.ok ? 'ok' : 'ko';
      li.textContent = (r.ok ? '✓ ' : '✗ ') + r.nome;
      if (!r.ok) { const pre = document.createElement('pre'); pre.textContent = r.errore; li.appendChild(pre); }
      el.appendChild(li);
    }
    const s = document.getElementById('riepilogo');
    s.textContent = riepilogo; s.className = ok === tests.length ? 'ok' : 'ko';
  } else {
    for (const r of righe) console.log((r.ok ? '✓ ' : '✗ ') + r.nome + (r.ok ? '' : '\n    ' + r.errore));
    console.log(riepilogo);
    if (ok !== tests.length) process.exitCode = 1;
  }
  return { ok, totale: tests.length };
}
