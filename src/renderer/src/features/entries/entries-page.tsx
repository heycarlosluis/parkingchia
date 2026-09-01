import { zodResolver } from '@hookform/resolvers/zod'
import {
  Bike,
  Car,
  CheckCircle2,
  CircleEllipsis,
  LoaderCircle,
  LogIn,
  Motorbike,
  Plus,
  Printer,
  Settings2,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import type { EntryRegistration, MonthlyCoverage } from '@shared/contracts'
import { describeCoverage } from '@shared/monthly'
import {
  describeBillingUnit,
  VEHICLE_TYPE_LABELS,
  vehicleTypeSchema,
  type VehicleType,
} from '@shared/tariff'
import { formatCurrency, formatDateTime } from '@shared/format'
import {
  isValidPlate,
  MAX_PLATE_LENGTH,
  normalizePlate,
  plateSchema,
  sanitizePlateInput,
} from '@shared/validation'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { RadioCards } from '@/components/ui/radio-cards'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PageHeading } from '@/components/page-heading'
import { useCashStore } from '@/store/cash-store'
import { useParkingStore } from '@/store/parking-store'
import { useTariffStore } from '@/store/tariff-store'

const entryFormSchema = z.object({
  plate: plateSchema,
  vehicleType: vehicleTypeSchema,
  ratePlanId: z.string().min(1, 'Selecciona una tarifa'),
  notes: z.string().trim().max(200, 'La nota es demasiado larga'),
})

type EntryFormInput = z.input<typeof entryFormSchema>
type EntryForm = z.output<typeof entryFormSchema>

const VEHICLE_TYPE_ICONS: Record<VehicleType, LucideIcon> = {
  car: Car,
  motorcycle: Motorbike,
  bicycle: Bike,
  other: CircleEllipsis,
}

// El orden del esquema fija el orden visible y obliga a cubrir todos los tipos.
const VEHICLE_TYPE_ORDER: readonly VehicleType[] = vehicleTypeSchema.options

