import { createContext, useContext } from 'react';

export interface ConfirmOpts {
  label?: string;
  danger?: boolean;
}

export interface ModalContextValue {
  alert: (title: string, message: string) => Promise<void>;
  confirm: (title: string, message: string, opts?: ConfirmOpts) => Promise<boolean>;
}

export const ModalContext = createContext<ModalContextValue | null>(null);

export function useModal(): ModalContextValue {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error('useModal must be used within ModalProvider');
  return ctx;
}
