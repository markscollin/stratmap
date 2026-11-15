/** The shape of the share codes the server hands out and accepts (api/share/[code].ts). Anything else, such as the old links that carried the whole chart in the URL, is not a share link (R-25). */
export function isShareCode(token: string): boolean {
  return /^[A-Za-z0-9_-]{1,32}$/.test(token)
}
