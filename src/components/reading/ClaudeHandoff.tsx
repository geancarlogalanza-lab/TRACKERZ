import { useRef, useState } from 'react'
import { Button } from '../ui/Button'
import { FormError } from '../ui/Field'
import { Modal } from '../ui/Modal'
import { aimBurst } from '../../lib/ember'
import { buildManualPrompt } from '../../lib/reading'
import { toMessage } from '../../lib/errors'
import type { Capture } from '../../data/types'

interface ClaudeHandoffProps {
  capture: Capture
  onApply: (reply: string) => Promise<void>
  onDone: () => void
  onClose: () => void
}

/**
 * Processing by hand, with a Claude Pro chat instead of the paid API: copy
 * the notes and instructions out, paste Claude's reply back in. The reply
 * is checked exactly like an API answer before it reaches Review.
 */
export function ClaudeHandoff({ capture, onApply, onDone, onClose }: ClaudeHandoffProps) {
  const prompt = buildManualPrompt(capture)
  const [copied, setCopied] = useState(false)
  const [showText, setShowText] = useState(false)
  const [reply, setReply] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const promptRef = useRef<HTMLTextAreaElement>(null)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(prompt)
      setCopied(true)
    } catch {
      // Some app views refuse the clipboard: show the text, selected, instead.
      setShowText(true)
      requestAnimationFrame(() => promptRef.current?.select())
    }
  }

  const submit = async (submitter: HTMLElement | null) => {
    setError(null)
    if (!reply.trim()) return setError("Paste Claude's reply first.")
    // The copied instructions fence the notes in <notes>; Claude's answer never does.
    if (reply.includes('<notes>')) {
      return setError(
        "That's the text you copied for Claude, not Claude's answer. Paste it into a new chat on claude.ai, send it, then paste Claude's reply here.",
      )
    }
    // Thrown only once the reply is accepted, never for one that's turned away.
    const pop = submitter ? aimBurst(submitter) : null
    setBusy(true)
    try {
      await onApply(reply)
      pop?.('kindle')
      onDone()
    } catch (caught) {
      setError(toMessage(caught, 'Could not save that reply.'))
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Process with Claude"
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>
            Later
          </Button>
          <Button type="submit" variant="primary" disabled={busy || !reply.trim()}>
            {busy ? 'Checking…' : 'Add to Review'}
          </Button>
        </>
      }
    >
      <p className="handoff__book">
        {capture.book_title} · {capture.book_author}
      </p>
      <FormError message={error} />

      <ol className="handoff">
        <li className="handoff__step">
          <p className="handoff__label">Copy your notes, with the instructions for Claude</p>
          <div className="handoff__row">
            <Button type="button" variant={copied ? 'default' : 'primary'} onClick={copy}>
              {copied ? 'Copied' : 'Copy for Claude'}
            </Button>
            <button type="button" className="handoff__toggle" onClick={() => setShowText((value) => !value)}>
              {showText ? 'Hide text' : 'Show text'}
            </button>
          </div>
          {showText && (
            <textarea
              ref={promptRef}
              className="textarea handoff__prompt"
              value={prompt}
              readOnly
              aria-label="Text to paste into Claude"
              onFocus={(event) => event.currentTarget.select()}
            />
          )}
        </li>

        <li className="handoff__step">
          <p className="handoff__label">Paste it into a new chat</p>
          <a className="handoff__link" href="https://claude.ai/new" target="_blank" rel="noreferrer">
            Open claude.ai
          </a>
        </li>

        <li className="handoff__step">
          <label className="handoff__label" htmlFor="handoff-reply">
            Copy Claude's whole reply and paste it here
          </label>
          <textarea
            id="handoff-reply"
            className="textarea handoff__reply"
            value={reply}
            onChange={(event) => setReply(event.target.value)}
            placeholder='{"lessons": [ … ]}'
            spellCheck={false}
          />
        </li>
      </ol>
    </Modal>
  )
}
