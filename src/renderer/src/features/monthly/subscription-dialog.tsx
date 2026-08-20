import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { MonthlyCustomer, RatePlan, SubscriptionDraft } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import {
  coverageEndDate,
  formatLocalDate,
  isRealLocalDate,
  MAX_SUBSCRIPTION_MONTHS,
  MIN_SUBSCRIPTION_MONTHS,
  todayLocalDate,
} from '@shared/monthly'
import { MAX_AMOUNT_COP, VEHICLE_TYPE_LABELS, vehicleTypeSchema } from '@shared/tariff'
import { normalizePlate } from '@shared/validation'
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const MONTH_OPTIONS = Array.from(
  { length: MAX_SUBSCRIPTION_MONTHS - MIN_SUBSCRIPTION_MONTHS + 1 },
  (_, index) => MIN_SUBSCRIPTION_MONTHS + index,
)

const dateField = z
  .string()
  .trim()
  .min(1, 'Selecciona la fecha')
  .refine(isRealLocalDate, 'Usa una fecha válida')

const subscriptionFormSchema = z
  .object({
    customerId: z.string().min(1, 'Selecciona el cliente'),
    plate: z
      .string()
      .trim()
      .min(3, 'La matrícula debe tener al menos 3 caracteres')
      .max(8, 'La matrícula debe tener máximo 8 caracteres')
      .regex(/^[A-Za-z0-9]+$/, 'Usa únicamente letras y números'),
    vehicleType: vehicleTypeSchema,
    ratePlanId: z.string().min(1, 'Selecciona el plan mensual'),
    startDate: dateField,
    months: z.number().int().min(MIN_SUBSCRIPTION_MONTHS).max(MAX_SUBSCRIPTION_MONTHS),
    endDate: dateField,
    amountCop: z
      .number({ error: 'Ingresa el costo de la mensualidad' })
      .int('El costo debe ser un valor entero en pesos')
      .min(0, 'El costo no puede ser negativo')
      .max(MAX_AMOUNT_COP, 'El costo supera el máximo permitido'),
    notes: z.string().trim().max(200, 'La nota es demasiado larga'),
  })
  .refine((value) => value.endDate >= value.startDate, {
    message: 'La fecha final no puede ser anterior a la inicial',
    path: ['endDate'],
  })

type SubscriptionForm = z.infer<typeof subscriptionFormSchema>

function emptyForm(): SubscriptionForm {
  const startDate = todayLocalDate()
  return {
    customerId: '',
    plate: '',
    vehicleType: 'car',
    ratePlanId: '',
    startDate,
    months: 1,
    endDate: coverageEndDate(startDate, 1),
    amountCop: 0,
    notes: '',
  }
}

type SubscriptionDialogProps = {
  open: boolean
  customers: MonthlyCustomer[]
  plans: RatePlan[]
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: SubscriptionDraft) => Promise<boolean>
}

