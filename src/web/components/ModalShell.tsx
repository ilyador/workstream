import type { CSSProperties, ReactNode } from 'react';
import s from './ModalShell.module.css';

export interface ModalShellSize {
  width?: string;
  maxWidth?: string;
  height?: string;
  maxHeight?: string;
}

interface ModalShellProps {
  closing?: boolean;
  children: ReactNode;
  className?: string;
  onClose: () => void;
  size?: ModalShellSize;
}

export function ModalShell({ closing = false, children, className = '', onClose, size }: ModalShellProps) {
  const modalStyle = {
    ...(size?.width ? { '--modal-shell-width': size.width } : {}),
    ...(size?.maxWidth ? { '--modal-shell-max-width': size.maxWidth } : {}),
    ...(size?.height ? { '--modal-shell-height': size.height } : {}),
    ...(size?.maxHeight ? { '--modal-shell-max-height': size.maxHeight } : {}),
  } as CSSProperties;

  return (
    <div className={`${s.overlay} ${closing ? s.overlayClosing : ''}`} onClick={onClose}>
      <div
        className={`${s.modal} ${className} ${closing ? s.modalClosing : ''}`}
        style={modalStyle}
        onClick={event => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
