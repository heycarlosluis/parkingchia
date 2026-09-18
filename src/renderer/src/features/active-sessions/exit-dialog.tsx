import { LoaderCircle, LogOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { ActiveSession, ExitRegistration, SessionQuote } from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import {
  addReceivedCash,
  calculateChange,
  describeElapsed,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  QUICK_CASH_AMOUNTS_COP,
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

/** Los botones muestran solo la cifra; el nombre accesible incluye la moneda. */
const QUICK_AMOUNT_FORMAT = new Intl.NumberFormat('es-CO')

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
  const receivedRef = useRef<HTMLInputElement>(null)

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
  // Sin nada que cobrar no se pide efectivo, así que tampoco puede faltar: es la
  // misma condición que aplica `closeSession` en el proceso principal. Sin el
  // `total > 0`, una salida cubierta por mensualidad o dentro de la tolerancia
  // dejaba el botón deshabilitado para siempre, sin campo donde corregirlo.
  const missingCash =
    total > 0 && method === 'cash' && (receivedValue === null || receivedValue < total)

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
  const asksForCash = !quoting && charge !== null && charge.totalCop > 0 && method === 'cash'

  // El campo aparece cuando llega la cotización: el foco espera a que exista
  // para que el operador escriba el efectivo sin tocar el ratón.
  useEffect(() => {
    if (asksForCash) receivedRef.current?.focus()
  }, [asksForCash])

  /** Registra el efectivo y devuelve el foco al campo para seguir con el teclado. */
  const applyCash = (value: number | null): void => {
    setReceived(value ?? Number.NaN)
    receivedRef.current?.focus()
  }

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
                        ref={receivedRef}
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
                  {method === 'cash' ? (
                    // Fuera del campo: mientras está vacío se marca inválido y todo su
                    // contenido se pinta en rojo, incluidos estos botones.
                    <div className="quick-cash" role="group" aria-label="Montos rápidos">
                      <Button
                        type="button"
                        variant="secondary"
                        className="quick-cash-exact"
                        onClick={() => applyCash(total)}
                      >
                        Monto exacto · <span className="tabular">{formatCurrency(total)}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        className="quick-cash-clear"
                        onClick={() => applyCash(null)}
                        disabled={receivedValue === null}
                      >
                        Borrar
                      </Button>
                      {QUICK_CASH_AMOUNTS_COP.map((amount) => (
                        <Button
                          key={amount}
                          type="button"
                          variant="outline"
                          className="tabular"
                          aria-label={`Sumar ${formatCurrency(amount)}`}
                          onClick={() => applyCash(addReceivedCash(receivedValue, amount))}
                        >
                          +{QUICK_AMOUNT_FORMAT.format(amount)}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </>
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
