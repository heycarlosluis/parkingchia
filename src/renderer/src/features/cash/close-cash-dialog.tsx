import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { CashCloseSummary } from '@shared/contracts'
import type { CloseCashSessionInput } from '@shared/cash'
import { formatCurrency } from '@shared/format'
import { MAX_AMOUNT_COP } from '@shared/tariff'
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
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

const closeCashFormSchema = z.object({
  closingAmountCop: z
    .number({ error: 'Ingresa el efectivo contado' })
    .int('El efectivo contado debe ser un valor entero en pesos')
    .min(0, 'El efectivo contado no puede ser negativo')
    .max(MAX_AMOUNT_COP, 'El efectivo contado supera el máximo permitido'),
  notes: z.string().trim().max(200, 'La nota es demasiado larga'),
})

type CloseCashForm = z.infer<typeof closeCashFormSchema>

const EMPTY_FORM: CloseCashForm = { closingAmountCop: 0, notes: '' }

type CloseCashDialogProps = {
  open: boolean
  /** Lo que debería haber en la caja según los cobros del turno. */
  expectedCop: number
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (input: CloseCashSessionInput) => Promise<CashCloseSummary | null>
}

export function CloseCashDialog({
  open,
  expectedCop,
  error,
  onOpenChange,
  onSubmit,
}: CloseCashDialogProps): React.JSX.Element {
  const { handleSubmit, register, reset, control, formState } = useForm<CloseCashForm>({
    resolver: zodResolver(closeCashFormSchema),
    defaultValues: EMPTY_FORM,
  })

  const closingAmountCop = useWatch({ control, name: 'closingAmountCop' })

  useEffect(() => {
    if (open) reset({ ...EMPTY_FORM, closingAmountCop: expectedCop })
  }, [open, reset, expectedCop])

  const counted = Number.isFinite(closingAmountCop) ? closingAmountCop : 0
  const difference = counted - expectedCop

  const submit = handleSubmit(async (values) => {
    const summary = await onSubmit({
      closingAmountCop: values.closingAmountCop,
      notes: values.notes === '' ? null : values.notes,
    })
    if (summary) onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>Cerrar caja</DialogTitle>
          <DialogDescription>
            Cuenta el efectivo y confirma el cierre. La diferencia se compara contra lo esperado
            según los cobros del turno.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible cerrar la caja</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.closingAmountCop)}>
              <FieldLabel htmlFor="cash-closing-amount">Efectivo contado</FieldLabel>
              <Input
                id="cash-closing-amount"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-invalid={Boolean(formState.errors.closingAmountCop)}
                {...register('closingAmountCop', { valueAsNumber: true })}
              />
              <FieldError errors={[formState.errors.closingAmountCop]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="cash-closing-notes">Nota (opcional)</FieldLabel>
              <Input
                id="cash-closing-notes"
                className="min-h-11"
                autoComplete="off"
                placeholder="Observaciones del cierre"
                {...register('notes')}
              />
            </Field>
          </FieldGroup>

          <dl className="charge-breakdown">
            <div>
              <dt>Esperado</dt>
              <dd className="tabular">{formatCurrency(expectedCop)}</dd>
            </div>
            <div className="charge-total">
              <dt>Diferencia</dt>
              <dd className="tabular">
                {difference === 0
                  ? 'Cuadra'
                  : difference > 0
                    ? `Sobra ${formatCurrency(difference)}`
                    : `Falta ${formatCurrency(-difference)}`}
              </dd>
            </div>
          </dl>

          <FieldDescription>
            El cierre es definitivo y no se puede modificar después.
          </FieldDescription>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" data-icon="inline-start" />
              ) : null}
              Cerrar caja
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
