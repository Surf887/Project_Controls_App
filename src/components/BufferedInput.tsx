import { useEffect, useRef, useState, type InputHTMLAttributes } from 'react'

type BaseInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'>

/**
 * Number input that buffers keystrokes locally and commits on blur or Enter
 * (Escape reverts). When the backend is connected every dispatch is a full
 * server round-trip, so inputs wired straight to `dispatch` felt frozen and
 * queued one request per keystroke. External value changes (server hydrate)
 * are reflected whenever the field is not focused.
 */
export function BufferedNumberInput({
  value,
  onCommit,
  ...inputProps
}: BaseInputProps & {
  value: number
  onCommit: (next: number) => void
}) {
  const [draft, setDraft] = useState(String(value))
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(String(value))
    }
  }, [value])

  function commit() {
    const parsed = Number(draft)
    if (!Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    if (parsed !== value) {
      onCommit(parsed)
    }
  }

  return (
    <input
      {...inputProps}
      type="number"
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true
        inputProps.onFocus?.(event)
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        focusedRef.current = false
        commit()
        inputProps.onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(String(value))
          event.currentTarget.blur()
        }
        inputProps.onKeyDown?.(event)
      }}
    />
  )
}

/** Text variant of BufferedNumberInput — commits on blur/Enter, reverts on Escape. */
export function BufferedTextInput({
  value,
  onCommit,
  ...inputProps
}: BaseInputProps & {
  value: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const focusedRef = useRef(false)

  useEffect(() => {
    if (!focusedRef.current) {
      setDraft(value)
    }
  }, [value])

  function commit() {
    if (draft !== value) {
      onCommit(draft)
    }
  }

  return (
    <input
      {...inputProps}
      type="text"
      value={draft}
      onFocus={(event) => {
        focusedRef.current = true
        inputProps.onFocus?.(event)
      }}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={(event) => {
        focusedRef.current = false
        commit()
        inputProps.onBlur?.(event)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
        inputProps.onKeyDown?.(event)
      }}
    />
  )
}
