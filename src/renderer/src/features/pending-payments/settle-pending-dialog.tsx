import { HandCoins, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ExitRegistration, PendingPayment } from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import { describeElapsed } from '@shared/parking'
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
import { useParkingStore } from '@/store/parking-store'

type SettlePendingDialogProps = {
  /** El diálogo se monta por pendiente: el llamador lo renderiza con `key={pending.id}`. */
  pending: PendingPayment
  onOpenChange: (open: boolean) => void
  onSettled: (exit: ExitRegistration) => void
}

/** Cobra un pago pendiente: el importe ya está congelado, solo falta el medio de pago. */
export function SettlePendingDialog({
  pending,
  onOpenChange,
  onSettled,
}: SettlePendingDialogProps): React.JSX.Element {
  const settlePendingPayment = useParkingStore((store) => store.settlePendingPayment)
  const error = useParkingStore((store) => store.error)
  const [submitting, setSubmitting] = useState(false)
  const confirmRef = useRef<HTMLButtonElement>(null)

  const { charge } = pending
  const total = pending.amountCop
  const payment = useCashPayment(total)
  const { cashIsCounted, receivedRef } = payment

  // Igual que en la salida: el cursor queda donde el operador va a escribir o confirmar.
  useEffect(() => {
    if (cashIsCounted) receivedRef.current?.focus()
    else confirmRef.current?.focus()
  }, [cashIsCounted, receivedRef])

  const confirm = async (): Promise<void> => {
    setSubmitting(true)
    const result = await settlePendingPayment({
      pendingPaymentId: pending.id,
      method: payment.method,
      receivedCop: payment.receivedCop,
    })
    setSubmitting(false)
    if (result) onSettled(result)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog exit-dialog">
        <DialogHeader>
          <DialogTitle>Cobrar pago pendiente</DialogTitle>
          <DialogDescription>
            {VEHICLE_TYPE_LABELS[pending.vehicleType]} · {pending.ratePlanName ?? 'Sin tarifa'}
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>No fue posible cobrar</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="exit-dialog-body">
          <div className="exit-dialog-summary">
            <p className="plate-display">{pending.plate}</p>
            <dl className="charge-breakdown">
              <div>
                <dt>Ingreso</dt>
                <dd className="tabular">{formatDateTime(pending.enteredAt)}</dd>
              </div>
              <div>
                <dt>Salida</dt>
                <dd className="tabular">{formatDateTime(pending.exitedAt)}</dd>
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
                <dd className="tabular">{formatCurrency(total)}</dd>
              </div>
            </dl>
          </div>

          <div className="exit-dialog-payment">
            <PaymentFields idPrefix="pending" total={total} payment={payment} />
          </div>
        </div>

        <DialogFooter className="exit-dialog-footer">
          <Button
            ref={confirmRef}
            type="button"
            onClick={() => void confirm()}
            disabled={submitting || payment.missingCash}
          >
            {submitting ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : (
              <HandCoins data-icon="inline-start" />
            )}
            Cobrar {formatCurrency(total)}
          </Button>
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
