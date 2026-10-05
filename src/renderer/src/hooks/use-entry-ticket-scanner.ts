import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  decodeEntryTicketCode,
  isEntryTicketCode,
  MAX_ENTRY_SCAN_LENGTH,
} from '@shared/entry-ticket'

const SCAN_CHARACTER_GAP_MS = 120

function isEditableTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  )
}

/** El campo de Registrar salida recibe el lector por sí mismo. */
function isScannerField(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.hasAttribute('data-scanner-field')
}

/**
 * Escucha lectores USB configurados como teclado desde cualquier pantalla.
 *
 * El lector escribe el código muy rápido y termina con Enter o Tab. No se depende
 * de un fabricante, controlador o API de hardware particular.
 *
 * Con el foco fuera de un campo basta con que la ráfaga tenga forma de tiquete.
 * Con el foco dentro de un campo se exige un código completo y válido: así un
 * tiquete escaneado en Registrar ingreso abre su salida en lugar de registrar
 * sus primeros dígitos como una matrícula nueva, y lo que se escribe a mano
 * nunca se confunde con una lectura.
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
        isScannerField(event.target) ||
        // Un diálogo abierto, también el de confirmación, es una operación en curso.
        document.querySelector('[role="dialog"], [role="alertdialog"]')
      ) {
        reset()
        return
      }

      if (event.key === 'Enter' || event.key === 'Tab') {
        const code = buffer.current.trim()
        reset()
        const recognized = isEditableTarget(event.target)
          ? decodeEntryTicketCode(code) !== null
          : isEntryTicketCode(code)
        if (!recognized) return
        // Evita que el Enter del lector envíe el formulario que tenía el foco.
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

    // En captura: el Enter del lector se detiene antes de que el campo lo procese.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [navigate])
}
