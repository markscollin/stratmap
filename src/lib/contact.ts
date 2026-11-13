/** Where people can reach us for help with a payment. Set `VITE_SUPPORT_EMAIL` at build time; until it is set no address is shown. */
export const SUPPORT_EMAIL: string | null = (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() || null
