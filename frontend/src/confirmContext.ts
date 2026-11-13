import { createContext, useContext } from "react";

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  secondaryLabel?: string;
}

export type ConfirmFn = (options: ConfirmOptions) => Promise<boolean>;
export type ChooseResult = "confirm" | "secondary" | "cancel";
export type ChooseFn = (options: ConfirmOptions) => Promise<ChooseResult>;

export const ConfirmContext = createContext<ConfirmFn | null>(null);
export const ChooseContext = createContext<ChooseFn | null>(null);

export function useConfirm(): ConfirmFn {
  const confirm = useContext(ConfirmContext);
  if (!confirm) {
    throw new Error("useConfirm must be used inside ConfirmProvider");
  }
  return confirm;
}

export function useChoose(): ChooseFn {
  const choose = useContext(ChooseContext);
  if (!choose) {
    throw new Error("useChoose must be used inside ConfirmProvider");
  }
  return choose;
}
