// SINCRONIZZAZIONE: leggere e scrivere un file nella cartella nascosta dell'app su Google Drive
// ("appDataFolder": la vede solo questa app, non compare tra i file del Drive). Identico in tutte le mie app.
import { errore } from './google.js';

const API = 'https://www.googleapis.com/drive/v3';
const CARICA = 'https://www.googleapis.com/upload/drive/v3';

async function chiama(token, url, opzioni = {}) {
  let r;
  try { r = await fetch(url, { ...opzioni, headers: { Authorization: 'Bearer ' + token, ...(opzioni.headers || {}) } }); }
  catch (e) { throw errore('rete', 'Nessuna connessione: sincronizzo appena torna.'); }
  if (r.status === 401) throw errore('scaduto', 'L’accesso a Google è scaduto.');
  if (r.status === 403) throw errore('vietato', 'Google Drive non accetta la richiesta (403).');
  if (!r.ok) throw errore('drive', `Google Drive non risponde come dovrebbe (${r.status}).`);
  return r;
}

// Tutti i file con quel nome (di solito uno; due se due dispositivi l'hanno creato nello stesso momento),
// dal più recente.
export async function trova(token, nome) {
  const q = encodeURIComponent(`name='${nome.replace(/'/g, "\\'")}' and trashed=false`);
  const r = await chiama(token, `${API}/files?spaces=appDataFolder&q=${q}&orderBy=modifiedTime%20desc&fields=files(id,modifiedTime)&pageSize=20`);
  const j = await r.json();
  return Array.isArray(j.files) ? j.files : [];
}

export async function leggi(token, id) {
  const r = await chiama(token, `${API}/files/${encodeURIComponent(id)}?alt=media`);
  try { return JSON.parse(await r.text()); } catch (e) { return null; }
}

// Crea il file (se id è null) o ne sostituisce il contenuto. Restituisce l'id.
export async function scrivi(token, nome, contenuto, id = null) {
  const corpo = JSON.stringify(contenuto);
  if (id) {
    await chiama(token, `${CARICA}/files/${encodeURIComponent(id)}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: corpo });
    return id;
  }
  const confine = 'sincro' + Math.random().toString(36).slice(2);
  const meta = JSON.stringify({ name: nome, parents: ['appDataFolder'], mimeType: 'application/json' });
  const body = `--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${confine}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${corpo}\r\n--${confine}--`;
  const r = await chiama(token, `${CARICA}/files?uploadType=multipart&fields=id`, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${confine}` }, body });
  return (await r.json()).id;
}

export async function elimina(token, id) {
  await chiama(token, `${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
