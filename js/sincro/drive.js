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
  if (!r.ok) {
    // il motivo che dà Google (es. "accessNotConfigured" = la Drive API non è attiva nel progetto)
    let motivo = '';
    try { const j = await r.json(); motivo = (j.error && ((j.error.errors && j.error.errors[0] && j.error.errors[0].reason) || j.error.status)) || ''; } catch (e) {}
    if (motivo === 'accessNotConfigured' || motivo === 'SERVICE_DISABLED') throw errore('api-spenta', 'La Google Drive API non è attiva nel progetto Google Cloud “Le mie app”: attivala in API e servizi → Libreria.');
    throw errore(r.status === 403 ? 'vietato' : 'drive', `Google Drive non accetta la richiesta (${r.status}${motivo ? ', ' + motivo : ''}).`);
  }
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
