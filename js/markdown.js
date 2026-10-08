// Trasforma la scheda di un libro (o tutto il vocabolario) in un testo Markdown,
// il formato delle note di Obsidian: così riassunti, citazioni e parole si possono
// incollare o salvare nel Second Brain. Funzioni pure, con i loro test.
import { ilGiorno, plurale } from './utili.js';
import { NOME_STATO_LIBRO } from './migrazione.js';
import { capitoliInOrdine } from './calcoli.js';

// Nome leggibile di un capitolo: "Capitolo 3", oppure il titolo per quelli senza numero (prologo, epilogo…).
export function nomeCapitolo(c) {
  if (c.numero > 0) return 'Capitolo ' + c.numero;
  return c.titolo || 'Prima del primo capitolo';
}

const stelle = voto => '★'.repeat(voto) + '☆'.repeat(5 - voto);
// nel "frontmatter" (le righe tra --- in cima alla nota) le virgolette vanno protette
const yaml = s => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
// una citazione su più righe: ogni riga comincia con ">"
const blocco = s => String(s).trim().split('\n').map(r => '> ' + r).join('\n');

export function libroInMarkdown(libro, parole = []) {
  const r = [];
  r.push('---');
  r.push('titolo: ' + yaml(libro.titolo));
  if (libro.autore) r.push('autore: ' + yaml(libro.autore));
  r.push('stato: ' + yaml(NOME_STATO_LIBRO[libro.stato]));
  if (libro.voto) r.push('voto: ' + libro.voto);
  if (libro.iniziato) r.push('iniziato: ' + libro.iniziato);
  if (libro.finito) r.push((libro.stato === 'abbandonato' ? 'abbandonato' : 'finito') + ': ' + libro.finito);
  if (libro.pagine) r.push('pagine: ' + libro.pagine);
  r.push('tags: [libro]');
  r.push('---', '');
  r.push('# ' + libro.titolo, '');
  const riga = [libro.autore, libro.editore, libro.anno].filter(Boolean).join(', ');
  if (riga) r.push(riga, '');
  if (libro.voto) r.push(`Voto: ${stelle(libro.voto)} (${libro.voto} su 5)`, '');
  if (libro.nota.trim()) r.push('## Perché questo libro', '', libro.nota.trim(), '');
  if (libro.recensione.trim()) r.push('## Cosa mi ha lasciato', '', libro.recensione.trim(), '');

  const capitoli = capitoliInOrdine(libro);
  if (capitoli.length) {
    r.push('## Riassunto capitolo per capitolo', '');
    for (const c of capitoli) {
      const nome = nomeCapitolo(c);
      r.push('### ' + (c.numero > 0 && c.titolo ? `${nome} – ${c.titolo}` : nome), '');
      r.push(c.riassunto.trim() || '_Ancora da riassumere._', '');
    }
  }

  if (libro.citazioni.length) {
    r.push('## Citazioni', '');
    const citazioni = [...libro.citazioni].sort((a, b) => (a.pagina ?? 1e9) - (b.pagina ?? 1e9));
    for (const c of citazioni) {
      r.push(blocco(c.testo));
      if (c.pagina !== null) r.push('> — pagina ' + c.pagina);
      r.push('');
      if (c.nota.trim()) r.push(c.nota.trim(), '');
    }
  }

  const sue = parole.filter(p => p.libroId === libro.id);
  if (sue.length) {
    r.push('## Parole nuove', '');
    for (const p of sue) r.push(rigaParola(p));
    r.push('');
  }
  return r.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

function rigaParola(p, conLibro = false) {
  let s = `- **${p.parola}**`;
  if (p.significato.trim()) s += ': ' + p.significato.trim().replace(/\n+/g, ' ');
  if (p.frase.trim()) s += ` — «${p.frase.trim().replace(/\n+/g, ' ')}»`;
  const dove = [conLibro && p.titoloLibro ? `*${p.titoloLibro}*` : '', p.pagina !== null ? 'pag. ' + p.pagina : ''].filter(Boolean).join(', ');
  if (dove) s += ` (${dove})`;
  return s;
}

// Tutto il vocabolario in ordine alfabetico.
export function vocabolarioInMarkdown(parole, oggiK) {
  const r = ['# Le mie parole nuove', '', `${plurale(parole.length, 'parola', 'parole')}, aggiornato ${ilGiorno(oggiK, {}, 'al')}.`, ''];
  const ordinate = [...parole].sort((a, b) => a.parola.localeCompare(b.parola, 'it', { sensitivity: 'base' }));
  for (const p of ordinate) r.push(rigaParola(p, true));
  return r.join('\n') + '\n';
}

// Nome di file sicuro a partire da un titolo: niente caratteri vietati da Windows.
export function nomeFile(titolo) {
  return String(titolo).replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'libro';
}
