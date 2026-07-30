/**
 * Bound a promise so a stalled backend degrades instead of hanging the UI forever.
 * The underlying work is not cancelled — it is just no longer awaited.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      resolve(fallback)
    }, ms)
    void promise.then(
      (value) => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(fallback)
      },
    )
  })
}

/** Resolves true when the work finished in time, false when it timed out or threw. */
export function settledWithin(promise: Promise<unknown>, ms: number): Promise<boolean> {
  return withTimeout(
    promise.then(() => true),
    ms,
    false,
  )
}
