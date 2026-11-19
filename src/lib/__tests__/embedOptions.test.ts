import { describe, it, expect } from 'vitest'
import { parseEmbedOptions, embedUrl, embedSnippet, applyEmbedOptions, DEFAULT_EMBED_OPTIONS } from '../embedOptions'
import type { OrgNode } from '../../types'

const node = (o: Partial<OrgNode> = {}): OrgNode => ({
  id: 'n1', name: 'Ada Lovelace', title: 'CTO', departmentId: 'd1', status: 'active', x: 0, y: 0, avatarUrl: 'https://img/ada.png', ...o,
} as OrgNode)

describe('parseEmbedOptions', () => {
  it('reads theme and names', () => {
    expect(parseEmbedOptions('?theme=light&names=hide')).toEqual({ theme: 'light', hideNames: true })
    expect(parseEmbedOptions('theme=dark')).toEqual({ theme: 'dark', hideNames: false })
  })
  it('ignores anything else', () => {
    expect(parseEmbedOptions('')).toEqual(DEFAULT_EMBED_OPTIONS)
    expect(parseEmbedOptions('?theme=neon&names=1&x=2')).toEqual(DEFAULT_EMBED_OPTIONS)
  })
})

describe('embedUrl / embedSnippet', () => {
  it('writes only non-default options, and round-trips through the parser', () => {
    expect(embedUrl('https://app.test', 'abc')).toBe('https://app.test/embed/abc')
    const url = embedUrl('https://app.test', 'abc', { theme: 'light', hideNames: true })
    expect(url).toBe('https://app.test/embed/abc?theme=light&names=hide')
    expect(parseEmbedOptions(new URL(url).search)).toEqual({ theme: 'light', hideNames: true })
  })
  it('the snippet carries the address', () => {
    expect(embedSnippet('https://app.test', 'abc', { theme: 'dark', hideNames: false })).toContain('src="https://app.test/embed/abc?theme=dark"')
  })
})

describe('applyEmbedOptions', () => {
  it('leaves roles alone by default', () => {
    const nodes = [node()]
    expect(applyEmbedOptions(nodes, DEFAULT_EMBED_OPTIONS)).toBe(nodes)
  })
  it('hides names and photos, keeping everything else', () => {
    const [out] = applyEmbedOptions([node()], { theme: null, hideNames: true })
    expect(out.name).toBe('CTO')
    expect(out.avatarUrl).toBeUndefined()
    expect(out.id).toBe('n1')
    expect(out.departmentId).toBe('d1')
    expect(JSON.stringify(out)).not.toContain('Ada')
  })
})
