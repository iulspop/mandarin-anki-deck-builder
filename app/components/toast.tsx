import { useEffect } from "react";

export type ToastData = {
  type: "pending" | "success" | "error";
  message: string;
};

export function Toast({
  type,
  message,
  onDismiss,
}: ToastData & { onDismiss: () => void }) {
  useEffect(() => {
    if (type === "success") {
      const timer = setTimeout(onDismiss, 4000);
      return () => clearTimeout(timer);
    }
  }, [type, onDismiss]);

  return (
    <div className={`toast toast-${type}`}>
      <span className="toast-icon">
        {type === "pending" && <span className="toast-spinner" />}
        {type === "success" && "\u2713"}
        {type === "error" && "\u2717"}
      </span>
      <span className="toast-message">{message}</span>
      {type !== "pending" && (
        <button className="toast-close" onClick={onDismiss} type="button">
          &times;
        </button>
      )}
    </div>
  );
}
