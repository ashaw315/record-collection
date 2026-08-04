/**
 * Next.js runs this once per server process at startup. Validating here is what
 * makes env validation fail-fast (SPEC.md §2): a misconfigured deploy dies on
 * boot with a message naming the missing variable, rather than on the first
 * request that happens to touch the offending value.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { getEnv } = await import('./env');
    getEnv();
  }
}
