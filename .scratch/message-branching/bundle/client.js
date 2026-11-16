/**
 * Browser half of the message edit and branch bundle.
 *
 * DSH renders each user message through the keyed `conversation.chat.node`
 * renderer under the `user` key. This module takes over that key so the row can
 * offer an Edit action next to Copy, then:
 *
 *   1. forks the Session from the inclusive prefix that ends just before the
 *      edited message (`sessions.fork` with `atSeq = message.seq - 1`),
 *   2. sends the edited text into the child Session, and
 *   3. opens the child, so the branch reads like a normal conversation.
 *
 * The source conversation is never modified; the Session log stays append-only.
 * The message content is still rendered by the shipped
 * `conversation.chat.user.content` Factory, so bubbles, attachments, and text
 * transforms keep their host presentation.
 */
window.__ModuleLoader__.load({
  id: '@local/message-edit-branch',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'messageEditBranch'

    /** English copy, also the fallback when the locale service has no entry. */
    const EN = {
      copy: 'Copy message',
      copied: 'Copied',
      edit: 'Edit message',
      editUnavailable: 'The first message of a session has nothing before it to branch from.',
      heading: 'Edit message',
      note: 'Saving forks this conversation just before this message and sends the edited text in the new branch. This conversation stays as it is.',
      attachmentsNote: 'Attachments from the original message are not carried into the branch.',
      save: 'Edit & branch',
      saving: 'Branching…',
      cancel: 'Cancel',
      failed: 'Could not create the branch',
      label: 'Message text',
    }

    const ZH = {
      copy: '复制消息',
      copied: '已复制',
      edit: '编辑消息',
      editUnavailable: '会话的第一条消息之前没有内容，无法从此处创建分支。',
      heading: '编辑消息',
      note: '保存会从此消息之前分叉出新分支，并在新分支中发送修改后的文本；当前对话保持不变。',
      attachmentsNote: '原消息的附件不会带入新分支。',
      save: '编辑并分支',
      saving: '正在创建分支…',
      cancel: '取消',
      failed: '无法创建分支',
      label: '消息文本',
    }

    const CSS = `
.dmb-row {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  min-width: 0;
}
.dmb-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
}
.dmb-time {
  padding-right: 12px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 24px;
  white-space: nowrap;
  opacity: 0.72;
}
.dmb-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 6px;
  border: none;
  border-radius: var(--dsw-radius-sm, 6px);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: 0.75;
  transition: opacity 80ms ease, background-color 80ms ease;
}
.dmb-action svg {
  width: 15px;
  height: 15px;
}
.dmb-action:hover {
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-primary);
  opacity: 1;
}
.dmb-action:focus-visible {
  outline: 1.5px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
  opacity: 1;
}
.dmb-action[data-unavailable] {
  cursor: default;
  opacity: 0.35;
}
.dmb-action[data-unavailable]:hover {
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
.dmb-editor {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(560px, 82%);
  padding: 10px 12px;
  border: 1px solid var(--dsw-alias-border-l2);
  border-radius: var(--dsw-radius-lg, 12px);
  background: var(--dsw-alias-bg-layer-1);
  box-sizing: border-box;
}
.dmb-heading {
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
  font-weight: 600;
  line-height: 20px;
}
.dmb-input {
  width: 100%;
  min-height: 68px;
  max-height: 40vh;
  padding: 8px 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: var(--dsw-radius-md, 8px);
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  line-height: 1.5;
  resize: vertical;
  box-sizing: border-box;
}
.dmb-input:focus-visible {
  outline: 1.5px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.dmb-note {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 1.5;
}
.dmb-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 1.5;
}
.dmb-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.dmb-ghost,
.dmb-primary {
  padding: 6px 12px;
  border-radius: var(--dsw-radius-md, 8px);
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  cursor: pointer;
}
.dmb-ghost {
  border: 1px solid var(--dsw-alias-border-l2);
  background: transparent;
  color: var(--dsw-alias-label-primary);
}
.dmb-ghost:hover {
  background: var(--dsw-alias-bg-layer-2);
}
.dmb-primary {
  border: 1px solid transparent;
  background: var(--dsw-alias-brand-primary);
  color: #fff;
  font-weight: 600;
}
.dmb-primary:disabled {
  cursor: default;
  opacity: 0.5;
}
.dmb-ghost:focus-visible,
.dmb-primary:focus-visible {
  outline: 1.5px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
.dmb-fallback {
  color: var(--dsw-alias-label-primary);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
`

    /** Localized string with an English fallback. */
    function label(translate, key) {
      if (typeof translate !== 'function') return EN[key]
      try {
        const value = translate(key)
        return typeof value === 'string' && value !== '' && value !== key ? value : EN[key]
      } catch {
        return EN[key]
      }
    }

    /** Split one durable message content array the way the shipped user row does. */
    function splitContent(content) {
      const texts = []
      const attachments = []
      const rest = []
      const blocks = Array.isArray(content) ? content : []
      for (const block of blocks) {
        const value = block && typeof block === 'object' ? block : {}
        if (value.type === 'text' && typeof value.text === 'string') texts.push(value.text)
        else if (value.type === 'image' && value.attachment !== undefined) {
          attachments.push({ type: 'image', image: { attachment: value.attachment } })
        } else if (value.type === 'file' && value.attachment !== undefined) {
          attachments.push({ type: 'file', file: value.attachment })
        } else rest.push(block)
      }
      return { text: texts.join(''), attachments, rest }
    }

    /** Short clock for the row, following the document language. */
    function clockText(time) {
      if (typeof time !== 'number' || !Number.isFinite(time)) return ''
      const date = new Date(time)
      const now = new Date()
      const sameDay = date.toDateString() === now.toDateString()
      const language = typeof document === 'undefined' ? undefined : document.documentElement.lang || undefined
      const options = sameDay
        ? { hour: '2-digit', minute: '2-digit' }
        : { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
      try {
        return new Intl.DateTimeFormat(language, options).format(date)
      } catch {
        return date.toLocaleString()
      }
    }

    /** Human-readable failure from a rejected fork or prompt. */
    function failureText(error) {
      if (error instanceof Error && error.message !== '') return error.message
      if (typeof error === 'string' && error !== '') return error
      return 'unknown error'
    }

    /**
     * Fork the Session before one message, send the edited text in the child,
     * then open the child.
     * @param {object} ctx - Client root context owning the slot registration.
     * @param {string} sessionId - source Session id.
     * @param {number} atSeq - inclusive prefix boundary; the last event kept.
     * @param {string} prompt - edited message text.
     * @returns {Promise<void>} completion after the child received the prompt.
     */
    async function branchWithEdit(ctx, sessionId, atSeq, prompt) {
      const childId = await ctx.sessions.fork({ sessionId, atSeq, increaseTitle: true })
      await ctx.sessions.using(childId, { source: 'controllerOperation' }, async (reference) => {
        await reference.ready
        const result = await reference.binding.session.prompt([{ type: 'text', text: prompt }], 'queue')
        if (!result.ok) {
          throw new Error(result.error.message === '' ? result.error.code : result.error.message)
        }
      })
      ctx.uiWorkspace.openSession(childId)
    }

    function CopyIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('rect', { x: 9, y: 9, width: 11, height: 11, rx: 2.4 }),
      h('path', { d: 'M15 5.5A2.5 2.5 0 0 0 12.5 4H6.5A2.5 2.5 0 0 0 4 6.5v6A2.5 2.5 0 0 0 5.5 15' }))
    }

    function CheckIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round', strokeLinejoin: 'round',
      }, h('path', { d: 'M5 12.5l4.5 4.5L19 7.5' }))
    }

    function PencilIcon() {
      return h('svg', {
        viewBox: '0 0 24 24', 'aria-hidden': true, fill: 'none',
        stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round',
      },
      h('path', { d: 'M4.5 19.5l4.2-.9L19 8.3a2.1 2.1 0 0 0-3-3L5.7 15.6z' }),
      h('path', { d: 'M14.8 6.5l2.7 2.7' }))
    }

    /** One durable user message row with Copy and Edit actions. */
    function UserMessageRow(props) {
      const { node, ctx, translate, renderFactorySlot, loadImage, sessionId } = props
      const data = node && node.data && typeof node.data === 'object' ? node.data : {}
      const seq = typeof data.seq === 'number' ? data.seq : null
      const canEdit = seq !== null && seq > 1

      const parts = React.useMemo(() => splitContent(data.content), [data.content])
      const prepared = React.useMemo(() => {
        const content = {
          text: parts.text,
          attachments: parts.attachments,
          extraBlocks: parts.rest,
        }
        if (data.referenceLabels !== undefined) content.referenceLabels = data.referenceLabels
        return content
      }, [parts, data.referenceLabels])
      const facts = React.useMemo(() => {
        const value = {}
        if (data.referenceLabels !== undefined) value.sessionLabels = data.referenceLabels
        if (data.skillNames !== undefined) value.skillNames = data.skillNames
        return value
      }, [data.referenceLabels, data.skillNames])

      const [editing, setEditing] = React.useState(false)
      const [draft, setDraft] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [failure, setFailure] = React.useState(null)
      const [copied, setCopied] = React.useState(false)
      const areaRef = React.useRef(null)
      const copyTimer = React.useRef(0)

      React.useEffect(() => () => {
        if (copyTimer.current !== 0) window.clearTimeout(copyTimer.current)
      }, [])
      React.useEffect(() => {
        if (!editing) return
        const area = areaRef.current
        if (area === null) return
        area.focus()
        const end = area.value.length
        try {
          area.setSelectionRange(end, end)
        } catch {
          // Selection is best-effort; a detached editor simply keeps its caret.
        }
      }, [editing])

      const startEdit = () => {
        setDraft(parts.text)
        setFailure(null)
        setEditing(true)
      }
      const cancelEdit = () => {
        setEditing(false)
        setBusy(false)
        setFailure(null)
      }
      const save = () => {
        if (busy || !canEdit) return
        const text = draft.trim()
        if (text === '' || seq === null) return
        setBusy(true)
        setFailure(null)
        branchWithEdit(ctx, sessionId, seq - 1, text).then(
          () => {
            setBusy(false)
            setEditing(false)
          },
          (error) => {
            setBusy(false)
            setFailure(failureText(error))
          },
        )
      }
      const copy = () => {
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (clipboard === undefined || typeof clipboard.writeText !== 'function') return
        clipboard.writeText(parts.text).then(() => {
          setCopied(true)
          if (copyTimer.current !== 0) window.clearTimeout(copyTimer.current)
          copyTimer.current = window.setTimeout(() => {
            copyTimer.current = 0
            setCopied(false)
          }, 1600)
        }, () => {
          // A refused clipboard keeps the button in its resting state.
        })
      }
      const onKeyDown = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          cancelEdit()
          return
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          save()
        }
      }

      const content = typeof renderFactorySlot === 'function'
        ? renderFactorySlot('conversation.chat.user.content', {
          content: prepared,
          loadImage,
          facts,
          interactive: true,
        })
        : h('div', { className: 'dmb-fallback' }, parts.text)
      const hasAttachments = parts.attachments.length > 0

      const actions = h('div', { className: 'dmb-actions' },
        h('span', { className: 'dmb-time' }, clockText(data.time)),
        h('button', {
          type: 'button',
          className: 'dmb-action',
          'aria-label': copied ? label(translate, 'copied') : label(translate, 'copy'),
          title: copied ? label(translate, 'copied') : label(translate, 'copy'),
          onClick: copy,
        }, copied ? h(CheckIcon) : h(CopyIcon)),
        h('button', {
          type: 'button',
          className: 'dmb-action',
          'aria-label': label(translate, 'edit'),
          title: canEdit ? label(translate, 'edit') : label(translate, 'editUnavailable'),
          'data-unavailable': canEdit ? undefined : '',
          'aria-disabled': canEdit ? undefined : true,
          onClick: canEdit ? startEdit : undefined,
        }, h(PencilIcon)))

      const editor = h('div', { className: 'dmb-editor' },
        h('span', { className: 'dmb-heading' }, label(translate, 'heading')),
        h('textarea', {
          ref: areaRef,
          className: 'dmb-input',
          value: draft,
          rows: 3,
          spellCheck: false,
          'aria-label': label(translate, 'label'),
          disabled: busy,
          onChange: (event) => { setDraft(event.target.value) },
          onKeyDown,
        }),
        h('span', { className: 'dmb-note' }, label(translate, 'note')),
        hasAttachments ? h('span', { className: 'dmb-note' }, label(translate, 'attachmentsNote')) : null,
        failure === null ? null : h('span', { className: 'dmb-error', role: 'alert' },
          label(translate, 'failed') + ': ' + failure),
        h('div', { className: 'dmb-footer' },
          h('button', {
            type: 'button',
            className: 'dmb-ghost',
            disabled: busy,
            onClick: cancelEdit,
          }, label(translate, 'cancel')),
          h('button', {
            type: 'button',
            className: 'dmb-primary',
            disabled: busy || draft.trim() === '',
            onClick: save,
          }, busy ? label(translate, 'saving') : label(translate, 'save'))))

      return h('div', { className: 'dmb-row' },
        editing ? null : content,
        editing ? editor : actions)
    }

    /** Insert the row stylesheet once for the lifetime of the Client run. */
    function insertStyles() {
      if (typeof document === 'undefined') return () => {}
      const style = document.createElement('style')
      style.textContent = CSS
      style.setAttribute('data-message-edit-branch', '')
      document.head.appendChild(style)
      return () => {
        if (style.parentNode !== null) style.parentNode.removeChild(style)
      }
    }

    /** Register this bundle's dictionaries and return the translator. */
    function bindTranslator(ctx) {
      const locale = ctx.get('locale')
      if (locale === undefined || locale === null) return null
      ctx.effect(() => {
        const disposers = []
        try {
          disposers.push(locale.register(NS, 'en', EN))
        } catch {
          // An installation without the "en" locale id keeps English copy inline.
        }
        try {
          disposers.push(locale.register(NS, 'zh', ZH))
        } catch {
          // The Chinese dictionary is optional.
        }
        return () => {
          for (const dispose of disposers) {
            try {
              dispose()
            } catch {
              // Disposal is best-effort during unload.
            }
          }
        }
      }, 'message-edit-branch: dictionaries')
      try {
        return locale.bind(NS)
      } catch {
        return null
      }
    }

    return {
      inject: ['slots', 'sessions', 'uiWorkspace'],
      apply(ctx) {
        const translate = bindTranslator(ctx)
        ctx.effect(() => insertStyles(), 'message-edit-branch: row styles')
        ctx.slots.inject('conversation.chat.node', () => ctx.slots.register({
          name: 'conversation.chat.node',
          key: 'user',
        }, function MessageEditBranchRow(props) {
          return h(UserMessageRow, Object.assign({}, props, { ctx, translate }))
        }))
      },
    }
  },
})
