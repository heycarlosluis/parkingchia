import { zodResolver } from '@hookform/resolvers/zod'
import { Coins, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import {
  graceFromHourSchema,
  graceMinutesSchema,
  MAX_GRACE_FROM_HOUR,
  MAX_GRACE_MINUTES,
  MIN_GRACE_FROM_HOUR,
  MAX_PLENA_HOURS,
  MAX_PLENA_THRESHOLD_HOURS,
  MIN_PLENA_HOURS,
  MIN_PLENA_THRESHOLD_HOURS,
  PLENA_THRESHOLD_MESSAGE,
  plenaHoursSchema,
  plenaThresholdFitsPlena,
  plenaThresholdSchema,
  ROUNDING_STEPS_COP,
  roundingStepSchema,
  TARIFF_CURRENCY_LABEL,
  tariffBillingUnitSchema,
  taxPercentSchema,
  type TariffSettings,
} from '@shared/tariff'
import { formatCurrency } from '@shared/format'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { useTariffStore } from '@/store/tariff-store'

const settingsFormSchema = z
  .object({
    billingUnit: tariffBillingUnitSchema,
    graceMinutes: z.number({ error: 'Ingresa los minutos de gracia' }).pipe(graceMinutesSchema),
    graceFromHour: z
      .number({ error: 'Ingresa desde qué hora aplica la tolerancia' })
      .pipe(graceFromHourSchema),
    taxEnabled: z.boolean(),
    taxPercent: z.number({ error: 'Ingresa el porcentaje de IVA' }).pipe(taxPercentSchema),
    taxIncludedInPrice: z.boolean(),
    plenaThresholdHours: z
      .number({ error: 'Ingresa el umbral de la plena' })
      .pipe(plenaThresholdSchema),
    plenaHours: z.number({ error: 'Ingresa la duración de la plena' }).pipe(plenaHoursSchema),
    roundingStepCop: z.number({ error: 'Selecciona un redondeo' }).pipe(roundingStepSchema),
  })
  .refine(plenaThresholdFitsPlena, {
    path: ['plenaThresholdHours'],
    message: PLENA_THRESHOLD_MESSAGE,
  })

type SettingsFormInput = z.input<typeof settingsFormSchema>
type SettingsForm = z.output<typeof settingsFormSchema>

const toForm = (settings: TariffSettings): SettingsFormInput => ({
  billingUnit: settings.billingUnit,
  graceMinutes: settings.graceMinutes,
  graceFromHour: settings.graceFromHour,
  taxEnabled: settings.taxEnabled,
  taxPercent: settings.taxPercent,
  taxIncludedInPrice: settings.taxIncludedInPrice,
  plenaThresholdHours: settings.plenaThresholdHours,
  plenaHours: settings.plenaHours,
  roundingStepCop: settings.roundingStepCop,
})

export function TariffSettingsCard(): React.JSX.Element {
  const settings = useTariffStore((store) => store.settings)
  const saveSettings = useTariffStore((store) => store.updateSettings)
  const [pendingUnitChange, setPendingUnitChange] = useState<SettingsForm | null>(null)

  const { control, handleSubmit, register, reset, formState } = useForm<
    SettingsFormInput,
    unknown,
    SettingsForm
  >({
    resolver: zodResolver(settingsFormSchema),
    defaultValues: toForm(settings),
  })

  useEffect(() => {
    reset(toForm(settings))
  }, [settings, reset])

  const taxEnabled = useWatch({ control, name: 'taxEnabled' })
  const billingUnit = useWatch({ control, name: 'billingUnit' })
  const graceMinutes = useWatch({ control, name: 'graceMinutes' })
  const graceFromHour = useWatch({ control, name: 'graceFromHour' })
  const plenaThresholdHours = useWatch({ control, name: 'plenaThresholdHours' })
  const plenaHours = useWatch({ control, name: 'plenaHours' })

  const persist = async (values: SettingsForm): Promise<void> => {
    const saved = await saveSettings(values)
    if (saved) reset(values)
  }

  const submit = handleSubmit(async (values) => {
    if (values.billingUnit !== settings.billingUnit) {
      setPendingUnitChange(values)
      return
    }
    await persist(values)
  })

  const confirmUnitChange = async (): Promise<void> => {
    if (!pendingUnitChange) return
    const values = pendingUnitChange
    setPendingUnitChange(null)
    await persist(values)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <Coins aria-hidden="true" /> Configuración de cobro
        </CardTitle>
        <CardDescription>
          Define la unidad de tiempo, la gracia y el impuesto que se aplican a todas las tarifas.
        </CardDescription>
      </CardHeader>
      <form onSubmit={(event) => void submit(event)} noValidate>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="tariff-billing-unit">Unidad de cobro</FieldLabel>
              <Controller
                control={control}
                name="billingUnit"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger id="tariff-billing-unit" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="hour">Por hora</SelectItem>
                        <SelectItem value="minute">Por minuto</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                Por hora se cobra cada hora iniciada. Por minuto se cobra cada minuto iniciado.
              </FieldDescription>
            </Field>

            <Field data-invalid={Boolean(formState.errors.graceMinutes)}>
              <FieldLabel htmlFor="tariff-grace">Tiempo de gracia (tolerancia)</FieldLabel>
              <Input
                id="tariff-grace"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={0}
                max={MAX_GRACE_MINUTES}
                step={1}
                aria-invalid={Boolean(formState.errors.graceMinutes)}
                aria-describedby="tariff-grace-hint"
                {...register('graceMinutes', { valueAsNumber: true })}
              />
              <FieldDescription id="tariff-grace-hint">
                {billingUnit === 'hour'
                  ? `Minutos de tolerancia sobre la fracción. Con ${graceMinutes} min, salir a la hora y ${graceMinutes} cobra una hora; a la hora y ${graceMinutes + 1} cobra dos.`
                  : graceFromHour === 0
                    ? `Minutos iniciales sin costo. Al superarlos se cobra toda la permanencia, porque cobrando por minuto no existe una fracción.`
                    : `Cobrando por minuto la tolerancia solo funciona como minutos iniciales sin costo, así que necesita empezar en la hora 0 para tener efecto.`}
              </FieldDescription>
              <FieldError errors={[formState.errors.graceMinutes]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.graceFromHour)}>
              <FieldLabel htmlFor="tariff-grace-from">
                La tolerancia aplica desde la hora
              </FieldLabel>
              <Input
                id="tariff-grace-from"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={MIN_GRACE_FROM_HOUR}
                max={MAX_GRACE_FROM_HOUR}
                step={1}
                aria-invalid={Boolean(formState.errors.graceFromHour)}
                aria-describedby="tariff-grace-from-hint"
                {...register('graceFromHour', { valueAsNumber: true })}
              />
              <FieldDescription id="tariff-grace-from-hint">
                {graceFromHour === 0
                  ? `La tolerancia también perdona el primer tramo: salir antes de ${graceMinutes} min no genera cobro ni recibo.`
                  : `Las primeras ${graceFromHour === 1 ? 'hora se cobra completa' : `${graceFromHour} horas se cobran completas`} desde el minuto uno. La tolerancia empieza a perdonar al pasar de la hora ${graceFromHour}.`}
              </FieldDescription>
              <FieldError errors={[formState.errors.graceFromHour]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="tariff-currency">Moneda</FieldLabel>
              <Input id="tariff-currency" value={TARIFF_CURRENCY_LABEL} readOnly disabled />
              <FieldDescription>
                Todos los importes se registran como pesos colombianos enteros, sin centavos.
              </FieldDescription>
            </Field>

            <Field orientation="horizontal">
              <Controller
                control={control}
                name="taxEnabled"
                render={({ field }) => (
                  <Checkbox
                    id="tariff-tax-enabled"
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked === true)}
                  />
                )}
              />
              <FieldLabel htmlFor="tariff-tax-enabled">Cobrar IVA</FieldLabel>
            </Field>

            {taxEnabled ? (
              <>
                <Field data-invalid={Boolean(formState.errors.taxPercent)}>
                  <FieldLabel htmlFor="tariff-tax-percent">Porcentaje de IVA</FieldLabel>
                  <Input
                    id="tariff-tax-percent"
                    className="min-h-11"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step={0.5}
                    aria-invalid={Boolean(formState.errors.taxPercent)}
                    {...register('taxPercent', { valueAsNumber: true })}
                  />
                  <FieldDescription>
                    En Colombia el IVA general es 19 %. Admite hasta dos decimales.
                  </FieldDescription>
                  <FieldError errors={[formState.errors.taxPercent]} />
                </Field>

                <Field>
                  <FieldLabel htmlFor="tariff-tax-mode">Cómo se aplica el IVA</FieldLabel>
                  <Controller
                    control={control}
                    name="taxIncludedInPrice"
                    render={({ field }) => (
                      <Select
                        value={field.value ? 'included' : 'added'}
                        onValueChange={(value) => field.onChange(value === 'included')}
                      >
                        <SelectTrigger id="tariff-tax-mode" className="min-h-11">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            <SelectItem value="included">El precio ya incluye el IVA</SelectItem>
                            <SelectItem value="added">El IVA se suma al precio</SelectItem>
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                    )}
                  />
                  <FieldDescription>
                    Determina si el total cambia al activar el impuesto o si solo se discrimina en
                    el recibo.
                  </FieldDescription>
                </Field>
              </>
            ) : null}

            <Field data-invalid={Boolean(formState.errors.plenaThresholdHours)}>
              <FieldLabel htmlFor="tariff-plena-threshold">Umbral de la plena</FieldLabel>
              <Input
                id="tariff-plena-threshold"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={MIN_PLENA_THRESHOLD_HOURS}
                max={MAX_PLENA_THRESHOLD_HOURS}
                step={1}
                disabled={billingUnit !== 'hour'}
                aria-invalid={Boolean(formState.errors.plenaThresholdHours)}
                {...register('plenaThresholdHours', { valueAsNumber: true })}
              />
              <FieldDescription>
                {billingUnit === 'hour'
                  ? `Hasta ${plenaThresholdHours} horas cobradas se cobra por hora. La primera hora que las supera cambia el cobro por la plena de la tarifa.`
                  : 'La plena solo aplica cobrando por hora.'}
              </FieldDescription>
              <FieldError errors={[formState.errors.plenaThresholdHours]} />
            </Field>

            <Field data-invalid={Boolean(formState.errors.plenaHours)}>
              <FieldLabel htmlFor="tariff-plena-hours">Duración de la plena</FieldLabel>
              <Input
                id="tariff-plena-hours"
                className="min-h-11"
                type="number"
                inputMode="numeric"
                min={MIN_PLENA_HOURS}
                max={MAX_PLENA_HOURS}
                step={1}
                disabled={billingUnit !== 'hour'}
                aria-invalid={Boolean(formState.errors.plenaHours)}
                {...register('plenaHours', { valueAsNumber: true })}
              />
              <FieldDescription>
                {billingUnit === 'hour'
                  ? `La plena cubre hasta ${plenaHours} horas. Al superarlas vuelve a cobrarse por hora sobre la plena, y esas horas se convierten en otra plena al pasar de ${plenaThresholdHours}.`
                  : 'La plena solo aplica cobrando por hora.'}
              </FieldDescription>
              <FieldError errors={[formState.errors.plenaHours]} />
            </Field>

            <Field>
              <FieldLabel htmlFor="tariff-rounding">Redondeo del total</FieldLabel>
              <Controller
                control={control}
                name="roundingStepCop"
                render={({ field }) => (
                  <Select
                    value={String(field.value)}
                    onValueChange={(value) => field.onChange(Number(value))}
                  >
                    <SelectTrigger id="tariff-rounding" className="min-h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {ROUNDING_STEPS_COP.map((step) => (
                          <SelectItem key={step} value={String(step)}>
                            {step === 0 ? 'Sin redondeo' : `Al múltiplo de ${formatCurrency(step)}`}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                )}
              />
              <FieldDescription>
                El total se redondea hacia arriba para facilitar el manejo de efectivo.
              </FieldDescription>
            </Field>
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={formState.isSubmitting || !formState.isDirty}>
            {formState.isSubmitting ? (
              <LoaderCircle className="animate-spin" data-icon="inline-start" />
            ) : null}
            {formState.isSubmitting ? 'Guardando…' : 'Guardar configuración'}
          </Button>
        </CardFooter>
      </form>

      <AlertDialog
        open={pendingUnitChange !== null}
        onOpenChange={(open) => {
          if (!open) setPendingUnitChange(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vas a cambiar la unidad de cobro</AlertDialogTitle>
            <AlertDialogDescription>
              Todas las tarifas por tiempo pasarán a cobrarse{' '}
              {pendingUnitChange?.billingUnit === 'minute' ? 'por minuto' : 'por hora'}. Los precios
              no se convierten automáticamente: revísalos antes de operar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => void confirmUnitChange()}>
              Cambiar unidad
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  )
}
