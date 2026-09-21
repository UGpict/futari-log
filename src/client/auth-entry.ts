const AUTH_ENTRY_KEY = "futarilog:auth-entry";

export type AuthEntry = "guest" | "account";

export function readAuthEntry(): AuthEntry | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(AUTH_ENTRY_KEY);
  return value === "guest" || value === "account" ? value : null;
}

export function rememberAuthEntry(entry: AuthEntry) {
  window.localStorage.setItem(AUTH_ENTRY_KEY, entry);
  window.dispatchEvent(new Event("futarilog:auth-entry-change"));
}

export function forgetAuthEntry() {
  window.localStorage.removeItem(AUTH_ENTRY_KEY);
  window.dispatchEvent(new Event("futarilog:auth-entry-change"));
}
