import { describe, it, expect } from 'vitest'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import { sanitizeRichText } from '../../../../api/_lib/sanitizeHtml'

// R-37: what the editor writes must come back from the server's cleaning with the same meaning, or saving would quietly
// change people's job descriptions. Uses the real editor and its real StarterKit, so a TipTap upgrade that starts
// writing a new element or attribute fails here instead of in production.
const make = (content: string) => new Editor({ extensions: [StarterKit], content })

const DOCUMENTS = {
  headings: '<h2>Role</h2><h3>Scope</h3><p>Body</p>',
  marks: '<p><strong>b</strong> <em>i</em> <s>s</s> <u>u</u> <code>c</code></p>',
  lists: '<ul><li><p>a</p><ul><li><p>nested</p></li></ul></li><li><p>b</p></li></ul><ol start="4"><li><p>d</p></li></ol>',
  quote: '<blockquote><p>q</p></blockquote><hr><p>after</p>',
  code: '<pre><code class="language-python">print("x")</code></pre>',
  link: '<p><a href="https://example.com/jobs?id=1&amp;x=2">apply</a> or <a href="mailto:hr@example.com">mail</a></p>',
  breaks: '<p>one<br>two</p>',
  entities: '<p>a &lt; b &amp;&amp; c &gt; d "quoted" é 日本語</p>',
}

describe('TipTap output survives server-side cleaning', () => {
  for (const [name, html] of Object.entries(DOCUMENTS)) {
    it(name, () => {
      const written = make(html).getHTML()               // exactly what the browser sends
      const stored = sanitizeRichText(written)           // what the server keeps
      const reopened = make(stored).getHTML()            // what the editor shows next time
      expect(reopened).toBe(written)
      expect(make(stored).getJSON()).toEqual(make(written).getJSON())
    })
  }

  it('every element the editor writes for these documents is on the allow-list', () => {
    const tags = new Set<string>()
    for (const html of Object.values(DOCUMENTS)) {
      for (const m of make(html).getHTML().matchAll(/<([a-z0-9]+)[\s>/]/gi)) tags.add(m[1].toLowerCase())
    }
    const kept = new Set<string>()
    for (const html of Object.values(DOCUMENTS)) {
      for (const m of sanitizeRichText(make(html).getHTML()).matchAll(/<([a-z0-9]+)[\s>/]/gi)) kept.add(m[1].toLowerCase())
    }
    expect([...tags].filter(t => !kept.has(t))).toEqual([])
  })
})
