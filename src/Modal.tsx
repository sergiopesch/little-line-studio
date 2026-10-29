import type { ReactNode } from "react";
import { useLocale } from "./i18n.jsx";
import { useEffect, useId, useLayoutEffect, useRef } from "react";
import { XIcon } from "@phosphor-icons/react";

export function Modal({ title, onClose, children, className = "" }: {
  title: string; onClose?: () => void; children: ReactNode; className?: string;
}) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const openerRef = useRef<Element | null>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    // Strict Mode can reopen before the browser finishes restoring focus.
    // Retain the original opener instead of capturing an element in the dialog.
    openerRef.current ??= document.activeElement;
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    dialog.querySelector("h2")?.focus();
    const cancel = (event: Event) => {
      event.preventDefault();
      closeRef.current?.();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      // Close before React removes the node. WebKit can otherwise retain the
      // modal's inert focus state and reject focus on the next page heading.
      dialog.close();
    };
  }, []);
  useEffect(() => () => {
    // Lesson controls become enabled during the closing render. Restore only
    // after that commit, and never to an opener removed by page navigation.
    const previous = openerRef.current;
    if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
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
