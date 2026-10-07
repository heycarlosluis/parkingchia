import { useEffect, useRef, useState } from 'react'
import type { PaymentMethod } from '@shared/parking'
import { useChargeModeStore } from '@/store/charge-mode-store'

export type CashPayment = {
  method: PaymentMethod
  setMethod: (method: PaymentMethod) => void
  /** Efectivo escrito por el operador; `null` con el campo vacío. */
  receivedValue: number | null
  setReceived: (value: number | null) => void
  simpleChargeMode: boolean
  /** El pago es en efectivo y hay que registrar cuánto se recibió. */
  cashIsCounted: boolean
  /** Falta el efectivo recibido o no cubre el total. */
  missingCash: boolean
  /** Lo que se envía al proceso principal: `null` cuando no se cuenta efectivo. */
  receivedCop: number | null
  receivedRef: React.RefObject<HTMLInputElement | null>
}

/**
 * Estado del medio de pago y del efectivo recibido de un cobro.
 *
 * Lo comparten la salida y el cobro de un pago pendiente para que ambos pidan
 * exactamente lo mismo que después valida el proceso principal.
 */
export function useCashPayment(total: number): CashPayment {
  const simpleChargeMode = useChargeModeStore((store) => store.simpleChargeMode)
  const initializeChargeMode = useChargeModeStore((store) => store.initialize)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState<number>(Number.NaN)
  const receivedRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void initializeChargeMode()
  }, [initializeChargeMode])

  const receivedValue = Number.isFinite(received) ? received : null
  // Con el cobro simplificado no se registra efectivo recibido ni cambio.
  const cashIsCounted = method === 'cash' && !simpleChargeMode
  // Sin nada que cobrar no se pide efectivo, así que tampoco puede faltar: es la
  // misma condición que aplica `closeSession` en el proceso principal. Sin el
  // `total > 0`, una salida cubierta por mensualidad o dentro de la tolerancia
  // dejaba el botón deshabilitado para siempre, sin campo donde corregirlo.
  const missingCash =
    total > 0 && cashIsCounted && (receivedValue === null || receivedValue < total)

  return {
    method,
    setMethod,
    receivedValue,
    setReceived: (value) => setReceived(value ?? Number.NaN),
    simpleChargeMode,
    cashIsCounted,
    missingCash,
    receivedCop: cashIsCounted ? receivedValue : null,
    receivedRef,
  }
}
