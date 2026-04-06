import { useState, useCallback, useRef } from 'react';
import { Modal } from '../components/Modal';
import { ModalContext, type ConfirmOpts } from './modal-context';

interface ModalState {
  title: string;
  message: string;
  type: 'alert' | 'confirm';
  confirmLabel?: string;
  confirmDanger?: boolean;
}

export function ModalProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState | null>(null);
  const resolveRef = useRef<((value: boolean | undefined) => void) | null>(null);

  const close = useCallback((result: boolean | undefined) => {
    resolveRef.current?.(result);
    resolveRef.current = null;
    setModal(null);
  }, []);

  const alert = useCallback((title: string, message: string): Promise<void> => {
    return new Promise((resolve) => {
      resolveRef.current = () => resolve();
      setModal({ title, message, type: 'alert' });
    });
  }, []);

  const confirm = useCallback((title: string, message: string, opts?: ConfirmOpts): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = (value) => resolve(Boolean(value));
      setModal({
        title,
        message,
        type: 'confirm',
        confirmLabel: opts?.label,
        confirmDanger: opts?.danger,
      });
    });
  }, []);

  return (
    <ModalContext.Provider value={{ alert, confirm }}>
      {children}
      <Modal
        open={modal !== null}
        title={modal?.title || ''}
        message={modal?.message || ''}
        onClose={() => close(modal?.type === 'confirm' ? false : undefined)}
        onConfirm={modal?.type === 'confirm' ? () => close(true) : undefined}
        confirmLabel={modal?.confirmLabel}
        confirmDanger={modal?.confirmDanger}
      />
    </ModalContext.Provider>
  );
}
