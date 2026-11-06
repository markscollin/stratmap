// CSV writing that is safe to open in Excel or Google Sheets (roadmap 2.2). The pure text functions live in
// csvText.ts (no browser types, so the API can use them too); this file adds the browser download.
export * from './csvText'

/** Triggers a browser download of text content. */
export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type: mime }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
