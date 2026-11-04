"use client";

import { useEffect, type RefObject } from "react";

/** Wires a native `<dialog>` to open on mount and call `onClose` when it's
 * dismissed by any means (Escape, backdrop click, or an explicit
 * `dialog.close()` from the caller).
 *
 * Native `<dialog>` instead of a hand-rolled backdrop + card gives focus
 * trapping and Escape-to-close for free. `dismissOnBackdropClick` is wired up
 * imperatively (a real DOM listener, not a JSX `onClick`) because a `<dialog>`
 * has no real element for its `::backdrop` - "click outside the card" is
 * detected the usual way, by checking whether the click's coordinates land
 * outside the dialog's own rendered box. This stays a mouse-only convenience
 * layered on top of Escape (already free via `showModal()`), never the only
 * way to dismiss.
 */
export function useDialogAutoOpen(
  ref: RefObject<HTMLDialogElement | null>,
  onClose: () => void,
  dismissOnBackdropClick = false,
) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    // The only real safety net for Escape, which has no JSX-reachable
    // equivalent - every other close path also calls `onClose` directly at
    // its own call site, since a `close` event from `.close()` is queued by
    // the browser rather than guaranteed synchronous, and calling an
    // idempotent state setter like `onClose` twice is harmless.
    const handleClose = () => onClose();
    dialog.addEventListener("close", handleClose);

    const handleBackdropClick = (e: MouseEvent) => {
      const rect = dialog.getBoundingClientRect();
      const inside = e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      if (!inside) {
        dialog.close();
        onClose();
      }
    };
    if (dismissOnBackdropClick) dialog.addEventListener("click", handleBackdropClick);

    return () => {
      document.documentElement.style.overflow = previousOverflow;
      dialog.removeEventListener("close", handleClose);
      if (dismissOnBackdropClick) dialog.removeEventListener("click", handleBackdropClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
