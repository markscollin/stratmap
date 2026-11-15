// R-37: JD and template HTML is cleaned on write, so it is safe wherever it is rendered next.
import { describe, it, expect } from 'vitest'
import { sanitizeRichText as clean } from '../_lib/sanitizeHtml'
import { JDUpdate, TemplateCreate } from '../_lib/schemas'

describe('sanitizeRichText', () => {
  it('leaves everything the editor produces exactly as it is', () => {
    const samples = [
      '<p>Plain paragraph</p>',
      '<h2>Heading</h2><h3>Sub</h3>',
      '<p><strong>bold</strong> <em>italic</em> <s>struck</s> <u>under</u> <code>code</code></p>',
      '<ul><li><p>one</p></li><li><p>two</p></li></ul>',
      '<ol start="3"><li><p>three</p></li></ol>',
      '<blockquote><p>quote</p></blockquote>',
      '<pre><code class="language-js">const a = 1</code></pre>',
      '<p>line<br />break</p><hr />', // the library writes void elements self-closed; TipTap reads both the same way
      '<p>5 &lt; 6 &amp; 7 &gt; 2</p>',
      '',
    ]
    for (const html of samples) expect(clean(html)).toBe(html)
  })

  it('removes scripts and their content', () => {
    expect(clean('<p>hi</p><script>alert(1)</script>')).toBe('<p>hi</p>')
    expect(clean('<style>body{display:none}</style><p>x</p>')).toBe('<p>x</p>')
    expect(clean('<p>a<script src="https://evil.test/x.js"></script>b</p>')).toBe('<p>ab</p>')
  })

  it('removes event handlers and unknown attributes, keeping the element', () => {
    expect(clean('<p onclick="alert(1)" style="color:red" id="x" data-x="1">hi</p>')).toBe('<p>hi</p>')
    expect(clean('<img src=x onerror=alert(1)>')).toBe('')
    expect(clean('<h2 onmouseover="alert(1)">t</h2>')).toBe('<h2>t</h2>')
  })

  it('drops embedding and form elements, keeping any text', () => {
    for (const tag of ['iframe', 'object', 'embed', 'form', 'input', 'button', 'svg', 'math', 'video', 'audio', 'link', 'meta', 'base']) {
      const out = clean(`<${tag} src="https://evil.test" onload="alert(1)">text</${tag}>`)
      expect(out).not.toMatch(/<(iframe|object|embed|form|input|button|svg|math|video|audio|link|meta|base)/i)
      expect(out).not.toMatch(/onload|evil/)
    }
    expect(clean('<svg onload=alert(1)><circle/></svg>')).toBe('')
  })

  it('allows only web and mail links, and always adds rel', () => {
    expect(clean('<a href="https://example.com/a?b=1">x</a>')).toBe('<a href="https://example.com/a?b=1" rel="noopener noreferrer nofollow">x</a>')
    expect(clean('<a href="mailto:a@b.co">m</a>')).toContain('href="mailto:a@b.co"')
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', '//evil.test/x']) {
      const out = clean(`<a href="${bad}">click</a>`)
      expect(out, bad).not.toMatch(/href/i)
      expect(out).toContain('click')
    }
  })

  it('a link that opens a new tab gets rel so it cannot reach back', () => {
    expect(clean('<a href="https://example.com" target="_blank">x</a>')).toBe('<a href="https://example.com" rel="noopener noreferrer nofollow" target="_blank">x</a>')
    expect(clean('<a href="https://example.com" target="evil">x</a>')).not.toMatch(/target/)
  })

  it('keeps only a language class on a code block', () => {
    expect(clean('<pre><code class="language-ts">x</code></pre>')).toContain('class="language-ts"')
    expect(clean('<pre><code class="admin-only language-ts">x</code></pre>')).not.toMatch(/admin-only/)
    expect(clean('<p class="language-ts">x</p>')).toBe('<p>x</p>')
  })

  it('handles broken and nested markup without throwing or leaking', () => {
    for (const html of ['<p><b>unclosed', '<<script>script>alert(1)<</script>/script>', '<p ="x">y</p>', '<scr<script>ipt>alert(1)</scr</script>ipt>', '<noscript><p title="</noscript><img src=x onerror=alert(1)>">']) {
      const out = clean(html)
      expect(out).not.toMatch(/<script|onerror|<img/i)
    }
  })

  it('is stable: cleaning twice changes nothing more', () => {
    const dirty = '<p onclick=x>a</p><a href="javascript:x">b</a><script>c</script><ul><li>d</li></ul>'
    expect(clean(clean(dirty))).toBe(clean(dirty))
  })
})

describe('the request schemas clean job-description and template text', () => {
  const evil = '<p>Responsibilities</p><img src=x onerror=alert(1)><script>steal()</script><a href="javascript:alert(1)">apply</a>'

  it('JD fields', () => {
    const body = JDUpdate.parse({ responsibilities: evil, requirements: evil })
    for (const field of [body.responsibilities, body.requirements]) {
      expect(field).toBe('<p>Responsibilities</p><a rel="noopener noreferrer nofollow">apply</a>') // the link lost its javascript: target; the text stays
    }
  })

  it('template fields', () => {
    const body = TemplateCreate.parse({ name: 'T', title: 'Eng', departmentId: '', tags: [], responsibilities: evil, requirements: evil })
    expect(body.responsibilities).toBe('<p>Responsibilities</p><a rel="noopener noreferrer nofollow">apply</a>')
    expect(body.requirements).toBe(body.responsibilities)
  })

  it('a field left out stays left out', () => {
    expect(JDUpdate.parse({}).responsibilities).toBeUndefined()
  })
})
