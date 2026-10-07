import { formatCurrency } from '@shared/format'
import {
  addReceivedCash,
  calculateChange,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  QUICK_CASH_AMOUNTS_COP,
  type PaymentMethod,
} from '@shared/parking'
import { Button } from '@/components/ui/button'
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
import type { CashPayment } from '@/features/active-sessions/use-cash-payment'

/** Los botones muestran solo la cifra; el nombre accesible incluye la moneda. */
const QUICK_AMOUNT_FORMAT = new Intl.NumberFormat('es-CO')

type PaymentFieldsProps = {
  /** Prefijo de los `id` para que dos diálogos no compartan etiquetas. */
  idPrefix: string
  total: number
  payment: CashPayment
}

/** Medio de pago, efectivo recibido y montos rápidos de un cobro. */
export function PaymentFields({ idPrefix, total, payment }: PaymentFieldsProps): React.JSX.Element {
  const { method, receivedValue, cashIsCounted, missingCash, receivedRef } = payment
  const change = cashIsCounted ? calculateChange(total, receivedValue) : null

  /** Registra el efectivo y devuelve el foco al campo para seguir con el teclado. */
  const applyCash = (value: number | null): void => {
    payment.setReceived(value)
    receivedRef.current?.focus()
  }

  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-method`}>Medio de pago</FieldLabel>
        <Select value={method} onValueChange={(value) => payment.setMethod(value as PaymentMethod)}>
          <SelectTrigger id={`${idPrefix}-method`} className="min-h-11">
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

      {payment.simpleChargeMode ? (
        <p className="field-hint">
          Cobro simplificado: se registra el total, sin efectivo recibido ni cambio.
        </p>
      ) : null}
      {cashIsCounted ? (
        <Field data-invalid={missingCash}>
          <FieldLabel htmlFor={`${idPrefix}-received`}>Efectivo recibido</FieldLabel>
          <Input
            ref={receivedRef}
            id={`${idPrefix}-received`}
            className="min-h-11"
            type="number"
            inputMode="numeric"
            min={0}
            step={100}
            value={receivedValue ?? ''}
            onChange={(event) =>
              payment.setReceived(
                Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null,
              )
            }
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
      {cashIsCounted ? (
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
  )
}
