/**
 * Compose an optional caller AbortSignal with a timeout.
 * A passed caller signal must not disable the timeout.
 */
export function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}
