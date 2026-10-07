/** Ziehen per Pointer (Maus und Touch). Ohne Bewegung = Klick. */
import type { PointerEvent as ReactPointerEvent } from 'react';
export const dragState = { active: false };

export function startDrag(e: ReactPointerEvent | PointerEvent, opts: {
  label: string;
  onDrop?: (target: Element | null, ev: PointerEvent) => void;
  onClick?: () => void;
}) {
  if ((e as PointerEvent).button > 0) return;
  const sx = e.clientX, sy = e.clientY;
  let ghost: HTMLDivElement | null = null, moved = false;
  const mv = (ev: PointerEvent) => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 7) return;
    if (!moved) { document.body.classList.add('dragging'); window.getSelection()?.removeAllRanges(); }
    moved = true; dragState.active = true;
    if (!ghost) { ghost = document.createElement('div'); ghost.className = 'drag-ghost'; ghost.textContent = opts.label; document.body.appendChild(ghost); }
    ghost.style.left = ev.clientX + 'px'; ghost.style.top = ev.clientY + 'px';
  };
  const up = (ev: PointerEvent) => {
    window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
    ghost?.remove();
    document.body.classList.remove('dragging');
    setTimeout(() => { dragState.active = false; }, 0);
    if (moved) opts.onDrop?.(document.elementFromPoint(ev.clientX, ev.clientY), ev);
    else if (ev.type === 'pointerup') opts.onClick?.();
  };
  window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
}

/** Wie startDrag – bei Touch aber nur am Griff ([data-drag-handle]) ziehen. Sonst bleibt die Geste dem
 *  Browser zum Scrollen; ein kurzes Antippen (ohne Scrollen) löst onClick aus. */
export function startDragOrTap(e: ReactPointerEvent, opts: Parameters<typeof startDrag>[1]) {
  if (e.pointerType !== 'touch' || (e.target as Element).closest('[data-drag-handle]')) return startDrag(e, opts);
  const sx = e.clientX, sy = e.clientY;
  const done = (ev: PointerEvent) => {
    window.removeEventListener('pointerup', done); window.removeEventListener('pointercancel', done);
    if (ev.type === 'pointerup' && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 10) opts.onClick?.();
  };
  window.addEventListener('pointerup', done); window.addEventListener('pointercancel', done);
}

export const dropTableId =(el: Element | null) => (el?.closest('[data-table-id]') as HTMLElement | null)?.dataset.tableId ?? null;

export function svgPoint(svg: SVGSVGElement, ev: { clientX: number; clientY: number }) {
  const p = svg.createSVGPoint(); p.x = ev.clientX; p.y = ev.clientY;
  return p.matrixTransform(svg.getScreenCTM()!.inverse());
}
