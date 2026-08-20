import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import type { RatePlan, RatePlanDraft } from '@shared/contracts'
import {
  describeBillingUnit,
  graceMinutesSchema,
  MAX_AMOUNT_COP,
  MAX_GRACE_MINUTES,
  VEHICLE_TYPE_LABELS,
  vehicleTypeSchema,
  type TariffBillingUnit,
  type VehicleType,
} from '@shared/tariff'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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

const amountField = (label: string) =>
  z
    .number({ error: `Ingresa ${label}` })
    .int(`${label} debe ser un valor entero en pesos`)
    .min(0, `${label} no puede ser negativo`)
    .max(MAX_AMOUNT_COP, `${label} supera el máximo permitido`)

const planFormSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, 'El nombre de la tarifa es obligatorio')
      .max(60, 'El nombre de la tarifa es demasiado largo'),
    vehicleType: vehicleTypeSchema,
    amountCop: amountField('el precio'),
    minimumChargeCop: amountField('el cobro mínimo'),
    usePlena: z.boolean(),
    plenaCop: z.number().optional(),
    useOwnGrace: z.boolean(),
    graceMinutes: z.number().optional(),
    active: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.usePlena) {
      const parsed = amountField('el valor de la plena').safeParse(value.plenaCop)
      if (!parsed.success) {
        context.addIssue({
          code: 'custom',
          path: ['plenaCop'],
          message: parsed.error.issues[0]?.message ?? 'Ingresa el valor de la plena',
        })
      } else if (parsed.data < value.minimumChargeCop) {
        context.addIssue({
          code: 'custom',
          path: ['plenaCop'],
          message: 'La plena no puede costar menos que el cobro mínimo',
        })
      }
    }
    if (value.useOwnGrace) {
      const parsed = graceMinutesSchema.safeParse(value.graceMinutes)
      if (!parsed.success) {
        context.addIssue({
          code: 'custom',
          path: ['graceMinutes'],
          message: parsed.error.issues[0]?.message ?? 'Ingresa los minutos de gracia',
        })
      }
    }
  })

type PlanForm = z.infer<typeof planFormSchema>

const EMPTY_FORM: PlanForm = {
  name: '',
  vehicleType: 'car',
  amountCop: 0,
  minimumChargeCop: 0,
  usePlena: false,
  useOwnGrace: false,
  active: true,
}

function toForm(plan: RatePlan | null): PlanForm {
  if (!plan) return EMPTY_FORM
  return {
    name: plan.name,
    vehicleType: plan.vehicleType,
    amountCop: plan.amountCop,
    minimumChargeCop: plan.minimumChargeCop,
    usePlena: plan.plenaCop !== null,
    ...(plan.plenaCop === null ? {} : { plenaCop: plan.plenaCop }),
    useOwnGrace: plan.graceMinutes !== null,
    ...(plan.graceMinutes === null ? {} : { graceMinutes: plan.graceMinutes }),
    active: plan.status === 'active',
  }
}

type RatePlanDialogProps = {
  open: boolean
  plan: RatePlan | null
  billingUnit: TariffBillingUnit
  graceMinutes: number
  plenaThresholdHours: number
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: RatePlanDraft) => Promise<boolean>
}

