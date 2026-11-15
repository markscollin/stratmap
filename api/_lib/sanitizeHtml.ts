// Job-description and template text is stored as HTML (from the TipTap editor). It is only ever rendered by TipTap today,
// whose schema drops anything it does not know, so stored markup could not run. That is a fact about one renderer, not
// about the data, so the server cleans it on every write (R-37): the day it is shown anywhere else (an email, a PDF, a
// share page, an export) it is already safe.
//
// The allow-list is what StarterKit (TipTap 3) can produce, and nothing more. Text of a removed tag is kept; the content
// of <script>, <style> and the like is dropped with the tag. Rows written before this existed are not rewritten.
import sanitizeHtml from 'sanitize-html'

const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'strong', 'b', 'em', 'i', 's', 'u', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
    ol: ['start'],
    code: ['class'],
  },
  // Only a language label on a code block (TipTap writes class="language-js"); no other class, so nothing can hook a stylesheet.
  allowedClasses: { code: [/^language-[a-z0-9_+-]{1,30}$/i] },
  // Links: web and mail only. No javascript:, data:, vbscript:, file: or relative/protocol-relative tricks.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  allowProtocolRelative: false,
  // A link opens a new page without handing it a reference to ours.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName,
      attribs: {
        ...(attribs.href ? { href: attribs.href } : {}),
        rel: 'noopener noreferrer nofollow',
        ...(attribs.target === '_blank' ? { target: '_blank' } : {}),
      },
    }),
  },
  disallowedTagsMode: 'discard',
}

export function sanitizeRichText(html: string): string {
  return sanitizeHtml(html, OPTIONS)
}