export function EntriesPage(): React.JSX.Element {
  const initializeTariffs = useTariffStore((store) => store.initialize)
  const settings = useTariffStore((store) => store.settings)
  const plans = useTariffStore((store) => store.plans)
  const registerEntry = useParkingStore((store) => store.registerEntry)
  const error = useParkingStore((store) => store.error)
  const clearError = useParkingStore((store) => store.clearError)
  const cashSession = useCashStore((store) => store.session)
  const cashLoading = useCashStore((store) => store.loading)
  const [registration, setRegistration] = useState<EntryRegistration | null>(null)
  const [coverage, setCoverage] = useState<MonthlyCoverage | null>(null)
  const [registeredCoverage, setRegisteredCoverage] = useState<MonthlyCoverage | null>(null)
  const [reprinting, setReprinting] = useState(false)
  const [reprintMessage, setReprintMessage] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const continueRef = useRef<HTMLButtonElement>(null)

  const { control, handleSubmit, register, reset, setFocus, setValue, formState } = useForm<
    EntryFormInput,
    unknown,
    EntryForm
  >({
    resolver: zodResolver(entryFormSchema),
    defaultValues: { plate: '', vehicleType: 'car', ratePlanId: '', notes: '' },
  })

  useEffect(() => {
    void initializeTariffs()
  }, [initializeTariffs])

  const activePlans = useMemo(() => plans.filter((plan) => plan.status === 'active'), [plans])
  const vehicleType = useWatch({ control, name: 'vehicleType' })
  const selectedPlanId = useWatch({ control, name: 'ratePlanId' })
  const plate = useWatch({ control, name: 'plate' })

  // Avisa cuando la matrícula pertenece a un cliente mensual vigente.
  useEffect(() => {
    const normalized = normalizePlate(plate ?? '')
    if (!isValidPlate(normalized)) return
    let cancelled = false
    const timeout = window.setTimeout(() => {
      void window.parkingAPI.findMonthlyCoverage({ plate: normalized }).then((result) => {
        if (!cancelled && result.ok) setCoverage(result.data)
      })
    }, 300)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [plate])

  const plateIsValid = isValidPlate(normalizePlate(plate ?? ''))
  const billingUnitLabel = settings.billingUnit === 'hour' ? 'hora' : 'minuto'

  // Solo se ofrece un tipo de vehículo cuando alguna tarifa activa lo cubre: sin
  // tarifa no hay con qué cobrar la salida.
  const vehicleTypeOptions = useMemo(
    () =>
      VEHICLE_TYPE_ORDER.filter((type) =>
        activePlans.some((plan) => plan.vehicleType === type),
      ).map((type) => ({
        value: type,
        label: VEHICLE_TYPE_LABELS[type],
        icon: VEHICLE_TYPE_ICONS[type],
      })),
    [activePlans],
  )
  const hidesVehicleTypes = vehicleTypeOptions.length < VEHICLE_TYPE_ORDER.length

  // Si se desactiva la tarifa del tipo elegido, la selección pasa al primero disponible.
  useEffect(() => {
    const fallback = vehicleTypeOptions[0]
    if (!fallback) return
    if (vehicleTypeOptions.some((option) => option.value === vehicleType)) return
    setValue('vehicleType', fallback.value)
  }, [vehicleTypeOptions, vehicleType, setValue])

  const suggestedPlans = useMemo(
    () => activePlans.filter((plan) => plan.vehicleType === vehicleType),
    [activePlans, vehicleType],
  )

  useEffect(() => {
    const stillValid = suggestedPlans.some((plan) => plan.id === selectedPlanId)
    if (!stillValid) setValue('ratePlanId', suggestedPlans[0]?.id ?? '')
  }, [suggestedPlans, selectedPlanId, setValue])

  const submit = handleSubmit(async (values) => {
    const created = await registerEntry({
      plate: values.plate,
      vehicleType: values.vehicleType,
      ratePlanId: values.ratePlanId,
      notes: values.notes === '' ? null : values.notes,
    })
    if (!created) return
    setRegistration(created)
    setRegisteredCoverage(coverage)
    setCoverage(null)
    setReprintMessage('')
    reset({ plate: '', vehicleType: values.vehicleType, ratePlanId: values.ratePlanId, notes: '' })
  })

  const reprintEntry = async (): Promise<void> => {
    if (!registration) return
    setReprinting(true)
    setReprintMessage('')
    const result = await window.parkingAPI.reprintEntryTicket({
      sessionId: registration.sessionId,
    })
    setReprinting(false)
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  // Registrado el ingreso, Enter debe encadenar con el siguiente sin tocar el ratón.
  useEffect(() => {
    if (registration) continueRef.current?.focus()
  }, [registration])

  const printStatus = reprintMessage === '' ? (registration?.printMessage ?? '') : reprintMessage

  const startAnother = (): void => {
    setRegistration(null)
    setRegisteredCoverage(null)
    setReprintMessage('')
    setNotesOpen(false)
    clearError()
    setFocus('plate')
  }

  if (activePlans.length === 0) {
    return (
      <div className="page-stack quick-page">
        <PageHeading
          title="Registrar ingreso"
          description="Captura la matrícula, el tipo de vehículo y la tarifa que se aplicará."
        />
        <Alert variant="warning">
          <AlertTitle>Todavía no hay tarifas activas</AlertTitle>
          <AlertDescription>
            Crea al menos una tarifa activa en Configuración antes de registrar ingresos.
          </AlertDescription>
          <AlertActions>
            <Button variant="outline" size="sm" asChild>
              <Link to="/configuracion?tab=tarifas">
                <Settings2 data-icon="inline-start" />
                Ir a Configuración
              </Link>
            </Button>
          </AlertActions>
        </Alert>
      </div>
    )
  }

  return (
    <div className="page-stack quick-page">
      <header className="quick-heading">
        <h1>Registrar ingreso</h1>
        <p>Escribe la matrícula y presiona Enter.</p>
      </header>

      {!cashLoading && !cashSession ? (
        <Alert variant="warning">
          <AlertTitle>No hay una caja abierta</AlertTitle>
          <AlertDescription>Abre la caja del turno antes de registrar ingresos.</AlertDescription>
          <AlertActions>
            <Button variant="outline" size="sm" asChild>
              <Link to="/caja">Abrir caja</Link>
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No fue posible registrar el ingreso</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {registration ? (
        <Card className="quick-card">
          <CardContent className="quick-done">
            <p className="quick-done-title">
              <CheckCircle2 aria-hidden="true" /> Ingreso registrado
            </p>
            <p className="quick-done-plate">{registration.plate}</p>
            <dl className="charge-breakdown">
              <div>
                <dt>Vehículo</dt>
                <dd>{VEHICLE_TYPE_LABELS[registration.vehicleType]}</dd>
              </div>
              <div>
                <dt>Tarifa</dt>
                <dd>{registration.ratePlanName}</dd>
              </div>
              <div>
                <dt>Costo por {describeBillingUnit(registration.billingUnit)}</dt>
                <dd className="tabular">{formatCurrency(registration.ratePlanAmountCop)}</dd>
              </div>
              <div>
                <dt>Fecha y hora de ingreso</dt>
                <dd className="tabular">{formatDateTime(registration.enteredAt)}</dd>
              </div>
              <div>
                <dt>Tolerancia</dt>
                <dd className="tabular">{registration.graceMinutes} min</dd>
              </div>
            </dl>
            {registeredCoverage ? (
              <p className="field-hint">
                <Badge variant="secondary">Mensualidad</Badge> {registeredCoverage.customerName} ·{' '}
                {describeCoverage(registeredCoverage.startsAt, registeredCoverage.endsAt)}. La
                salida no generará cobro mientras esté vigente.
              </p>
            ) : null}
            <div className="stable-status" role="status" aria-live="polite">
              {printStatus === '' ? null : (
                <>
                  <Printer aria-hidden="true" />
                  {printStatus}
                </>
              )}
            </div>
          </CardContent>
          <CardFooter className="quick-actions">
            <Button ref={continueRef} type="button" size="lg" onClick={startAnother}>
              <LogIn data-icon="inline-start" />
              Registrar otro ingreso
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => void reprintEntry()}
              disabled={reprinting}
            >
              <Printer data-icon="inline-start" />
              {reprinting ? 'Imprimiendo…' : 'Reimprimir tiquete'}
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card className="quick-card">
          <form onSubmit={(event) => void submit(event)} noValidate>
            <CardContent className="quick-form">
              <Field data-invalid={Boolean(formState.errors.plate)} className="quick-plate-field">
                <FieldLabel htmlFor="entry-plate">Matrícula</FieldLabel>
                <Controller
                  control={control}
                  name="plate"
                  render={({ field }) => (
                    <input
                      id="entry-plate"
                      className="plate-input"
                      autoComplete="off"
                      autoFocus
                      spellCheck={false}
                      enterKeyHint="done"
                      maxLength={MAX_PLATE_LENGTH}
                      placeholder="ABC123"
                      aria-invalid={Boolean(formState.errors.plate)}
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      // El campo solo llega a contener letras y dígitos.
                      onChange={(event) => field.onChange(sanitizePlateInput(event.target.value))}
                    />
                  )}
                />
                <FieldError errors={[formState.errors.plate]} />
                {plateIsValid && coverage ? (
                  <p className="field-hint">
                    <Badge variant="secondary">Mensualidad</Badge> {coverage.customerName} ·{' '}
                    {describeCoverage(coverage.startsAt, coverage.endsAt)}
                  </p>
                ) : null}
              </Field>

              <FieldSet>
                <FieldLegend className="sr-only">Tipo de vehículo</FieldLegend>
                <Controller
                  control={control}
                  name="vehicleType"
                  render={({ field }) => (
                    <RadioCards
                      name="entry-vehicle-type"
                      options={vehicleTypeOptions}
                      value={field.value}
                      onValueChange={(value) => field.onChange(value as VehicleType)}
                    />
                  )}
                />
                {hidesVehicleTypes ? (
                  <FieldDescription>
                    Solo aparecen los tipos con una tarifa activa. Los demás se activan desde
                    Configuración.
                  </FieldDescription>
                ) : null}
              </FieldSet>

              {/* Con una sola tarifa aplicable no hay nada que elegir: se muestra y ya. */}
              {suggestedPlans.length === 1 ? (
                <p className="entry-rate-summary">
                  <span>{suggestedPlans[0]?.name}</span>
                  <span className="tabular">
                    {formatCurrency(suggestedPlans[0]?.amountCop ?? 0)} por {billingUnitLabel}
                  </span>
                </p>
              ) : (
                <Field data-invalid={Boolean(formState.errors.ratePlanId)}>
                  <FieldLabel htmlFor="entry-rate-plan">Tarifa</FieldLabel>
                  <Controller
                    control={control}
                    name="ratePlanId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="entry-rate-plan" className="min-h-12">
                          <SelectValue placeholder="Selecciona una tarifa" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {suggestedPlans.map((plan) => (
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
              )}

              <Button
                type="submit"
                size="lg"
                className="quick-submit"
                disabled={formState.isSubmitting}
              >
                {formState.isSubmitting ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <LogIn data-icon="inline-start" />
                )}
                {formState.isSubmitting ? 'Registrando…' : 'Registrar ingreso'}
              </Button>

              {/* La nota es excepcional: fuera del camino rápido hasta que se pida. */}
              {notesOpen ? (
                <Field data-invalid={Boolean(formState.errors.notes)}>
                  <FieldLabel htmlFor="entry-notes">Nota</FieldLabel>
                  <Input
                    id="entry-notes"
                    className="min-h-12"
                    autoComplete="off"
                    autoFocus
                    placeholder="Casco entregado, puesto 12…"
                    {...register('notes')}
                  />
                  <FieldError errors={[formState.errors.notes]} />
                </Field>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="entry-notes-toggle"
                  onClick={() => setNotesOpen(true)}
                >
                  <Plus data-icon="inline-start" />
                  Agregar nota
                </Button>
              )}

              <p className="entry-terms">
                Se cobra por {billingUnitLabel} con {settings.graceMinutes} minutos de tolerancia
                {settings.billingUnit === 'hour' && settings.graceFromHour > 0
                  ? ` a partir de la hora ${settings.graceFromHour}`
                  : ''}
                .
              </p>
            </CardContent>
          </form>
        </Card>
      )}
    </div>
  )
}
