import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from "react";
import styles from "./button.module.css";

type Appearance = {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "regular" | "compact";
  fullWidth?: boolean;
  className?: string;
};

function classes({ variant = "primary", size = "regular", fullWidth, className }: Appearance) {
  return [styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className].filter(Boolean).join(" ");
}

export function Button({ variant, size, fullWidth, className, type = "button", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & Appearance) {
  return <button {...props} type={type} data-ui="button" className={classes({ variant, size, fullWidth, className })} />;
}

export function ButtonLink({ variant, size, fullWidth, className, ...props }: ComponentProps<typeof Link> & Appearance) {
  return <Link {...props} data-ui="button" className={classes({ variant, size, fullWidth, className })} />;
}

export function IconButton({ label, children, className, type = "button", ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> & { label: string; children: ReactNode }) {
  return <button {...props} type={type} aria-label={label} title={label} data-ui="icon-button" className={[styles.iconButton, className].filter(Boolean).join(" ")}>{children}</button>;
}
