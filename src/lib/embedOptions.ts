import type { OrgNode } from '../types'

// Options a chart's embed code can carry in its address (`/embed/<code>?theme=light&names=hide`). Pure, so the
// share panel (which writes them) and the embed page (which reads them) cannot disagree.
//   theme=light|dark  show the chart in that theme whatever the visitor's StratMap theme is (no value = the visitor's own, dark by default)
//   names=hide        show roles by title only: no person's name, initials or photo
// Unknown values are ignored, so an old or hand-edited embed can never break the page.
// "Hide names" is a display option for the page that embeds the chart. The public share link still holds the names, so it is not a privacy control.

export interface EmbedOptions {
  theme: 'light' | 'dark' | null
  hideNames: boolean
}

export const DEFAULT_EMBED_OPTIONS: EmbedOptions = { theme: null, hideNames: false }

export function parseEmbedOptions(search: string): EmbedOptions {
  const q = new URLSearchParams(search)
  const theme = q.get('theme')
  return {
    theme: theme === 'light' || theme === 'dark' ? theme : null,
    hideNames: q.get('names') === 'hide',
  }
}

/** The embed address for a share code; only options that differ from the default are written. */
export function embedUrl(origin: string, code: string, options: EmbedOptions = DEFAULT_EMBED_OPTIONS): string {
  const q = new URLSearchParams()
  if (options.theme) q.set('theme', options.theme)
  if (options.hideNames) q.set('names', 'hide')
  const qs = q.toString()
  return `${origin}/embed/${code}${qs ? `?${qs}` : ''}`
}

export function embedSnippet(origin: string, code: string, options: EmbedOptions = DEFAULT_EMBED_OPTIONS): string {
  return `<iframe src="${embedUrl(origin, code, options)}" title="Org chart" width="100%" height="600" style="border:0" loading="lazy"></iframe>`
}

/** Roles as the embed should draw them: with names hidden the role title stands in for the name and the photo is dropped. */
export function applyEmbedOptions(nodes: OrgNode[], options: EmbedOptions): OrgNode[] {
  if (!options.hideNames) return nodes
  return nodes.map(n => ({ ...n, name: n.title, avatarUrl: undefined }))
}
