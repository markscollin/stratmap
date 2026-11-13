// The facts the Privacy Policy and Terms of Service need from the business owner (launch review R-04).
//
// FILL THESE IN. While any field is empty the legal pages keep their bracketed placeholders and show the
// "Template notice" banner, so an unfinished policy can never look finished. Once every field is filled, the
// placeholders and the banner disappear by themselves. `npm run check:legal` fails until that is so.
// The text is still a template until a lawyer has reviewed it (docs/LAUNCH_REVIEW_BACKLOG.md, O-05).
export interface LegalDetails {
  /** Full legal name of the company that runs StratMap, e.g. "Acme StratMap Ltd". */
  companyName: string
  /** Registered office or postal address. */
  address: string
  /** Where privacy and data-rights requests go. */
  privacyEmail: string
  /** Where questions about the Terms go. */
  legalEmail: string
  /** Law and courts that govern the Terms, e.g. "England and Wales". */
  governingLaw: string
  /** One or two sentences on refunds, e.g. "We refund the unused part of an annual plan within 14 days of purchase." */
  refundPolicy: string
  /** Shown as "Last updated". Change it whenever the text changes. */
  lastUpdated: string
}

export const LEGAL: LegalDetails = {
  companyName: '',
  address: '',
  privacyEmail: '',
  legalEmail: '',
  governingLaw: '',
  refundPolicy: '',
  lastUpdated: '13 November 2026',
}

/** The fields that are still empty. */
export function missingLegalDetails(details: LegalDetails = LEGAL): (keyof LegalDetails)[] {
  return (Object.keys(details) as (keyof LegalDetails)[]).filter(k => !details[k].trim())
}