export function SubscriptionDialog({
  open,
  customers,
  plans,
  error,
  onOpenChange,
  onSubmit,
}: SubscriptionDialogProps): React.JSX.Element {
  const { control, handleSubmit, register, reset, setValue, formState } = useForm<SubscriptionForm>(
    { resolver: zodResolver(subscriptionFormSchema), defaultValues: emptyForm() },
  )

  const activeCustomers = customers.filter((customer) => customer.status === 'active')
  const activePlans = plans.filter((plan) => plan.status === 'active')

  useEffect(() => {
    if (open) reset(emptyForm())
  }, [open, reset])

  const ratePlanId = useWatch({ control, name: 'ratePlanId' })
  const startDate = useWatch({ control, name: 'startDate' })
  const months = useWatch({ control, name: 'months' })
  const endDate = useWatch({ control, name: 'endDate' })

  /** El plan define el costo sugerido y el tipo de vehículo, sin bloquearlos. */
  const appliedPlan = useRef('')
  useEffect(() => {
    if (!ratePlanId || appliedPlan.current === ratePlanId) return
    const plan = activePlans.find((candidate) => candidate.id === ratePlanId)
    if (!plan) return
    appliedPlan.current = ratePlanId
    setValue('amountCop', plan.amountCop, { shouldValidate: true })
    setValue('vehicleType', plan.vehicleType)
  }, [ratePlanId, activePlans, setValue])

  /** La fecha final se recalcula al mover el inicio o la duración. */
  useEffect(() => {
    if (!startDate || !isRealLocalDate(startDate)) return
    setValue('endDate', coverageEndDate(startDate, months), { shouldValidate: true })
  }, [startDate, months, setValue])

  const submit = handleSubmit(async (values) => {
    const saved = await onSubmit({
      customerId: values.customerId,
      plate: normalizePlate(values.plate),
      vehicleType: values.vehicleType,
      ratePlanId: values.ratePlanId,
      startDate: values.startDate,
      endDate: values.endDate,
      amountCop: values.amountCop,
      notes: values.notes === '' ? null : values.notes,
    })
    if (saved) onOpenChange(false)
  })

  const missingRequirements = activeCustomers.length === 0 || activePlans.length === 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>Nueva mensualidad</DialogTitle>
          <DialogDescription>
            El cliente paga un periodo por adelantado y su vehículo entra y sale sin cobro por horas
            mientras esté vigente.
          </DialogDescription>
        </DialogHeader>

        {missingRequirements ? (
          <Alert>
            <AlertTitle>Falta información para crear la mensualidad</AlertTitle>
            <AlertDescription>
              {activeCustomers.length === 0
                ? 'Crea primero un cliente en la pestaña Clientes.'
                : 'Crea primero un plan mensual en la pestaña Planes.'}
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmit={(event) => void submit(event)} noValidate>
            {error ? (
              <Alert variant="destructive">
                <AlertTitle>No fue posible crear la mensualidad</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}

            <FieldGroup>
              <Field data-invalid={Boolean(formState.errors.customerId)}>
                <FieldLabel htmlFor="subscription-customer">Cliente</FieldLabel>
                <Controller
                  control={control}
                  name="customerId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="subscription-customer" className="min-h-11">
                        <SelectValue placeholder="Selecciona el cliente" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {activeCustomers.map((customer) => (
                            <SelectItem key={customer.id} value={customer.id}>
                              {customer.fullName}
                              {customer.documentNumber === null
                                ? ''
                                : ` · ${customer.documentNumber}`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[formState.errors.customerId]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.ratePlanId)}>
                <FieldLabel htmlFor="subscription-plan">Plan mensual</FieldLabel>
                <Controller
                  control={control}
                  name="ratePlanId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="subscription-plan" className="min-h-11">
                        <SelectValue placeholder="Selecciona el plan" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {activePlans.map((plan) => (
                            <SelectItem key={plan.id} value={plan.id}>
                              {plan.name} · {formatCurrency(plan.amountCop)}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldError errors={[formState.errors.ratePlanId]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.plate)}>
                <FieldLabel htmlFor="subscription-plate">Matrícula</FieldLabel>
                <Input
                  id="subscription-plate"
                  className="min-h-11 plate-input"
                  autoComplete="off"
                  placeholder="ABC123"
                  aria-invalid={Boolean(formState.errors.plate)}
                  {...register('plate', {
                    setValueAs: (value: string) => value.toUpperCase().trim(),
                  })}
                />
                <FieldDescription>
                  Es el mismo vehículo que se registra al ingresar al parqueadero.
                </FieldDescription>
                <FieldError errors={[formState.errors.plate]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="subscription-vehicle">Tipo de vehículo</FieldLabel>
                <Controller
                  control={control}
                  name="vehicleType"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="subscription-vehicle" className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
              </Field>

              <Field data-invalid={Boolean(formState.errors.startDate)}>
                <FieldLabel htmlFor="subscription-start">Fecha de inicio</FieldLabel>
                <Input
                  id="subscription-start"
                  className="min-h-11"
                  type="date"
                  aria-invalid={Boolean(formState.errors.startDate)}
                  {...register('startDate')}
                />
                <FieldError errors={[formState.errors.startDate]} />
              </Field>

              <Field>
                <FieldLabel htmlFor="subscription-months">Duración</FieldLabel>
                <Controller
                  control={control}
                  name="months"
                  render={({ field }) => (
                    <Select
                      value={String(field.value)}
                      onValueChange={(value) => field.onChange(Number(value))}
                    >
                      <SelectTrigger id="subscription-months" className="min-h-11">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {MONTH_OPTIONS.map((option) => (
                            <SelectItem key={option} value={String(option)}>
                              {option === 1 ? '1 mes' : `${option} meses`}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  )}
                />
                <FieldDescription>
                  Ajusta la fecha final si el acuerdo no cubre meses completos.
                </FieldDescription>
              </Field>

              <Field data-invalid={Boolean(formState.errors.endDate)}>
                <FieldLabel htmlFor="subscription-end">Fecha final</FieldLabel>
                <Input
                  id="subscription-end"
                  className="min-h-11"
                  type="date"
                  aria-invalid={Boolean(formState.errors.endDate)}
                  {...register('endDate')}
                />
                <FieldDescription>
                  {isRealLocalDate(endDate ?? '')
                    ? `Último día cubierto. La mensualidad vence al terminar el ${formatLocalDate(endDate)}.`
                    : 'Último día cubierto por la mensualidad.'}
                </FieldDescription>
                <FieldError errors={[formState.errors.endDate]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.amountCop)}>
                <FieldLabel htmlFor="subscription-amount">Costo de la mensualidad</FieldLabel>
                <Input
                  id="subscription-amount"
                  className="min-h-11"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  aria-invalid={Boolean(formState.errors.amountCop)}
                  {...register('amountCop', { valueAsNumber: true })}
                />
                <FieldDescription>
                  Se sugiere el costo del plan; cámbialo si acordaste otro valor.
                </FieldDescription>
                <FieldError errors={[formState.errors.amountCop]} />
              </Field>

              <Field data-invalid={Boolean(formState.errors.notes)}>
                <FieldLabel htmlFor="subscription-notes">Nota (opcional)</FieldLabel>
                <Input
                  id="subscription-notes"
                  className="min-h-11"
                  autoComplete="off"
                  placeholder="Cupo cubierto, contacto alterno…"
                  {...register('notes')}
                />
                <FieldError errors={[formState.errors.notes]} />
              </Field>
            </FieldGroup>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : null}
                Crear mensualidad
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
