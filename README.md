# I miei libri

App per tenere traccia dei libri che leggo, pensata per il telefono e installabile come app (PWA).
È fatta con HTML, CSS e JavaScript semplici, senza framework né strumenti di compilazione,
come *Le mie abitudini* e *Le Mie Finanze*.

Indirizzo: non ancora pubblicata (vedi [Pubblicazione](#pubblicazione-su-github-pages)).

## Cosa fa (v1.3)

- **Liste**: *Sto leggendo*, *Da leggere* (li ho già), *Voglio leggere* (la lista dei desideri), *Letti*, *Abbandonati*
- **Aggiunta veloce**: scrivi titolo, autore o ISBN e l'app cerca copertina, autore, anno e pagine
  (Open Library, il catalogo delle biblioteche italiane SBN e Google Books); se non lo trova lo scrivi a mano
- **Scansione del codice a barre** (novità 1.1): inquadri il codice sul retro del libro con la fotocamera e l'app
  cerca il libro con quell'ISBN. Se lo trova si apre subito la scheda già compilata
- **Per te** (novità 1.1): libri consigliati a partire da quelli a cui hai dato un voto alto, da quello che stai
  leggendo, dai tuoi autori e dai tuoi generi. Ognuno dice perché è lì; con un tocco va in *Voglio leggere*
  o *Da leggere*, oppure lo scarti e non torna più
- **Segnalibro**: la pagina a cui sei arrivato, con la barra a forma di blocco di pagine e il nastro rosso.
  Dice quanto ti manca e, se continui così, in che giorno finisci
- **Riassunto capitolo per capitolo**: un testo per ogni capitolo, con numero, titolo e "fino a pagina".
  Mentre scrivi il testo viene messo da parte (una bozza per ogni capitolo): se l'app si chiude per sbaglio lo ritrovi
- **Parole nuove**: la parola, cosa vuol dire, la frase in cui l'hai trovata, il libro e la pagina.
  Un pulsante propone il significato dal Wikizionario, un altro apre Treccani
- **Ripasso a schede**: l'app ti ripropone le parole a distanza crescente finché non le sai (regole più sotto)
- **Citazioni**: le frasi che ti colpiscono, con pagina, una nota, le preferite e il tasto per copiarle
- **Cronometro di lettura**: parte da "Leggi adesso", continua anche a schermo spento o ad app chiusa;
  alla fine scrivi la pagina a cui sei arrivato. Le letture si possono anche aggiungere a mano
- **Fine libro**: giorno, voto in stelle e "cosa ti ha lasciato". Se lo rileggi, resta scritto quando l'avevi già finito
- **Statistiche**: libri, pagine, tempo e giorni di lettura per anno; pagine mese per mese; griglia delle ultime
  18 settimane; serie di giorni consecutivi; velocità media; obiettivo di libri dell'anno
- **Per Obsidian**: ogni libro si esporta in una nota Markdown (riassunti, citazioni, parole, voto e pensieri),
  e tutto il vocabolario in un'altra
- **Backup** in un file JSON, con controllo del file prima di importarlo e possibilità di annullare
- **Installabile** sul telefono e funzionante **senza connessione** (tranne la ricerca dei libri e il dizionario)
- Tema chiaro e scuro: automatico, oppure scelto a mano in *Altro*

## Come si usa

- **Oggi**: il libro che stai leggendo. *Leggi adesso* avvia il cronometro, *Aggiorna la pagina* sposta il segnalibro.
  Sotto ci sono tre tasti veloci: *Riassunto*, *Parola*, *Citazione*. Più in basso le parole da ripassare,
  la serie di giorni e l'obiettivo dell'anno.
- **Libreria**: le liste e la ricerca tra i tuoi libri. *Aggiungi* apre la ricerca in rete, con il pulsante
  *Scansiona il codice a barre*. L'ultima scheda in alto, *Per te*, contiene i consigli.
  Toccando un libro si apre la sua pagina, con le sezioni *Capitoli*, *Parole*, *Citazioni*, *Diario* (le letture)
  e *Scheda* (dati, modifica, esportazione). Il menu *Lista* in alto sposta il libro da una lista all'altra;
  accanto, **Togli** lo toglie dalla libreria (chiede conferma, e subito dopo c'è "Annulla").
- **Quaderno**: tutte le parole nuove e tutte le citazioni, di tutti i libri. Da qui parte il ripasso.
- **Statistiche**: scegli l'anno con le frecce; tocca una colonna o un quadratino per leggere i numeri.
- **Altro**: obiettivo dell'anno, tema, installazione, backup, vocabolario per Obsidian, chiave di Google Books.

Per installarla sul telefono: apri il sito, poi "Aggiungi a schermata Home" (Android: menu ⋮ di Chrome → "Installa app";
iPhone: pulsante Condividi in Safari). Tenendo premuta l'icona dell'app compaiono le scorciatoie **Parola nuova**
e **Scansiona un libro**.

## Il ripasso delle parole

Ogni parola ha un livello da 0 a 5, mostrato dalle tacche accanto alla parola.

| Cosa succede | Livello | La rivedi dopo |
|---|---|---|
| Parola appena aggiunta | 0 | 1 giorno |
| "La sapevo" | sale di 1 | 3, 7, 16, 35, 90 giorni (livelli 1, 2, 3, 4, 5) |
| "Non la ricordavo" | torna a 0 | 1 giorno (e te la ripropone subito, prima di chiudere il ripasso) |

Al livello 5 la parola è "imparata". Gli intervalli sono in `js/calcoli.js` (`INTERVALLI`): cambiandoli,
alcuni test vanno aggiornati (è normale: servono a vedere l'effetto delle modifiche).
Con *Allenati* ripassi parole a caso anche quando non ce ne sono in scadenza: in quel caso saperle
non cambia il calendario, sbagliarle le riporta al livello 0.

## Come si contano pagine e giorni

- Ogni volta che il segnalibro avanza (da *Aggiorna la pagina*, dal cronometro, da "fino a pagina" di un riassunto)
  le pagine in più vengono segnate nel **diario** di quel giorno. Statistiche, serie e griglia si calcolano dal diario.
- Un **giorno di lettura** è un giorno con almeno una lettura. La serie non si interrompe finché oggi non è finito.
- La **velocità** (pagine all'ora) usa solo le letture che hanno sia i minuti sia le pagine: per questo conviene
  scrivere la pagina quando fermi il cronometro.
- Un libro aggiunto come **già letto** non porta pagine nelle statistiche (l'hai letto prima dell'app).
  Un libro finito mentre lo stavi leggendo sì: le pagine che mancavano contano nel giorno in cui lo finisci.
- Se aggiungi un libro **già cominciato**, scrivi in "Sono già a pagina" dove sei arrivato: quelle pagine non
  entrano nelle statistiche, si conta da lì in avanti.
- Le stesse pagine **non si contano due volte**: se nello stesso giorno sposti il segnalibro e poi registri una
  lettura che copre le stesse pagine, resta solo la lettura. Se torni indietro per correggere un errore e poi vai
  avanti, si contano solo le pagine nuove.
- Una lettura col cronometro appartiene al **giorno in cui è cominciata**, anche se finisce dopo mezzanotte.
  Se sposti il libro in un'altra lista col cronometro acceso, i minuti letti fin lì finiscono comunque nel diario.

## Piccole protezioni

- Se hai scritto qualcosa in un pannello e lo chiudi (X, Esc, tasto indietro), l'app chiede conferma prima di
  buttare il testo; un tocco per sbaglio fuori dal pannello non lo chiude. Il riassunto di un capitolo non chiede
  niente, perché la bozza resta salvata.
- Per un terzo di secondo dopo l'apertura o la chiusura di un pannello i tocchi vengono ignorati: così un doppio
  tocco non preme per sbaglio il pulsante comparso sotto il dito.
- Se l'app è aperta in due finestre (quella installata e una scheda del browser), quando una salva l'altra
  rilegge i dati: non si cancellano le modifiche a vicenda.
- Togliere un libro dai *Letti* chiede conferma. Le date di inizio e di fine si correggono da *Modifica il libro*.

## Backup dei dati

I dati stanno **solo nel browser del dispositivo** (`localStorage`, chiave `libri-app-v1`): nessun server, nessun account.
Se cancelli i dati del browser o cambi telefono, li perdi. Per questo:

1. Scheda **Altro** → **Scarica il backup**: scarica un file `libri-backup-AAAA-MM-GG.json`.
2. Conservalo dove vuoi (Drive, email, computer).
3. Per recuperarlo: **Importa un backup** e scegli il file. L'app controlla il file, mostra cosa contiene e chiede conferma.
   Prima di sostituire i dati ne mette da parte una copia: se hai sbagliato file, in *Altro* trovi
   **Torna ai dati che avevi il…** (la copia resta una settimana). Lo stesso vale per *Cancella tutti i dati*.

Nel backup non c'è la chiave di Google Books (vedi sotto): quella resta solo sul dispositivo.

Se hai almeno tre libri e non fai un backup da più di 30 giorni, *Oggi* te lo ricorda.

## Ricerca dei libri e chiave di Google Books

Quando aggiungi un libro l'app interroga tre cataloghi gratuiti:

- **SBN**, il catalogo delle biblioteche italiane (opac.sbn.it, novità 1.2): ha praticamente tutti i libri pubblicati
  in Italia, con editore, anno e pagine. Con un ISBN (scritto o scansionato) è il primo a cui si crede.
  Non permette alle pagine web di interrogarlo direttamente, quindi si passa da un piccolo "ponte" su Cloudflare
  (vedi sotto). Non ha le copertine: si prendono da Open Library quando ci sono.

- **Open Library** (openlibrary.org): non serve niente, risponde sempre. Ha molti libri italiani ma non tutti,
  soprattutto tra i più recenti.
- **Google Books**: ha più edizioni italiane, ma senza una chiave personale spesso rifiuta le richieste
  (errore 429, "quota esaurita"). In quel caso l'app usa solo Open Library, senza dire niente.

Se ti capita spesso di non trovare un libro, puoi creare una chiave gratuita di Google Books:

1. Vai su https://console.cloud.google.com/ ed entra con il tuo account Google.
2. Crea un progetto (o usa quello già creato per il calendario di *Le mie abitudini*).
3. *API e servizi* → *Libreria* → cerca **Books API** → **Abilita**.
4. *API e servizi* → *Credenziali* → **Crea credenziali** → **Chiave API**.
5. Nella chiave appena creata, in *Restrizioni delle API*, scegli solo **Books API**; in *Restrizioni delle applicazioni*
   scegli *Siti web* e aggiungi `https://lelloclappato.github.io/*` (così nessun altro sito può usarla).
6. Copia la chiave (comincia con `AIza`) e incollala nell'app: **Altro** → **Ricerca dei libri**.

La chiave resta salvata solo sul tuo dispositivo: non è scritta nel codice, non finisce su GitHub e non entra nei backup.
Se Google la rifiuta, sotto i risultati della ricerca compare una riga che lo dice.
I nomi dei menu della console di Google cambiano ogni tanto: se non li trovi uguali, cerca "Books API" nella barra in alto.

### Il ponte verso SBN (Cloudflare)

È il Worker **libri-sbn** sull'account Cloudflare (lo stesso del sito RS Floral), all'indirizzo
`https://libri-sbn.debartologabriele2005-e41.workers.dev`. Il codice è in `ponte-sbn/worker.js` (non viene
pubblicato su GitHub Pages). Fa solo tre cose: ricerca per ISBN, ricerca per titolo, scheda completa di un libro;
risponde solo all'app (lelloclappato.github.io) e tiene le risposte una settimana per non disturbare SBN.
Il piano gratuito di Cloudflare permette 100.000 richieste al giorno: una ricerca ne usa da 2 a 6.

Per cambiarlo: Cloudflare → Workers e Pages → libri-sbn → Modifica codice → incolla `ponte-sbn/worker.js` → Distribuisci.
Se il ponte non risponde, l'app continua a cercare su Open Library e Google Books come prima.

Il suggerimento del significato usa il **Wikizionario** italiano (it.wiktionary.org), senza chiavi.

## Scansione del codice a barre

Il codice a barre sul retro di un libro è il suo ISBN: 13 cifre che cominciano con 978 o 979. L'ultima cifra è di
controllo, quindi una lettura sbagliata viene scartata e la fotocamera continua a cercare. Gli altri codici
(per esempio quello piccolo del prezzo) vengono ignorati.

- **Chi legge il codice**: Chrome su Android ha un lettore già pronto e l'app usa quello. Negli altri browser
  (Firefox, Chrome sul computer…) la prima volta si scarica un lettore di riserva di circa 1 MB, che sta in `vendor/`
  (barcode-detector + zxing-wasm, licenze MIT e Apache 2.0, vedi `vendor/LICENZE.txt`).
- **Permesso**: la prima volta il telefono chiede di usare la fotocamera. Se dici di no, l'app spiega come
  cambiare idea e intanto puoi scrivere l'ISBN a mano.
- **Luce**: se il telefono lo permette, compare il pulsante *Luce* per accendere il flash.
- **Libro non trovato**: con SBN succede di rado (libri stranieri non tradotti, o usciti da pochissimo). L'ISBN letto resta comunque nella
  scheda, anche se poi aggiungi il libro a mano o lo cerchi per titolo (se il risultato scelto non ha un ISBN suo).

## Per te: come nascono i consigli

Tutto succede sul telefono, con il catalogo gratuito di Open Library. Nessun dato tuo viene mandato altrove:
partono solo le ricerche (titoli, autori, generi).

1. Si guardano i tuoi libri: contano di più quelli finiti con 4-5 stelle e quello che stai leggendo. Quelli con
   1-2 stelle o abbandonati contano "contro": i loro autori non vengono consigliati. Se non hai ancora finito niente,
   si parte da *Da leggere* e *Voglio leggere*.
2. Per ognuno si chiede a Open Library chi l'ha scritto e di cosa parla (i "soggetti": fantasy, gialli, Medioevo…).
   Conta anche il genere che hai scritto nella scheda. Le risposte restano da parte per due mesi.
3. Si cercano altri libri dei tuoi autori preferiti (fino a 3) e altri libri con i generi e gli argomenti che
   tornano più spesso (fino a 4). Si considerano solo i libri usciti anche in italiano, i più letti per primi.
4. Un libro trovato da più ricerche sale in classifica. Al massimo due libri per autore. Spariscono quelli che hai
   già e quelli scartati.

I consigli si rifanno da soli dopo una settimana, quando cambia un voto o finisci un libro, oppure con *Aggiorna*.
Open Library non ama troppe richieste ravvicinate: ogni aggiornamento ne fa una dozzina, una alla volta.
Se non risponde restano i consigli dell'ultima volta. I libri scartati sono salvati nei dati, quindi anche nel
backup; *Riproponili*, in fondo all'elenco, li fa tornare.

## Provarla sul computer

I moduli JavaScript non funzionano aprendo `index.html` con un doppio clic: serve un piccolo server locale.
Dalla cartella del progetto:

```
python3 -m http.server 8000
```

poi apri http://localhost:8000 nel browser.

**Test**: apri http://localhost:8000/tests/test.html. La pagina esegue 203 test con dati inventati (conti, formato dei dati, scansione, consigli,
controllo dei backup, lettura delle risposte dei cataloghi e del dizionario, esportazione in Markdown, operazioni sui dati)
e mostra in verde quelli superati e in rosso quelli falliti. I test salvano i loro dati di prova sotto un nome a parte
(`libri-app-PROVA`): i tuoi libri non vengono toccati. Da riaprire dopo ogni modifica ai file in `js/`.
Chi ha Node.js può eseguirli anche con `node tests/da-terminale.mjs`.

## Pubblicazione su GitHub Pages

1. Crea su GitHub un repository nuovo (per esempio `i-miei-libri`) e caricaci il contenuto di questa cartella `app/`.
2. La pubblicazione è automatica: a ogni push sul ramo `main`, GitHub esegue `.github/workflows/deploy-pages.yml`,
   che copia i file del sito (senza test, guide e file `.md`) e li pubblica. Dopo un paio di minuti l'app è su
   `https://lelloclappato.github.io/i-miei-libri/`.

Il workflow scrive il codice del commit come versione del service worker (`const VERSION` in `sw.js`):
così ogni pubblicazione crea una cache nuova e non serve cambiare niente a mano. Controlla anche che ogni file
elencato in `sw.js` esista davvero. Sul telefono, alla prima apertura con internet dopo una pubblicazione,
l'app scarica la nuova versione in sottofondo e mostra **"È pronta una nuova versione – Aggiorna"**.
Se aggiungi un file nuovo al sito, aggiungilo anche all'elenco `FILES` in `sw.js`, altrimenti non sarà disponibile
senza connessione.

Tutte le app pubblicate su `lelloclappato.github.io` condividono la memoria del browser: questa usa solo
nomi che cominciano con `libri-` (dati, bozze, cache) e non tocca quelli delle altre. Se la sua cache viene
cancellata da fuori, alla prima apertura con internet riscarica tutto da sola.

## Struttura

- `index.html`: la pagina (solo lo scheletro)
- `css/style.css`: lo stile, con i colori per tema chiaro e scuro in cima
- `fonts/`: i font Instrument Sans (interfaccia e numeri) e Literata (titoli e testi da leggere), con le loro licenze
  (SIL Open Font License)
- `js/`: la logica, divisa in moduli JavaScript (`import` / `export`)
  - `app.js`: punto di partenza, collega i tocchi alle azioni e gestisce il cambio di schermata
  - `dati.js`: lettura, salvataggio e tutte le operazioni che cambiano i dati
  - `deposito.js`: dove si salva (il `localStorage` del browser; se il browser non lo concede, solo in memoria)
  - `migrazione.js`: il formato dei dati (descritto in cima al file) e la riparazione di dati incompleti
  - `validazione.js`: controllo dei file di backup
  - `calcoli.js`: avanzamento, serie, statistiche, stime, ripasso (funzioni "pure", testate)
  - `ricerca.js`: ricerca dei libri su Open Library e Google Books (e lettura dell'ISBN dal codice a barre)
  - `consigli.js`: i consigli "Per te"
  - `dizionario.js`: suggerimento del significato dal Wikizionario
  - `markdown.js`: esportazione per Obsidian
  - `backup.js`: esporta e importa il file JSON
  - `pwa.js`: service worker, avviso di aggiornamento, installazione
  - `icone.js`: le icone SVG (disegni di [Lucide](https://lucide.dev), licenza ISC)
  - `stato.js`, `utili.js`: stato dell'interfaccia e piccole funzioni comuni
  - `viste/`: le schermate
    - `comune.js`: il telaio (quale schermata disegnare, barra in basso, avvisi, copertina, nastro)
    - `oggi.js`, `libreria.js`, `libro.js`, `quaderno.js`, `statistiche.js`, `lettura.js` (cronometro), `altro.js`
    - `elementi.js`: pezzi usati in più schermate (una parola, una citazione)
  - `pannelli/`: le finestre che salgono dal basso
    - `pannello.js`: apertura, chiusura e finestra di conferma
    - `libro-form.js` (aggiungi e modifica un libro), `pagina.js` (segnalibro e obiettivo), `capitolo.js`,
      `parola.js`, `citazione.js`, `lettura-form.js` (fine lettura e lettura a mano), `giudizio.js` (voto e pensieri),
      `ripasso.js`, `scansione.js` (fotocamera e codice a barre)
- `ponte-sbn/worker.js`: il ponte verso il catalogo SBN, che gira su Cloudflare (non fa parte del sito)
- `vendor/`: il lettore di codici a barre di riserva, per i browser che non ne hanno uno (con le licenze)
- `sw.js`, `manifest.json`, `icon-*.png`: installazione e funzionamento offline
- `tests/`: i test (`test.html` da aprire nel browser)
- `.github/workflows/deploy-pages.yml`: pubblicazione su GitHub Pages

## Colori e contrasto

I colori sono variabili CSS all'inizio di `css/style.css`: carta da zucchero per lo sfondo, inchiostro blu per testo
e pulsanti, rosso per il nastro segnalibro, giallo evidenziatore per le parole nuove.
Rapporti di contrasto verificati (minimo richiesto: 4.5:1 per il testo, 3:1 per bordi dei campi e parti dei grafici):

| Coppia | Chiaro | Scuro |
|---|---|---|
| Testo su sfondo | 13.2 | 15.6 |
| Testo su scheda | 15.3 | 14.0 |
| Testo tenue (`--tenue`) su sfondo | 6.0 | 8.8 |
| Testo tenue su scheda | 6.9 | 7.8 |
| Rosso del nastro (`--nastro`) su scheda | 6.3 | 5.9 |
| Testo sopra l'evidenziatore | 12.2 | 5.0 |
| Bordo dei campi (`--linea-forte`) su sfondo | 3.6 | 3.9 |
| Colonne del grafico (`--att-2`) su scheda | 3.1 | 3.0 |
| Testo sulle copertine disegnate (la tinta più chiara) | 6.0 | 6.0 |
