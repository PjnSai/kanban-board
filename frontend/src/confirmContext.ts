import { createContext, useContext } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return confirm;
}
