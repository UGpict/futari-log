import { FutariLogo } from "@/components/futari-logo";
import styles from "./auth-brand.module.css";

export function AuthBrand({ className }: { className?: string }) {
  return <FutariLogo layout="vertical" className={[styles.logo, className].filter(Boolean).join(" ")} />;
}
