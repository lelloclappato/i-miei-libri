// La sincronizzazione di questa app tra telefono e computer, tramite il tuo Google Drive.
// Il funzionamento (uguale in tutte le mie app) è in js/sincro/; qui c'è solo quello che riguarda I miei libri:
// quali dati si sincronizzano, come si chiamano, e cosa chiedere la prima volta.
import { data, setData, quandoSalva } from './dati.js';
import { creaSincro, conta } from './sincro/sincro.js';
import { plurale } from './utili.js';
import { scegli } from './pannelli/pannello.js';

// L'"ID client OAuth" del progetto Google Cloud "Le mie app" (è pubblico: identifica l'app, non dà accesso a niente).
// Vuoto = niente sincronizzazione: l'app funziona come prima, solo sul dispositivo.
export const GOOGLE_CLIENT_ID = '';

// Cosa si sincronizza. Resta solo su questo dispositivo: il giorno dell'ultimo backup.
export const SCHEMA = {
  raccolte: [
    { percorso: 'libri', chiave: l => l.id, figli: [
      { campo: 'capitoli', chiave: c => c.id },
      { campo: 'citazioni', chiave: c => c.id },
      { campo: 'personaggi', chiave: p => p.id }
    ] },
    { percorso: 'parole', chiave: p => p.id },
    { percorso: 'letture', chiave: s => s.id }
  ],
  singoli: ['impostazioni', 'timer', 'scartati']
};

let ridisegna = () => {};
export function quandoArrivanoDati(fn) { ridisegna = fn; }

function descrivi(p) {
  const n = conta(p);
  return [plurale(n.libri || 0, 'libro', 'libri'), n.parole ? plurale(n.parole, 'parola', 'parole') : ''].filter(Boolean).join(' e ');
}

export const sincro = creaSincro({
  prefisso: 'libri',
  nomeFile: 'libri.json',
  schema: SCHEMA,
  clientId: GOOGLE_CLIENT_ID,
  leggiDati: () => data,
  scriviDati: nuovi => { setData(nuovi); ridisegna(); },
  descrivi,
  // la prima volta che questo dispositivo si collega, se qui e sull'account ci sono libri diversi
  chiediPrimaUnione: ({ qui, account }) => scegli('Sul tuo account ci sono già dei dati', {
    dettaglio: `Sull’account: ${account}. Su questo dispositivo: ${qui}. Cosa vuoi tenere?`,
    scelte: [
      { valore: 'unisci', testo: 'Tutti e due: uniscili', principale: true },
      { valore: 'account', testo: 'Solo quelli dell’account' },
      { valore: 'annulla', testo: 'Annulla, non collegare' }
    ]
  })
});

quandoSalva(() => sincro.dopoSalvataggio());
