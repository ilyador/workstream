import { useEffect } from 'react';
import { useExitAnimation } from '../hooks/useExitAnimation';
import { ModalCloseButton } from './ModalCloseButton';
import s from './Modal.module.css';

export interface ModalProps {
  open: boolean;
  title: string;
  message: string;
  onClose: () => void;
  onConfirm?: () => void;
  confirmLabel?: string;
  confirmDanger?: boolean;
}

export function Modal({
  open,
  title,
  message,
  onClose,
  onConfirm,
  confirmLabel = 'Confirm',
  confirmDanger = false,
}: ModalProps) {
  const { closing, closeWithAnimation } = useExitAnimation(onClose);
  const { closing: confirming, closeWithAnimation: confirmWithAnimation } = useExitAnimation(onConfirm ?? onClose);
  const isClosing = closing || confirming;

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeWithAnimation();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [closeWithAnimation, open]);

  if (!open) return null;

  const isConfirm = typeof onConfirm === 'function';

  return (
    <div className={`${s.overlay} ${isClosing ? s.overlayClosing : ''}`} onClick={closeWithAnimation}>
      <div className={`${s.modal} ${isClosing ? s.modalClosing : ''}`} onClick={(e) => e.stopPropagation()}>
        <ModalCloseButton onClick={closeWithAnimation} />
        <div className={s.title}>{title}</div>
        <div className={s.message}>{message}</div>
        <div className={s.buttons}>
          {isConfirm ? (
            <>
              <button className="btn btnGhost btnSm" onClick={closeWithAnimation}>Cancel</button>
              <button
                className={`btn btnSm ${confirmDanger ? 'btnDanger' : 'btnPrimary'}`}
                onClick={confirmWithAnimation}
              >
                {confirmLabel}
              </button>
            </>
          ) : (
            <button className="btn btnPrimary btnSm" onClick={closeWithAnimation}>OK</button>
          )}
        </div>
      </div>
    </div>
  );
}
