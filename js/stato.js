// Stato dell'interfaccia: quello che stai guardando in questo momento (quale lista, quale sezione,
// cosa hai scritto nella ricerca). Non viene salvato: riaprendo l'app si riparte da capo.
export const ui = {
  lista: 'leggendo',        // lista aperta nella Libreria (vedi STATI in migrazione.js)
  cercaLibri: '',           // testo della ricerca in Libreria
  sezioneLibro: 'capitoli', // sezione aperta nella pagina di un libro: capitoli | parole | citazioni | diario | scheda
  libroAperto: null,        // id dell'ultimo libro visitato (per ripartire dalla sezione "capitoli" quando cambia)
  capitoliAperti: new Set(),// riassunti lunghi mostrati per intero
  quaderno: 'parole',       // sezione del Quaderno: parole | citazioni
  cercaParole: '',
  libroParole: '',          // filtro per libro nel Quaderno ('' = tutti)
  soloPreferite: false,
  anno: null                // anno mostrato nelle Statistiche (null = quello in corso)
};
