import { LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { MonthlyPaymentRegistration, MonthlySubscription } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import { describeCoverage } from '@shared/monthly'
import {
  calculateChange,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHODS,
  type PaymentMethod,
} from '@shared/parking'
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

type PaymentDialogProps = {
  /** El diálogo se monta por mensualidad: el llamador usa `key={subscription.id}`. */
  subscription: MonthlySubscription
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    subscriptionId: string
    amountCop: number
    method: PaymentMethod
    receivedCop: number | null
    reference: string | null
  }) => Promise<MonthlyPaymentRegistration | null>
  onPaid: (registration: MonthlyPaymentRegistration) => void
}

export function PaymentDialog({
  subscription,
  error,
  onOpenChange,
  onSubmit,
  onPaid,
}: PaymentDialogProps): React.JSX.Element {
  const [amount, setAmount] = useState<number>(subscription.balanceCop)
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [received, setReceived] = useState<number>(Number.NaN)
  const [reference, setReference] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const amountValue = Number.isFinite(amount) ? amount : 0
  const receivedValue = Number.isFinite(received) ? received : null
  const change = method === 'cash' ? calculateChange(amountValue, receivedValue) : null
  const missingCash = method === 'cash' && (receivedValue === null || receivedValue < amountValue)
  const aboveBalance = amountValue > subscription.balanceCop
  const invalidAmount = amountValue <= 0 || !Number.isInteger(amountValue)

  const confirm = async (): Promise<void> => {
    setSubmitting(true)
    const registration = await onSubmit({
      subscriptionId: subscription.id,
      amountCop: amountValue,
      method,
      receivedCop: method === 'cash' ? receivedValue : null,
      reference: reference.trim() === '' ? null : reference.trim(),
    })
    setSubmitting(false)
    if (registration) onPaid(registration)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>Registrar pago de la mensualidad</DialogTitle>
          <DialogDescription>
            {subscription.customerName} ·{' '}
            {describeCoverage(subscription.startsAt, subscription.endsAt)}
          </DialogDescription>
        </DialogHeader>

        <p className="plate-display">{subscription.plate}</p>

        {error ? (
          <Alert variant="destructive">
            <AlertTitle>No fue posible registrar el pago</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <dl className="charge-breakdown">
          <div>
            <dt>Costo del periodo</dt>
            <dd className="tabular">{formatCurrency(subscription.amountCop)}</dd>
          </div>
          <div>
            <dt>Abonado</dt>
            <dd className="tabular">{formatCurrency(subscription.paidCop)}</dd>
          </div>
          <div className="charge-total">
            <dt>Saldo pendiente</dt>
            <dd className="tabular">{formatCurrency(subscription.balanceCop)}</dd>
          </div>
        </dl>

        <Field>
          <FieldLabel htmlFor="payment-amount">Pago a registrar</FieldLabel>
          <Input
            id="payment-amount"
            className="min-h-11"
            type="number"
            inputMode="numeric"
            min={0}
            step={1000}
            value={Number.isFinite(amount) ? amount : ''}
            onChange={(event) => setAmount(event.target.valueAsNumber)}
          />
          <FieldDescription>
            {aboveBalance
              ? 'El pago no puede superar el saldo pendiente.'
              : 'Puedes registrar un abono parcial y completar el saldo después.'}
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="payment-method">Medio de pago</FieldLabel>
          <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
            <SelectTrigger id="payment-method" className="min-h-11">
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
          <Field>
            <FieldLabel htmlFor="payment-received">Efectivo recibido</FieldLabel>
            <Input
              id="payment-received"
              className="min-h-11"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={Number.isFinite(received) ? received : ''}
              onChange={(event) => setReceived(event.target.valueAsNumber)}
            />
            <FieldDescription>
              {receivedValue === null
                ? 'El efectivo recibido es obligatorio para pagar en efectivo.'
                : missingCash
                  ? 'El efectivo recibido es menor que el pago.'
                  : `Cambio a entregar: ${formatCurrency(change ?? 0)}`}
            </FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="payment-reference">Referencia (opcional)</FieldLabel>
            <Input
              id="payment-reference"
              className="min-h-11"
              autoComplete="off"
              placeholder="Número de aprobación o comprobante"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={submitting || invalidAmount || aboveBalance || missingCash}
            onClick={() => void confirm()}
          >
            {submitting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            Cobrar {formatCurrency(Number.isFinite(amount) ? amountValue : 0)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
