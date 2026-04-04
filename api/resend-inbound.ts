/**
 * Alias for Resend webhooks if `/api/incoming-email` is intercepted by static/SPA routing.
 * Same handler and config as incoming-email.ts.
 */
export { default, config } from "./incoming-email.js"
