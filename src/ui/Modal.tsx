import { useEffect, useRef, type ReactNode } from 'react';

export function Modal({ title, onClose, children, footer, width }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number }) {
  const down = useRef(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  return (
    <div className="modal-bg" onPointerDown={e => { down.current = e.target === e.currentTarget; }} onClick={e => { if (e.target === e.currentTarget && down.current) onClose(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { maxWidth: width } : undefined}>
        <div className="mh"><h2>{title}</h2><button className="btn small" onClick={onClose} aria-label="Schließen">✕</button></div>
        <div className="mb">{children}</div>
        {footer && <div className="mf">{footer}</div>}
      </div>
    </div>
  );
}
