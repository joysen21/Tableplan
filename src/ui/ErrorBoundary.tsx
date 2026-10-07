/** Auffangnetz für Programmfehler beim Anzeigen: statt einer weißen Seite eine Meldung mit „Neu laden“.
 *  `resetKey` ändert sich z. B. beim Wechsel der Ansicht – dann wird es erneut versucht. */
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { RotateCcw, TriangleAlert } from 'lucide-react';

interface Props { children: ReactNode; resetKey?: string; area?: 'app' | 'view' | 'dialog'; onClose?: () => void }
interface State { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Anzeigefehler', error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    const { area = 'view', onClose } = this.props;
    const box = (
      <div className="panel error-page" role="alert">
        <div className="body">
          <h2><TriangleAlert />Da ist etwas schiefgelaufen</h2>
          <p>{area === 'dialog' ? 'Dieser Dialog konnte nicht angezeigt werden.' : area === 'view' ? 'Diese Ansicht konnte nicht angezeigt werden. Die übrigen Ansichten funktionieren weiter.' : 'Die App konnte nicht angezeigt werden.'}
            {' '}Gespeicherte Daten sind davon nicht betroffen.</p>
          <div className="row">
            <button className="btn primary" onClick={() => location.reload()}><RotateCcw />Neu laden</button>
            {area === 'dialog' && onClose && <button className="btn" onClick={() => { this.setState({ error: null }); onClose(); }}>Schließen</button>}
          </div>
          <details><summary>Technische Details</summary><pre>{error.message}</pre></details>
        </div>
      </div>
    );
    return area === 'dialog' ? <div className="modal-bg"><div className="modal" style={{ maxWidth: 520 }}>{box}</div></div> : box;
  }
}
