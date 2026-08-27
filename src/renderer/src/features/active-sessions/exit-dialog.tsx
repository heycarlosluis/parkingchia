import { LoaderCircle, LogOut } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ActiveSession, ExitRegistration, SessionQuote } from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import {
  calculateChange,
  describeElapsed,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@shared/parking'
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
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useParkingStore } from '@/store/parking-store'

type ExitDialogProps = {
  /** El diálogo se monta por sesión: el llamador lo renderiza con `key={session.id}`. */
  session: ActiveSession
  onOpenChange: (open: boolean) => void
  onClosed: (exit: ExitRegistration) => void
}

export function ExitDialog({
  session,
  onOpenChange,
  onClosed,
}: ExitDialogProps): React.JSX.Element {
  const closeSession = useParkingStore((store) => store.closeSession)
  const error = useParkingStore((store) => store.error)
  const [quote, setQuote] = useState<SessionQuote | null>(null)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState<number>(Number.NaN)
  const [quoteError, setQuoteError] = useState('')
  const [quoting, setQuoting] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const [reloadToken, setReloadToken] = useState(0)

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
  const receivedValue = Number.isFinite(received) ? received : null
  const change = method === 'cash' ? calculateChange(total, receivedValue) : null
  const missingCash = method === 'cash' && (receivedValue === null || receivedValue < total)

  const confirm = async (): Promise<void> => {
    if (!quote) return
    setSubmitting(true)
    const result = await closeSession({
      sessionId,
      expectedTotalCop: quote.charge.totalCop,
      method,
      receivedCop: method === 'cash' ? receivedValue : null,
      notes: null,
    })
    setSubmitting(false)
    if (result) onClosed(result)
    else requote()
  }

  const charge = quote?.charge ?? null
  const coverage = quote?.session.monthlyCoverage ?? null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>Registrar salida</DialogTitle>
          <DialogDescription>
            {VEHICLE_TYPE_LABELS[session.vehicleType]} · {session.ratePlanName ?? 'Sin tarifa'}
          </DialogDescription>
        </DialogHeader>

        <p className="plate-display">{session.plate}</p>

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

        {quoting ? (
          <p className="field-hint">Calculando el cobro…</p>
        ) : !charge ? null : (
          <>
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

            {charge.totalCop > 0 ? (
              <>
                <Field>
                  <FieldLabel htmlFor="exit-method">Medio de pago</FieldLabel>
                  <Select
                    value={method}
                    onValueChange={(value) => setMethod(value as PaymentMethod)}
                  >
                    <SelectTrigger id="exit-method" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PAYMENT_METHODS.map((value) => (
                          <SelectItem key={value} value={value}>
                            {PAYMENT_METHOD_LABELS[value]}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>

                {method === 'cash' ? (
                  <Field data-invalid={missingCash}>
                    <FieldLabel htmlFor="exit-received">Efectivo recibido</FieldLabel>
                    <Input
                      id="exit-received"
                      className="min-h-11"
                      type="number"
                      inputMode="numeric"
                      min={0}
                      step={100}
                      value={Number.isFinite(received) ? received : ''}
                      onChange={(event) => setReceived(event.target.valueAsNumber)}
                      aria-invalid={missingCash}
                    />
                    <FieldDescription>
                      {receivedValue === null
                        ? 'El efectivo recibido es obligatorio para cobrar en efectivo.'
                        : missingCash
                          ? 'El efectivo recibido es menor que el total a cobrar.'
                          : `Cambio a entregar: ${formatCurrency(change ?? 0)}`}
                    </FieldDescription>
                  </Field>
                ) : null}
              </>
            ) : coverage ? (
              <p className="field-hint">
                Cubierto por la mensualidad de {coverage.customerName}, vigente del{' '}
                {describeCoverage(coverage.startsAt, coverage.endsAt)}. La salida no genera cobro ni
                recibo.
              </p>
            ) : (
              <p className="field-hint">
                La salida ocurre dentro del tiempo de gracia, así que no se cobra ni se emite
                recibo.
              </p>
            )}
          </>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          {quoteError ? (
            <Button type="button" variant="outline" onClick={requote}>
              Reintentar
            </Button>
          ) : null}
          <Button
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
