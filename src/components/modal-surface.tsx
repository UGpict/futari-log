"use client";

import { useRef, type ComponentProps, type ReactNode } from "react";
import { useVisibleModalInput } from "@/client/hooks/use-visible-modal-input";
import { Dialog, Modal, ModalOverlay } from "react-aria-components/Modal";
import styles from "./modal-surface.module.css";

// Mount inside the portal: the dialog ref must exist when the observer starts.
function VisibleDialog(props: ComponentProps<typeof Dialog>) {
  const dialogRef = useRef<HTMLElement>(null);
  useVisibleModalInput(dialogRef);
  return <Dialog {...props} ref={dialogRef} />;
}

/** One owner for focus containment, focus restoration, iOS scroll locking and viewport sizing. */
export function ModalSurface({ children, labelledBy, describedBy, onClose, className, contentClassName, centered = false, alert = false }: {
  children: ReactNode;
  labelledBy: string;
  describedBy?: string;
  onClose: () => void;
  className?: string;
  contentClassName?: string;
  centered?: boolean;
  alert?: boolean;
}) {
  return <ModalOverlay isOpen isDismissable onOpenChange={(open) => { if (!open) onClose(); }}
    className={`${styles.overlay} ${centered ? styles.centered : ""}`}>
    <Modal className={[styles.surface, className].filter(Boolean).join(" ")}>
      <VisibleDialog role={alert ? "alertdialog" : "dialog"} aria-labelledby={labelledBy} aria-describedby={describedBy}
        className={[styles.content, contentClassName].filter(Boolean).join(" ")}>
        {children}
      </VisibleDialog>
    </Modal>
  </ModalOverlay>;
}