export function RatePlanDialog({
  open,
  plan,
  billingUnit,
  graceMinutes,
  plenaThresholdHours,
  error,
  onOpenChange,
  onSubmit,
}: RatePlanDialogProps): React.JSX.Element {
  const { control, handleSubmit, register, reset, formState } = useForm<PlanForm>({
    resolver: zodResolver(planFormSchema),
    defaultValues: toForm(plan),
  })

  useEffect(() => {
    if (open) reset(toForm(plan))
  }, [open, plan, reset])

  const usePlena = useWatch({ control, name: 'usePlena' })
  const useOwnGrace = useWatch({ control, name: 'useOwnGrace' })

  const submit = handleSubmit(async (values) => {
    const saved = await onSubmit({
      name: values.name,
      vehicleType: values.vehicleType,
      amountCop: values.amountCop,
      minimumChargeCop: values.minimumChargeCop,
      plenaCop: values.usePlena ? (values.plenaCop ?? 0) : null,
      graceMinutes: values.useOwnGrace ? (values.graceMinutes ?? 0) : null,
      status: values.active ? 'active' : 'inactive',
    })
    if (saved) onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar tarifa' : 'Nueva tarifa'}</DialogTitle>
          <DialogDescription>
            El precio corresponde a una {describeBillingUnit(billingUnit)} de parqueo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible guardar la tarifa</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.name)}>
              <FieldLabel htmlFor="plan-name">Nombre</FieldLabel>
              <Input
                id="plan-name"
                className="min-h-11"
                autoComplete="off"
                placeholder="Automóvil estándar"
                aria-invalid={Boolean(formState.errors.name)}
                {...register('name')}
              />
              <FieldError errors={[formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="plan-vehicle">Tipo de vehículo</FieldLabel>
              <Controller
                control={control}
                name="vehicleType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="plan-vehicle" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {Object.entries(VEHICLE_TYPE_LABELS).map(([value, label]) => (
                          <SelectItem key={value} value={value as VehicleType}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>

            <Field data-invalid={Boolean(formState.errors.amountCop)}>
              <FieldLabel htmlFor="plan-amount">
                Precio por {describeBillingUnit(billingUnit)}
              </FieldLabel>
              <Input
                id="plan-amount"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={0}
                step={50}
                aria-invalid={Boolean(formState.errors.amountCop)}
                {...register('amountCop', { valueAsNumber: true })}
              />
              <FieldDescription>
                Pesos colombianos enteros, sin puntos ni centavos.
              </FieldDescription>
              <FieldError errors={[formState.errors.amountCop]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.minimumChargeCop)}>
              <FieldLabel htmlFor="plan-minimum">Cobro mínimo</FieldLabel>
              <Input
                id="plan-minimum"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={0}
                step={50}
                aria-invalid={Boolean(formState.errors.minimumChargeCop)}
                {...register('minimumChargeCop', { valueAsNumber: true })}
              />
              <FieldDescription>
                Se aplica cuando el tiempo cobrado queda por debajo de este valor. Usa 0 para no
                exigir un mínimo.
              </FieldDescription>
              <FieldError errors={[formState.errors.minimumChargeCop]} />
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="usePlena"
                render={({ field }) => (
                  <Checkbox
                    id="plan-use-plena"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="plan-use-plena">Cobrar plena (día completo)</FieldLabel>
            </Field>

            {usePlena ? (
              <Field data-invalid={Boolean(formState.errors.plenaCop)}>
                <FieldLabel htmlFor="plan-plena">Valor de la plena</FieldLabel>
                <Input
                  id="plan-plena"
                  className="min-h-11"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  aria-invalid={Boolean(formState.errors.plenaCop)}
                  {...register('plenaCop', { valueAsNumber: true })}
                />
                <FieldDescription>
                  Se cobra al llegar al umbral de {plenaThresholdHours} horas y cubre el día
                  completo.
                </FieldDescription>
                <FieldError errors={[formState.errors.plenaCop]} />
              </Field>
            ) : null}

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="useOwnGrace"
                render={({ field }) => (
                  <Checkbox
                    id="plan-use-grace"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="plan-use-grace">Usar una tolerancia propia</FieldLabel>
            </Field>

            {useOwnGrace ? (
              <Field data-invalid={Boolean(formState.errors.graceMinutes)}>
                <FieldLabel htmlFor="plan-grace">Tolerancia de esta tarifa</FieldLabel>
                <Input
                  id="plan-grace"
                  className="min-h-11"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MAX_GRACE_MINUTES}
                  step={1}
                  aria-invalid={Boolean(formState.errors.graceMinutes)}
                  {...register('graceMinutes', { valueAsNumber: true })}
                />
                <FieldError errors={[formState.errors.graceMinutes]} />
              </Field>
            ) : (
              <p className="field-hint">
                Esta tarifa usa la tolerancia general de {graceMinutes} minutos.
              </p>
            )}

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Checkbox
                    id="plan-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="plan-active">Tarifa disponible para cobrar</FieldLabel>
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
              {plan ? 'Guardar cambios' : 'Crear tarifa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
