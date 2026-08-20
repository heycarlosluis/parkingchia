import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle } from 'lucide-react'
import { useEffect } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import type { MonthlyPlanDraft, RatePlan } from '@shared/contracts'
import { MAX_AMOUNT_COP, VEHICLE_TYPE_LABELS, vehicleTypeSchema } from '@shared/tariff'
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

const planFormSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, 'El nombre del plan es obligatorio')
    .max(60, 'El nombre del plan es demasiado largo'),
  vehicleType: vehicleTypeSchema,
  amountCop: z
    .number({ error: 'Ingresa el costo mensual' })
    .int('El costo mensual debe ser un valor entero en pesos')
    .min(0, 'El costo mensual no puede ser negativo')
    .max(MAX_AMOUNT_COP, 'El costo mensual supera el máximo permitido'),
  active: z.boolean(),
})

type PlanForm = z.infer<typeof planFormSchema>

const EMPTY_FORM: PlanForm = { name: '', vehicleType: 'car', amountCop: 0, active: true }

function toForm(plan: RatePlan | null): PlanForm {
  if (!plan) return EMPTY_FORM
  return {
    name: plan.name,
    vehicleType: plan.vehicleType,
    amountCop: plan.amountCop,
    active: plan.status === 'active',
  }
}

type MonthlyPlanDialogProps = {
  open: boolean
  plan: RatePlan | null
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (draft: MonthlyPlanDraft) => Promise<boolean>
}

export function MonthlyPlanDialog({
  open,
  plan,
  error,
  onOpenChange,
  onSubmit,
}: MonthlyPlanDialogProps): React.JSX.Element {
  const { control, handleSubmit, register, reset, formState } = useForm<PlanForm>({
    resolver: zodResolver(planFormSchema),
    defaultValues: toForm(plan),
  })

  useEffect(() => {
    if (open) reset(toForm(plan))
  }, [open, plan, reset])

  const submit = handleSubmit(async (values) => {
    const saved = await onSubmit({
      name: values.name,
      vehicleType: values.vehicleType,
      amountCop: values.amountCop,
      status: values.active ? 'active' : 'inactive',
    })
    if (saved) onOpenChange(false)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rate-plan-dialog">
        <DialogHeader>
          <DialogTitle>{plan ? 'Editar plan mensual' : 'Nuevo plan mensual'}</DialogTitle>
          <DialogDescription>
            El costo mensual se propone al crear una mensualidad y puede ajustarse en cada acuerdo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={(event) => void submit(event)} noValidate>
          {error ? (
            <Alert variant="destructive">
              <AlertTitle>No fue posible guardar el plan</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <FieldGroup>
            <Field data-invalid={Boolean(formState.errors.name)}>
              <FieldLabel htmlFor="monthly-plan-name">Nombre</FieldLabel>
              <Input
                id="monthly-plan-name"
                className="min-h-11"
                autoComplete="off"
                placeholder="Mensualidad automóvil"
                aria-invalid={Boolean(formState.errors.name)}
                {...register('name')}
              />
              <FieldError errors={[formState.errors.name]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="monthly-plan-vehicle">Tipo de vehículo</FieldLabel>
              <Controller
                control={control}
                name="vehicleType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="monthly-plan-vehicle" className="min-h-11">
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

            <Field data-invalid={Boolean(formState.errors.amountCop)}>
              <FieldLabel htmlFor="monthly-plan-amount">Costo mensual</FieldLabel>
              <Input
                id="monthly-plan-amount"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={0}
                step={1000}
                aria-invalid={Boolean(formState.errors.amountCop)}
                {...register('amountCop', { valueAsNumber: true })}
              />
              <FieldDescription>
                Pesos colombianos enteros, sin puntos ni centavos.
              </FieldDescription>
              <FieldError errors={[formState.errors.amountCop]} />
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="active"
                render={({ field }) => (
                  <Checkbox
                    id="monthly-plan-active"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="monthly-plan-active">
                Plan disponible para nuevas mensualidades
              </FieldLabel>
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
              {plan ? 'Guardar cambios' : 'Crear plan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
