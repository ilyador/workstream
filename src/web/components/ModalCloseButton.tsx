import s from './ModalCloseButton.module.css';

interface ModalCloseButtonProps {
  onClick: () => void;
  label?: string;
}

export function ModalCloseButton({ onClick, label = 'Close' }: ModalCloseButtonProps) {
  return (
    <button className={s.closeButton} type="button" onClick={onClick} aria-label={label} title={label}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M18 6L6 18M6 6l12 12" />
      </svg>
    </button>
  );
}
