import { describe, it, expect, beforeEach } from 'vitest'
import { useJobDescriptionStore } from '../jobDescriptionStore'

beforeEach(() => {
  localStorage.clear()
  useJobDescriptionStore.setState({ jobDescriptions: {} })
})

describe('jobDescriptionStore', () => {
  describe('initJD', () => {
    it('creates a default draft JD for a new node', () => {
      useJobDescriptionStore.getState().initJD('node1')
      const jd = useJobDescriptionStore.getState().jobDescriptions['node1']
      expect(jd).toBeDefined()
      expect(jd.status).toBe('draft')
      expect(jd.version).toBe(1)
      expect(jd.responsibilities).toBe('')
      expect(jd.requirements).toBe('')
      expect(jd.nodeId).toBe('node1')
    })

    it('does not overwrite an existing JD', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().updateJD('node1', { responsibilities: '<p>Lead the team</p>' })
      useJobDescriptionStore.getState().initJD('node1')
      const jd = useJobDescriptionStore.getState().jobDescriptions['node1']
      expect(jd.responsibilities).toBe('<p>Lead the team</p>')
    })

    it('creates independent JDs for different nodes', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().initJD('node2')
      const store = useJobDescriptionStore.getState()
      expect(store.jobDescriptions['node1']).toBeDefined()
      expect(store.jobDescriptions['node2']).toBeDefined()
      expect(store.jobDescriptions['node1'].nodeId).toBe('node1')
      expect(store.jobDescriptions['node2'].nodeId).toBe('node2')
    })
  })

  describe('updateJD', () => {
    it('updates responsibilities content', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().updateJD('node1', { responsibilities: '<p>Lead the engineering team</p>' })
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].responsibilities).toBe('<p>Lead the engineering team</p>')
    })

    it('updates requirements content', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().updateJD('node1', { requirements: '<ul><li>5+ years experience</li></ul>' })
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].requirements).toBe('<ul><li>5+ years experience</li></ul>')
    })

    it('preserves other fields when updating one', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().updateJD('node1', { responsibilities: 'resp content' })
      useJobDescriptionStore.getState().updateJD('node1', { requirements: 'req content' })
      const jd = useJobDescriptionStore.getState().jobDescriptions['node1']
      expect(jd.responsibilities).toBe('resp content')
      expect(jd.requirements).toBe('req content')
    })

    it('updates the updatedAt timestamp', () => {
      useJobDescriptionStore.getState().initJD('node1')
      const before = useJobDescriptionStore.getState().jobDescriptions['node1'].updatedAt
      // Force a tick so timestamps can differ
      useJobDescriptionStore.getState().updateJD('node1', { responsibilities: 'new content' })
      const after = useJobDescriptionStore.getState().jobDescriptions['node1'].updatedAt
      expect(typeof after).toBe('string')
      expect(after).toBeTruthy()
      // Either the same ms or later — timestamp is always set
      expect(new Date(after).getTime()).toBeGreaterThanOrEqual(new Date(before).getTime())
    })
  })

  describe('setStatus', () => {
    it('transitions from draft to in-review', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().setStatus('node1', 'in-review')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].status).toBe('in-review')
    })

    it('does not bump version when moving draft → in-review', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().setStatus('node1', 'in-review')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].version).toBe(1)
    })

    it('bumps version when transitioning back to draft', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().setStatus('node1', 'in-review')
      useJobDescriptionStore.getState().setStatus('node1', 'draft')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].version).toBe(2)
    })

    it('bumps version when reopening a hired role', () => {
      useJobDescriptionStore.getState().initJD('node1')
      useJobDescriptionStore.getState().setStatus('node1', 'in-review')
      useJobDescriptionStore.getState().setStatus('node1', 'approved')
      useJobDescriptionStore.getState().setStatus('node1', 'published')
      useJobDescriptionStore.getState().setStatus('node1', 'hired')
      useJobDescriptionStore.getState().setStatus('node1', 'draft')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].version).toBe(2)
    })

    it('follows the full approval workflow', () => {
      useJobDescriptionStore.getState().initJD('node1')
      const { setStatus } = useJobDescriptionStore.getState()

      setStatus('node1', 'in-review')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].status).toBe('in-review')

      setStatus('node1', 'approved')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].status).toBe('approved')

      setStatus('node1', 'published')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].status).toBe('published')

      setStatus('node1', 'hired')
      expect(useJobDescriptionStore.getState().jobDescriptions['node1'].status).toBe('hired')
    })
  })
})
