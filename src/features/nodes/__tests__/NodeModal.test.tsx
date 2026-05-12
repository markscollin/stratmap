import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NodeModal } from '../NodeModal'
import type { Department, OrgNode } from '../../../types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const dept: Department = { id: 'eng', name: 'Engineering', colour: '#0EA5E9' }

const existingNode: OrgNode = {
  id: 'n1', name: 'Alice', title: 'CEO', departmentId: 'eng',
  managerId: null, status: 'active', employmentType: 'full-time', x: 0, y: 0,
}

function defaultProps(overrides: Partial<React.ComponentProps<typeof NodeModal>> = {}) {
  return {
    isOpen: true,
    onClose: vi.fn(),
    mode: 'add' as const,
    departments: [dept],
    allNodes: [],
    allEdges: [],
    onAdd: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  }
}

// ─── Closed state ─────────────────────────────────────────────────────────────

describe('closed state', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(<NodeModal {...defaultProps({ isOpen: false })} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// ─── Add mode ─────────────────────────────────────────────────────────────────

describe('add mode', () => {
  beforeEach(() => {
    // Suppress CSS custom property warnings in jsdom
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders the "Add node" heading', () => {
    render(<NodeModal {...defaultProps()} />)
    expect(screen.getByText('Add node')).toBeInTheDocument()
  })

  it('shows "Create node" on the submit button', () => {
    render(<NodeModal {...defaultProps()} />)
    expect(screen.getByText('Create node')).toBeInTheDocument()
  })

  it('shows validation errors when submitted with empty fields', () => {
    render(<NodeModal {...defaultProps()} />)
    fireEvent.click(screen.getByText('Create node'))
    expect(screen.getByText('Name is required')).toBeInTheDocument()
    expect(screen.getByText('Job title is required')).toBeInTheDocument()
  })

  it('does not call onAdd when required fields are empty', () => {
    const onAdd = vi.fn()
    render(<NodeModal {...defaultProps({ onAdd })} />)
    fireEvent.click(screen.getByText('Create node'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('calls onAdd with trimmed name and title when form is valid', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(<NodeModal {...defaultProps({ onAdd, onClose })} />)

    await user.type(screen.getByPlaceholderText(/Sarah Chen/), 'Bob Smith')
    await user.type(screen.getByPlaceholderText('e.g. Senior Engineer'), 'CTO')
    fireEvent.click(screen.getByText('Create node'))

    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bob Smith', title: 'CTO' }),
      ''
    )
    expect(onClose).toHaveBeenCalled()
  })

  it('does not show a Delete button', () => {
    render(<NodeModal {...defaultProps()} />)
    expect(screen.queryByText('Delete')).not.toBeInTheDocument()
  })

  it('calls onClose when backdrop is clicked', () => {
    const onClose = vi.fn()
    const { container } = render(<NodeModal {...defaultProps({ onClose })} />)
    // The outermost div is the backdrop overlay
    fireEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalled()
  })
})

// ─── Edit mode ────────────────────────────────────────────────────────────────

describe('edit mode', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('renders the "Edit role" heading', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    expect(screen.getByText('Edit role')).toBeInTheDocument()
  })

  it('pre-populates the name field', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    expect(screen.getByDisplayValue('Alice')).toBeInTheDocument()
  })

  it('pre-populates the job title field', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    expect(screen.getByDisplayValue('CEO')).toBeInTheDocument()
  })

  it('shows "Save changes" on the submit button', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    expect(screen.getByText('Save changes')).toBeInTheDocument()
  })

  it('calls onUpdate with the updated values when saved', async () => {
    const user = userEvent.setup()
    const onUpdate = vi.fn()
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode, onUpdate })} />)

    const nameInput = screen.getByDisplayValue('Alice')
    await user.clear(nameInput)
    await user.type(nameInput, 'Alice Smith')
    fireEvent.click(screen.getByText('Save changes'))

    expect(onUpdate).toHaveBeenCalledWith(
      'n1',
      expect.objectContaining({ name: 'Alice Smith' }),
      ''
    )
  })

  it('shows the Delete button', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('shows a confirmation prompt after clicking Delete', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    fireEvent.click(screen.getByText('Delete'))
    expect(screen.getByText('Are you sure?')).toBeInTheDocument()
    expect(screen.getByText('Confirm')).toBeInTheDocument()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
  })

  it('calls onDelete and onClose when Confirm is clicked', () => {
    const onDelete = vi.fn()
    const onClose = vi.fn()
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode, onDelete, onClose })} />)
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Confirm'))
    expect(onDelete).toHaveBeenCalledWith('n1')
    expect(onClose).toHaveBeenCalled()
  })

  it('restores normal state when Cancel is clicked after Delete', () => {
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode })} />)
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(screen.getByText('Cancel'))
    expect(screen.queryByText('Are you sure?')).not.toBeInTheDocument()
    expect(screen.getByText('Delete')).toBeInTheDocument()
  })

  it('excludes the node being edited from the Reports To options', () => {
    const otherNode: OrgNode = { ...existingNode, id: 'n2', name: 'Bob' }
    render(<NodeModal {...defaultProps({ mode: 'edit', node: existingNode, allNodes: [existingNode, otherNode] })} />)
    // Open the Reports To dropdown
    fireEvent.click(screen.getByText('None (root node)'))
    // Bob should be available as an option
    expect(screen.getByText('Bob')).toBeInTheDocument()
    // Alice (the node being edited) should not appear in the dropdown
    // Note: 'Alice' is in the name input value but not as DOM text content
    expect(screen.queryByText('Alice')).not.toBeInTheDocument()
  })
})
