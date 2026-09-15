import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { isEntryTicketCode, MAX_ENTRY_SCAN_LENGTH } from '@shared/entry-ticket'

const SCAN_CHARACTER_GAP_MS = 120

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/**
 * Escucha lectores USB configurados como teclado cuando el foco no está en un campo.
 *
 * El lector escribe el código muy rápido y termina con Enter o Tab. No se depende
 * de un fabricante, controlador o API de hardware particular.
 */
export function useEntryTicketScanner(): void {
  const navigate = useNavigate()
  const buffer = useRef('')
  const lastCharacterAt = useRef(0)

  useEffect(() => {
    const reset = (): void => {
      buffer.current = ''
      lastCharacterAt.current = 0
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      if (
        event.ctrlKey ||
        event.altKey ||
        event.metaKey ||
        isEditableTarget(event.target) ||
        document.querySelector('[role="dialog"]')
      ) {
        reset()
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = buffer.current.trim()
        reset()
        if (!isEntryTicketCode(code)) return
        event.preventDefault()
        navigate('/salidas', { state: { entryTicketCode: code, scanNonce: Date.now() } })
        return
      }

      if (event.key.length !== 1) return
      const now = performance.now()
      if (now - lastCharacterAt.current > SCAN_CHARACTER_GAP_MS) buffer.current = ''
      lastCharacterAt.current = now
      buffer.current = `${buffer.current}${event.key}`.slice(-MAX_ENTRY_SCAN_LENGTH)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [navigate])
}
