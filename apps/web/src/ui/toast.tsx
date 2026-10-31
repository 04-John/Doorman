// Toast: rises from the bottom, auto-hides after 3.2s.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { ICON, Icon } from "./status";

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const show = useCallback((text: string) => {
    setMessage(text);
    setVisible(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setVisible(false), 3200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div
        role="status"
        aria-live="polite"
        style={{
          position: "fixed",
          left: "50%",
          bottom: 28,
          transform: `translate(-50%, ${visible ? "0" : "16px"})`,
          opacity: visible ? 1 : 0,
          transition: "all .3s cubic-bezier(.2,.8,.2,1)",
          zIndex: 30,
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "12px 18px",
          borderRadius: 12,
          background: "#15171C",
          color: "#FFFFFF",
          fontSize: 14.5,
          fontWeight: 500,
          boxShadow: "0 12px 32px rgba(21,23,28,.28)",
          pointerEvents: "none",
          maxWidth: "calc(100vw - 32px)",
        }}
      >
        <Icon d={ICON.check} color="#7BD3A0" size={16} />
        {message}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
