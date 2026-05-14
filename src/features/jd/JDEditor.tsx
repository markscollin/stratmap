import { useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import CharacterCount from '@tiptap/extension-character-count'
import { Bold, Italic, List, ListOrdered, Heading2, Heading3 } from 'lucide-react'

interface JDEditorProps {
  content: string
  onSave: (html: string) => void
  editable?: boolean
  placeholder?: string
}

type SaveState = 'idle' | 'saving' | 'saved'

export function JDEditor({ content, onSave, editable = true, placeholder = 'Start writing…' }: JDEditorProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const clearTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
      setSaveState('saving')
      clearTimeout(saveTimer.current)
      clearTimeout(clearTimer.current)
      saveTimer.current = setTimeout(() => {
        const html = ed.getHTML()
        onSave(html === '<p></p>' ? '' : html)
        setSaveState('saved')
        clearTimer.current = setTimeout(() => setSaveState('idle'), 2000)
      }, 1000)
    },
  })

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
          {saveState !== 'idle' && (
            <span style={{
              fontSize: 10,
              color: saveState === 'saved' ? 'var(--success)' : 'var(--dim)',
              transition: 'color .2s',
            }}>
              {saveState === 'saving' ? 'Saving…' : 'Saved'}
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
