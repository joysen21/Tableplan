import { closeConfirm, useFeedback } from './notify';
import { Modal } from './Modal';

export function Feedback() {
  const { toasts, confirm } = useFeedback();
  return (
    <>
      {toasts.map(t => <div key={t.id} className={'toast' + (t.kind === 'err' ? ' err' : '')} role="status">{t.text}</div>)}
      {confirm && (
        <div style={{ position: 'relative', zIndex: 150 }}>
          <Modal title={confirm.title} onClose={() => closeConfirm(false)} width={520}
            footer={<><button className="btn" onClick={() => closeConfirm(false)}>Abbrechen</button>
              <button className={'btn ' + (confirm.danger ? 'danger solid' : 'primary')} onClick={() => closeConfirm(true)} autoFocus>{confirm.okLabel}</button></>}>
            <div className={confirm.danger ? 'warnbox' : 'infobox'}>{confirm.lines.map((l, i) => <div key={i}>{l}</div>)}</div>
          </Modal>
        </div>
      )}
    </>
  );
}
