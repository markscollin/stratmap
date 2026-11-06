// Dev-bypass identities for e2e tests (roadmap 3.3). Only meaningful when
// IS_DEV_BYPASS is true; the server rejects the header on preview/production.
//
// With no identity set, dev bypass is the classic single `u-dev` user in `ws-dev`.
// With one set (e.g. by Playwright), the app behaves like a real signed-in user:
// no workspace → onboarding, invites are matched by `<id>@e2e.test`, and so on.
const KEY = 'stratmap_dev_user'

export function getDevIdentity(): string | null {
  try {
    const v = localStorage.getItem(KEY)
    return v && /^[a-z0-9][a-z0-9-]{0,39}$/i.test(v) ? v.toLowerCase() : null
  } catch {
    return null
  }
}

/** Value for the X-Dev-User header: the identity slug, or 'true' for plain `u-dev`. */
export function devUserHeader(): string {
  return getDevIdentity() ?? 'true'
}

export function devIdentityEmail(id: string): string {
  return `${id}@e2e.test`
}
