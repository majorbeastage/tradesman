/** Fail a promise if it does not settle in time — used so a hung Data API cannot freeze the shell. */
export async function withTimeout<T>(work: Promise<T>, ms: number, message = "Request timed out"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), ms)
      }),
    ])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
