import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { useCanvasSave } from '../canvas/canvasSync'
import { Bold, Italic, List, ListOrdered, Heading2, Heading3 } from 'lucide-react'

interface JDEditorProps {
  content: string
  onSave: (html: string) => void
  editable?: boolean
  placeholder?: string
}

// 'typing': text is waiting for the 1 s pause. 'sent': handed to the save queue. What the label says comes from the queue itself
// (useCanvasSave), so "Saved" appears only once the server has the text and "Couldn't save" when it refused (R-11).
type SaveState = 'idle' | 'typing' | 'sent'

export function JDEditor({ content, onSave, editable = true, placeholder = 'Start writing…' }: JDEditorProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const queuePending = useCanvasSave(s => s.pending)
  const queueFailed = useCanvasSave(s => s.failure !== null)
  // Text typed but not yet sent, and the latest onSave, so a flush (unmount, role switch, tab hidden) sends the right thing.
  const unsentHtml = useRef<string | null>(null)
  const onSaveRef = useRef(onSave)
  useEffect(() => { onSaveRef.current = onSave })

  const flush = () => {
    clearTimeout(saveTimer.current)
    if (unsentHtml.current === null) return
    const html = unsentHtml.current
    unsentHtml.current = null
    onSaveRef.current(html)
    setSaveState('sent')
  }
  const flushRef = useRef(flush)
  useEffect(() => { flushRef.current = flush })

  // Text typed in the last second used to be lost when the panel closed, the role changed or the tab was hidden.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flushRef.current() }
    const onPageHide = () => flushRef.current()
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onPageHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onPageHide)
      flushRef.current() // unmount
    }
  }, [])

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
      CharacterCount,
    ],
    content: content || '',
    editable,
    onUpdate({ editor: ed }) {
      if (!editable) return
      const html = ed.getHTML()
      unsentHtml.current = html === '<p></p>' ? '' : html
      setSaveState('typing')
      clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(flush, 1000)
    },
  })

  // 'sent' + nothing in the queue = the server has it. Show "Saved" briefly, then clear.
  const label: 'saving' | 'saved' | 'failed' | null =
    saveState === 'idle' ? null
    : saveState === 'typing' ? 'saving'
    : queueFailed ? 'failed'
    : queuePending > 0 ? 'saving'
    : 'saved'
  useEffect(() => {
    if (label !== 'saved') return
    const t = setTimeout(() => setSaveState(s => (s === 'sent' ? 'idle' : s)), 2000)
    return () => clearTimeout(t)
  }, [label])

  const charCount = editor.storage?.characterCount?.characters() ?? 0

  const toolItems = [
    { icon: Bold,        title: 'Bold',           action: () => editor.chain().focus().toggleBold().run(),                    active: editor.isActive('bold') },
    { icon: Italic,      title: 'Italic',         action: () => editor.chain().focus().toggleItalic().run(),                  active: editor.isActive('italic') },
    null,
    { icon: Heading2,    title: 'Heading 2',      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),     active: editor.isActive('heading', { level: 2 }) },
    { icon: Heading3,    title: 'Heading 3',      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),     active: editor.isActive('heading', { level: 3 }) },
    null,
    { icon: List,        title: 'Bullet list',    action: () => editor.chain().focus().toggleBulletList().run(),              active: editor.isActive('bulletList') },
    { icon: ListOrdered, title: 'Numbered list',  action: () => editor.chain().focus().toggleOrderedList().run(),             active: editor.isActive('orderedList') },
  ]

  return (
    <div>
      {editable && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 2,
          padding: '5px 8px',
          background: 'var(--raised)',
          border: '1px solid var(--border)',
          borderRadius: '8px 8px 0 0',
        }}>
          {toolItems.map((item, i) => {
            if (!item) {
              return <div key={i} style={{ width: 1, height: 14, background: 'var(--border)', margin: '0 3px' }} />
            }
            const { icon: Icon, title, action, active } = item
            return (
              <button
                key={title}
                title={title}
                onMouseDown={e => { e.preventDefault(); action() }}
                style={{
                  padding: '4px 5px',
                  background: active ? 'var(--brand-bg)' : 'transparent',
                  border: 'none',
                  borderRadius: 4,
                  color: active ? 'var(--brand)' : 'var(--muted)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center',
                  transition: 'all .1s',
                }}
              >
                <Icon size={13} />
              </button>
            )
          })}
          <div style={{ flex: 1 }} />
          {label && (
            <span
              data-testid="jd-save-status"
              style={{
                fontSize: 10,
                color: label === 'saved' ? 'var(--success)' : label === 'failed' ? 'var(--danger)' : 'var(--dim)',
                transition: 'color .2s',
              }}
            >
              {label === 'saving' ? 'Saving…' : label === 'saved' ? 'Saved' : "Couldn't save"}
            </span>
          )}
        </div>
      )}
      <div
        onClick={() => editor.commands.focus()}
        style={{
          border: '1px solid var(--border)',
          borderTop: editable ? 'none' : '1px solid var(--border)',
          borderRadius: editable ? '0 0 8px 8px' : 8,
          background: 'var(--input-bg)',
          minHeight: 120,
          padding: '10px 12px',
          cursor: editable ? 'text' : 'default',
          fontSize: 13,
          color: 'var(--text)',
          lineHeight: 1.6,
        }}
      >
        <EditorContent editor={editor} />
      </div>
      <div style={{ fontSize: 10, color: 'var(--dim)', textAlign: 'right', marginTop: 4 }}>
        {charCount} characters
      </div>
    </div>
  )
}
