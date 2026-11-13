import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ChooseContext, ConfirmContext } from "./confirmContext";
import type {
  ChooseFn,
  ChooseResult,
  ConfirmFn,
  ConfirmOptions,
} from "./confirmContext";

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: ChooseResult) => void) | null>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const choose = useCallback<ChooseFn>((opts) => {
    return new Promise<ChooseResult>((resolve) => {
      resolver.current = resolve;
      setOptions(opts);
    });
  }, []);

  const confirm = useCallback<ConfirmFn>(
    async (opts) => (await choose(opts)) === "confirm",
    [choose],
  );

  const close = useCallback((result: ChooseResult) => {
    resolver.current?.(result);
    resolver.current = null;
    setOptions(null);
  }, []);

  useEffect(() => {
    if (!options) return;
    cancelRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close("cancel");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [options, close]);

  return (
    <ConfirmContext.Provider value={confirm}>
      <ChooseContext.Provider value={choose}>
        {children}
        {options && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            onClick={() => close("cancel")}
          >
            <div
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="confirm-title"
              aria-describedby="confirm-message"
              className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h2
                id="confirm-title"
                className="text-lg font-semibold text-slate-800"
              >
                {options.title}
              </h2>
              {options.message && (
                <p id="confirm-message" className="mt-2 text-sm text-slate-600">
                  {options.message}
                </p>
              )}
              <div className="mt-6 flex flex-wrap justify-end gap-2">
                <button
                  ref={cancelRef}
                  onClick={() => close("cancel")}
                  className="rounded-lg px-4 py-2 text-sm bg-slate-200 text-slate-700 hover:bg-slate-300"
                >
                  {options.cancelLabel ?? "Cancel"}
                </button>
                {options.secondaryLabel && (
                  <button
                    onClick={() => close("secondary")}
                    className="rounded-lg px-4 py-2 text-sm bg-slate-700 text-white hover:bg-slate-800"
                  >
                    {options.secondaryLabel}
                  </button>
                )}
                <button
                  onClick={() => close("confirm")}
                  className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                    options.danger
                      ? "bg-red-600 hover:bg-red-700"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {options.confirmLabel ?? "Confirm"}
                </button>
              </div>
            </div>
          </div>
        )}
      </ChooseContext.Provider>
    </ConfirmContext.Provider>
  );
}
