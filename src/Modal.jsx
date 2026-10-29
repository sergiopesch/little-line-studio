import { useLocale } from "./i18n.jsx";
import { useEffect, useId, useRef } from "react";
import { XIcon } from "@phosphor-icons/react";

export function Modal({ title, onClose, children, className = "" }) {
  const { t } = useLocale();
  const ref = useRef(null);
  const titleId = useId();
  const openerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    // Strict Mode can reopen before the browser finishes restoring focus.
    // Retain the original opener instead of capturing an element in the dialog.
    const previous = openerRef.current ??= document.activeElement;
    const dialog = ref.current;
    dialog.showModal();
    dialog.querySelector("h2")?.focus();
    const cancel = (event) => {
      event.preventDefault();
      closeRef.current?.();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      dialog.close();
      if (previous?.isConnected) previous.focus?.();
    };
  }, []);
  useEffect(() => {
    ref.current.scrollTop = 0;
  }, [title]);
  return (
    <dialog
      ref={ref}
      className={`modal ${className}`}
      aria-labelledby={titleId}
    >
      <div className="modal-heading">
        <h2 id={titleId} tabIndex={-1}>
          {title}
        </h2>
        {onClose && (
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={t("Close dialog")}
          >
            <XIcon size={24} />
          </button>
        )}
      </div>
      {children}
    </dialog>
  );
}
