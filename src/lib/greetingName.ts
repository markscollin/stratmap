/** The first word of a person's name for the welcome toast; "there" when the sign-in provider only gave an email or an id (R-66). */
export function greetingName(name: string | undefined | null): string {
  const first = (name ?? '').trim().split(/\s+/)[0] ?? ''
  if (!first || first.includes('@') || /^(user_|dev-)/.test(first)) return 'there'
  return first
}
