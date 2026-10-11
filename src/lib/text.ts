/**
 * Textdatei (z. B. CSV) mit dem richtigen Zeichensatz lesen, damit Umlaute und ß erhalten bleiben:
 * UTF-16 (mit BOM, Excel „Unicode-Text“), UTF-8 (mit/ohne BOM), sonst Windows-1252 (Excel-CSV unter Windows, ANSI).
 */
export function decodeText(data: ArrayBuffer | Uint8Array): string {
  const b = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(b);
  if (b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(b);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(b); } // entfernt ein BOM automatisch
  catch { return new TextDecoder('windows-1252').decode(b); }
}

export const readTextFile = async (f: Blob) => decodeText(await f.arrayBuffer());
