import { Hourglass, LoaderCircle, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type {
  ActiveSession,
  ExitRegistration,
  PendingPayment,
  SessionQuote,
} from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import { describeElapsed } from '@shared/parking'
import { describeCoverage } from '@shared/monthly'
import { describeBilledTime, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PaymentFields } from '@/features/active-sessions/payment-fields'
import { useCashPayment } from '@/features/active-sessions/use-cash-payment'
import { PendingPaymentsNotice } from '@/features/pending-payments/pending-payments-notice'
import { useParkingStore } from '@/store/parking-store'

type ExitDialogProps = {
  /** El diálogo se monta por sesión: el llamador lo renderiza con `key={session.id}`. */
  session: ActiveSession
  onOpenChange: (open: boolean) => void
  onClosed: (exit: ExitRegistration) => void
  /** El vehículo salió sin pagar y el cobro quedó como pago pendiente. */
  onPending: (pending: PendingPayment) => void
}

export function ExitDialog({
  session,
  onOpenChange,
  onClosed,
  onPending,
}: ExitDialogProps): React.JSX.Element {
  const closeSession = useParkingStore((store) => store.closeSession)
  const markPaymentPending = useParkingStore((store) => store.markPaymentPending)
  const error = useParkingStore((store) => store.error)
  const [quote, setQuote] = useState<SessionQuote | null>(null)
  const [quoteError, setQuoteError] = useState('')
  const [quoting, setQuoting] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [reloadToken, setReloadToken] = useState(0)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const sessionId = session.id

  useEffect(() => {
    let cancelled = false
    void window.parkingAPI.quoteSessionExit({ sessionId }).then((result) => {
      if (cancelled) return
      setQuote(result.ok ? result.data : null)
      setQuoteError(result.ok ? '' : result.error.message)
      setQuoting(false)
    })
    return () => {
      cancelled = true
    }
  }, [sessionId, reloadToken])

  /** Vuelve a cotizar tras un fallo o cuando el total cambió mientras se confirmaba. */
  const requote = (): void => {
    setQuoting(true)
    setQuoteError('')
    setReloadToken((token) => token + 1)
  }

  const total = quote?.charge.totalCop ?? 0
  const payment = useCashPayment(total)
  const { missingCash, receivedRef } = payment

  const confirm = async (): Promise<void> => {
    if (!quote) return
    setSubmitting(true)
    const result = await closeSession({
      sessionId,
      expectedTotalCop: quote.charge.totalCop,
      method: payment.method,
      receivedCop: payment.receivedCop,
      notes: null,
    })
    setSubmitting(false)
    if (result) onClosed(result)
    else requote()
  }

  /** Registra la salida sin cobrar: el total cotizado queda como deuda del vehículo. */
  const leavePending = async (): Promise<void> => {
    if (!quote) return
    setSubmitting(true)
    const result = await markPaymentPending({
      sessionId,
      expectedTotalCop: quote.charge.totalCop,
    })
    setSubmitting(false)
    if (result) onPending(result)
    else requote()
  }

  const charge = quote?.charge ?? null
  const coverage = quote?.session.monthlyCoverage ?? null
  const hasCharge = !quoting && charge !== null && charge.totalCop > 0
  const asksForCash = hasCharge && payment.cashIsCounted

  // El campo aparece cuando llega la cotización: el foco espera a que exista
  // para que el operador escriba el efectivo sin tocar el ratón.
  useEffect(() => {
    if (asksForCash) receivedRef.current?.focus()
  }, [asksForCash, receivedRef])

  // Sin efectivo que escribir, el foco va al cobro: Enter confirma la salida.
  const confirmsDirectly = hasCharge && payment.simpleChargeMode
  useEffect(() => {
    if (confirmsDirectly) confirmRef.current?.focus()
  }, [confirmsDirectly])

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog exit-dialog">
        <DialogHeader>
          <DialogTitle>Registrar salida</DialogTitle>
          <DialogDescription>
            {VEHICLE_TYPE_LABELS[session.vehicleType]} · {session.ratePlanName ?? 'Sin tarifa'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>No fue posible cobrar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {quoteError ? (
          <Alert variant="destructive">
            <AlertTitle>No fue posible calcular el cobro</AlertTitle>
            <AlertDescription>{quoteError}</AlertDescription>
          </Alert>
        ) : null}

        {/* Deudas de salidas anteriores: se cobran aparte, no se suman a esta. */}
        <PendingPaymentsNotice plate={session.plate} readOnly />

        {quoting ? (
          <>
            <p className="plate-display">{session.plate}</p>
            <p className="field-hint">Calculando el cobro…</p>
          </>
        ) : !charge ? (
          <p className="plate-display">{session.plate}</p>
        ) : (
          // Resumen a la izquierda y pago a la derecha: en una sola columna los
          // montos rápidos quedaban debajo del borde y había que desplazarse.
          <div className="exit-dialog-body">
            <div className="exit-dialog-summary">
              <p className="plate-display">{session.plate}</p>
              <dl className="charge-breakdown">
                <div>
                  <dt>Ingreso</dt>
                  <dd className="tabular">{formatDateTime(session.enteredAt)}</dd>
                </div>
                <div>
                  <dt>Permanencia</dt>
                  <dd className="tabular">{describeElapsed(charge.totalMinutes)}</dd>
                </div>
                <div>
                  <dt>Tiempo cobrado</dt>
                  <dd>{describeBilledTime(charge)}</dd>
                </div>
                {charge.taxPercent > 0 ? (
                  <>
                    <div>
                      <dt>Subtotal sin IVA</dt>
                      <dd className="tabular">{formatCurrency(charge.subtotalCop)}</dd>
                    </div>
                    <div>
                      <dt>IVA ({charge.taxPercent} %)</dt>
                      <dd className="tabular">{formatCurrency(charge.taxCop)}</dd>
                    </div>
                  </>
                ) : null}
                <div className="charge-total">
                  <dt>Total a cobrar</dt>
                  <dd className="tabular">{formatCurrency(charge.totalCop)}</dd>
                </div>
              </dl>
            </div>

            <div className="exit-dialog-payment">
              {charge.totalCop > 0 ? (
                <PaymentFields idPrefix="exit" total={total} payment={payment} />
              ) : coverage ? (
                <p className="field-hint">
                  Cubierto por la mensualidad de {coverage.customerName}, vigente del{' '}
                  {describeCoverage(coverage.startsAt, coverage.endsAt)}. La salida no genera cobro
                  ni recibo.
                </p>
              ) : (
                <p className="field-hint">
                  La salida ocurre dentro del tiempo de gracia, así que no se cobra ni se emite
                  recibo.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Fijo al fondo: con los montos rápidos el diálogo puede desplazarse y «Cobrar» debe verse siempre. */}
        <DialogFooter className="exit-dialog-footer">
          {/* Cobrar va primero: es lo habitual y lo que sigue al efectivo con el tabulador. */}
          <Button
            ref={confirmRef}
            type="button"
            onClick={() => void confirm()}
            disabled={submitting || quoting || !charge || missingCash}
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <LogOut data-icon="inline-start" />
            )}
            {charge && charge.totalCop === 0
              ? coverage
                ? 'Registrar salida de mensualidad'
                : 'Registrar salida sin cobro'
              : `Cobrar ${formatCurrency(total)}`}
          </Button>
          {hasCharge ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void leavePending()}
              disabled={submitting}
            >
              <Hourglass data-icon="inline-start" />
              Pago pendiente
            </Button>
          ) : null}
          {quoteError ? (
            <Button type="button" variant="outline" onClick={requote}>
              Reintentar
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            className="exit-dialog-cancel"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
