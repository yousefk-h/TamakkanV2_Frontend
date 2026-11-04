"use client";

import { createContext, useCallback, useContext, useEffect, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import { useDialogAutoOpen } from "@/lib/hooks/useDialogAutoOpen";
import { useI18n } from "@/lib/i18n/LocaleProvider";

const DialogCloseContext = createContext<() => void>(() => {});

/** Lets any descendant of `Dialog` trigger the same close path as Escape or a
 * backdrop click, without needing the dialog's own ref. */
export function useDialogClose(): () => void {
  return useContext(DialogCloseContext);
}

export function Dialog({
  onClose,
  dismissOnBackdropClick = false,
  className = "",
  ariaLabel,
  children,
}: {
  onClose: () => void;
  dismissOnBackdropClick?: boolean;
  className?: string;
  ariaLabel: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useDialogAutoOpen(dialogRef, onClose, dismissOnBackdropClick);
  useEffect(() => {
    const viewport = window.visualViewport;
    const update = () => {
      dialogRef.current?.style.setProperty("--dialog-available-height", `${viewport?.height ?? window.innerHeight}px`);
      dialogRef.current?.style.setProperty("--dialog-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  // Calls `onClose` directly rather than leaning on the native `close`
  // event to get there - that event is only queued by some browsers, not
  // guaranteed synchronous or even guaranteed to fire promptly, and this
  // component has no way to know which. Without this, closing via this
  // button never told the parent, so its `builderTarget`-style state never
  // reset - the dialog stayed mounted-but-closed, and no later "open a
  // different one" click could ever remount/reopen it. `onClose` is
  // idempotent (a plain state setter), so a same-tick native `close` event
  // (Escape) calling it again right after is harmless.
  const requestClose = useCallback(() => {
    dialogRef.current?.close();
    onClose();
  }, [onClose]);

  return (
    // Auto inline margins center between the safe-area edges. Shared CSS
    // centers vertically inside the visual viewport, including when a
    // mobile keyboard reduces or offsets it.
    <dialog ref={dialogRef} aria-label={ariaLabel} className={`responsive-dialog m-auto ${className}`}>
      <DialogCloseContext.Provider value={requestClose}>{children}</DialogCloseContext.Provider>
    </dialog>
  );
}

export function DialogCloseButton({ className = "absolute end-3 top-2 text-muted" }: { className?: string }) {
  const { t } = useI18n();
  const requestClose = useDialogClose();
  return (
    <button type="button" onClick={requestClose} aria-label={t("common.close")} className={`inline-grid min-h-11 min-w-11 shrink-0 place-items-center ${className}`}>
      <X className="size-6" aria-hidden="true" />
    </button>
  );
}
