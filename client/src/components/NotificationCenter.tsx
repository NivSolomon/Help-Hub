import React, { createContext, useContext, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export type NotificationVariant = "info" | "success" | "warning" | "error";
export type NotificationAction = { label: string; onClick: () => void };

export type NotifyOptions = {
  title?: string;
  message: string;
  variant?: NotificationVariant;
  duration?: number | null;
  action?: NotificationAction;
};

export type NotificationItem = NotifyOptions & { id: number; createdAt: number };

type NotificationContextValue = {
  notify: (options: NotifyOptions) => number;
  dismiss: (id: number) => void;
};

const NotificationContext = createContext<NotificationContextValue | null>(null);

const variantStyles: Record<NotificationVariant, string> = {
  info: "border border-indigo-200 bg-white/95 text-indigo-800",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border border-amber-200 bg-amber-50 text-amber-800",
  error: "border border-rose-200 bg-rose-50 text-rose-800",
};

const variantDot: Record<NotificationVariant, string> = {
  info: "bg-indigo-500",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  error: "bg-rose-500",
};

function NotificationLayer({ items, onDismiss }: { items: NotificationItem[]; onDismiss: (id: number) => void }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[1100] flex flex-col items-end justify-end gap-3 px-4 py-6 sm:px-6">
      <AnimatePresence initial={false}>
        {items.map((item) => (
          <motion.article
            key={item.id}
            layout
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
            className={`pointer-events-auto w-full max-w-sm rounded-2xl px-4 py-3 shadow-xl backdrop-blur-sm ${
              variantStyles[item.variant ?? "info"]
            }`}
          >
            <div className="flex items-start gap-3">
              <span className={`mt-1 inline-flex h-2.5 w-2.5 shrink-0 rounded-full ${variantDot[item.variant ?? "info"]}`} />
              <div className="min-w-0 flex-1 space-y-1">
                {item.title ? <h4 className="text-sm font-semibold leading-tight">{item.title}</h4> : null}
                <p className="text-sm leading-relaxed text-gray-700/90">{item.message}</p>
                {item.action ? (
                  <button
                    onClick={() => {
                      item.action?.onClick();
                      onDismiss(item.id);
                    }}
                    className="text-xs font-semibold text-indigo-600 underline-offset-2 hover:underline"
                  >
                    {item.action.label}
                  </button>
                ) : null}
              </div>
              <button
                aria-label="Dismiss"
                onClick={() => onDismiss(item.id)}
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/50 text-sm font-semibold text-gray-500 transition hover:bg-white/80 hover:text-gray-700"
              >
                ×
              </button>
            </div>
          </motion.article>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
}

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    ({ title, message, variant = "info", duration = 4200, action }: NotifyOptions) => {
      const id = Date.now() + Math.floor(Math.random() * 1000);
      setItems((prev) => [...prev, { id, title, message, variant, action, createdAt: Date.now() }]);
      if (duration != null) {
        window.setTimeout(() => {
          dismiss(id);
        }, duration);
      }
      return id;
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      <NotificationLayer items={items} onDismiss={dismiss} />
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) {
    throw new Error("useNotifications must be used within NotificationProvider");
  }
  return ctx;
}
