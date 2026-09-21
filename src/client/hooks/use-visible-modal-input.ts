"use client";

import { useEffect, type RefObject } from "react";

/** Repair clipping after the keyboard/layout resizes, without moving the page.
 * React Aria still owns focus and scroll locking. Never center an already visible field.
 */
export function useVisibleModalInput(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    let frame = 0;
    let field: HTMLElement | null = null;
    const viewport = window.visualViewport;

    const reveal = () => {
      if (!field?.isConnected || document.activeElement !== field) return;
      // Pinch zoom belongs to the user, not keyboard avoidance.
      if (viewport && Math.abs(viewport.scale - 1) > 0.05) return;
      for (let parent = field.parentElement; parent; parent = parent.parentElement) {
        if (parent === document.body || parent === document.documentElement) break;
        if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY) && parent.scrollHeight > parent.clientHeight) {
          const bounds = parent.getBoundingClientRect();
          const dialogBounds = dialog.getBoundingClientRect();
          const top = Math.max(bounds.top + parent.clientTop, dialogBounds.top, viewport?.offsetTop ?? 0) + 12;
          const bottom = Math.min(bounds.top + parent.clientTop + parent.clientHeight, dialogBounds.bottom,
            (viewport?.offsetTop ?? 0) + (viewport?.height ?? window.innerHeight)) - 12;
          const rect = field.getBoundingClientRect();
          if (bottom > top) {
            // For a field taller than the available area, show its start rather than oscillating.
            const delta = rect.height > bottom - top || rect.top < top
              ? rect.top - top
              : Math.max(0, rect.bottom - bottom);
            if (Math.abs(delta) > 1) parent.scrollTo({ top: parent.scrollTop + delta, behavior: "instant" });
          }
        }
        if (parent === dialog) break;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      // Read after React Aria's viewport state and the container queries have laid out.
      frame = requestAnimationFrame(() => { frame = requestAnimationFrame(reveal); });
    };
    const observer = new ResizeObserver(schedule);
    const trackFocus = () => {
      observer.disconnect();
      const active = document.activeElement;
      field = active instanceof HTMLElement && dialog.contains(active) &&
        active.matches("input:not([type=checkbox]):not([type=radio]), textarea, select, [contenteditable=true]") ? active : null;
      if (!field) { cancelAnimationFrame(frame); return; }
      observer.observe(field);
      for (let parent = field.parentElement; parent; parent = parent.parentElement) {
        observer.observe(parent);
        if (parent === dialog) break;
      }
      schedule();
    };
    dialog.addEventListener("focusin", trackFocus);
    viewport?.addEventListener("resize", schedule);
    trackFocus();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      dialog.removeEventListener("focusin", trackFocus);
      viewport?.removeEventListener("resize", schedule);
    };
  }, [ref]);
}
