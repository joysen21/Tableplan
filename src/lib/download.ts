export function downloadBlob(name: string, blob: Blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
/** CSV mit Semikolon und BOM (öffnet direkt korrekt in Excel) */
export function downloadCSV(name: string, rows: (string | number | null | undefined)[][]) {
  const csv = '﻿' + rows.map(r => r.map(c => { const s = String(c ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  downloadBlob(name, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
