import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, LoaderCircle, LogIn, Printer, Settings2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import type { EntryRegistration, MonthlyCoverage } from '@shared/contracts'
import { describeCoverage } from '@shared/monthly'
import { VEHICLE_TYPE_LABELS, vehicleTypeSchema, type VehicleType } from '@shared/tariff'
import { formatCurrency } from '@shared/format'
import { isValidPlate, normalizePlate, plateSchema } from '@shared/validation'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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

  const suggestedPlans = useMemo(() => {
    const matching = activePlans.filter((plan) => plan.vehicleType === vehicleType)
    return matching.length > 0 ? matching : activePlans
  }, [activePlans, vehicleType])

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
    reset({ plate: '', vehicleType: values.vehicleType, ratePlanId: values.ratePlanId, notes: '' })
  })

  const startAnother = (): void => {
    setRegistration(null)
    setRegisteredCoverage(null)
    clearError()
    setFocus('plate')
  }

  if (activePlans.length === 0) {
    return (
      <div className="page-stack narrow-page">
        <PageHeading
          title="Registrar ingreso"
          description="Captura la matrícula, el tipo de vehículo y la tarifa que se aplicará."
        />
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>Todavía no hay tarifas activas</AlertTitle>
          <AlertDescription className="alert-with-action">
            <p>Crea al menos una tarifa activa en Configuración antes de registrar ingresos.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/configuracion?tab=tarifas">
                <Settings2 data-icon="inline-start" />
                Ir a Configuración
              </Link>
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="page-stack narrow-page">
      <PageHeading
        title="Registrar ingreso"
        description="Captura la matrícula, el tipo de vehículo y la tarifa que se aplicará."
      />

      {!cashLoading && !cashSession ? (
        <Alert>
          <TriangleAlert aria-hidden="true" />
          <AlertTitle>No hay una caja abierta</AlertTitle>
          <AlertDescription className="alert-with-action">
            <p>Abre la caja del turno antes de registrar ingresos.</p>
            <Button variant="outline" size="sm" asChild>
              <Link to="/caja">Abrir caja</Link>
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No fue posible registrar el ingreso</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {registration ? (
        <Card>
          <CardHeader>
            <CardTitle className="title-with-icon">
              <CheckCircle2 aria-hidden="true" /> Ingreso registrado
            </CardTitle>
            <CardDescription>
              El vehículo quedó en parqueo activo y ya puede cobrarse a la salida.
            </CardDescription>
          </CardHeader>
          <CardContent className="settings-section-content">
            <p className="plate-display">{registration.plate}</p>
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
                <dt>Hora de ingreso</dt>
                <dd className="tabular">
                  {new Date(registration.enteredAt).toLocaleTimeString('es-CO', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </dd>
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
            <p className="field-hint">
              <Printer aria-hidden="true" data-icon="inline-start" />
              {registration.printMessage}
            </p>
          </CardContent>
          <CardFooter>
            <Button type="button" onClick={startAnother}>
              <LogIn data-icon="inline-start" />
              Registrar otro ingreso
            </Button>
          </CardFooter>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Datos del vehículo</CardTitle>
            <CardDescription>
              La matrícula se normaliza en mayúsculas y sin espacios.
            </CardDescription>
          </CardHeader>
          <form onSubmit={(event) => void submit(event)} noValidate>
            <CardContent>
              <FieldGroup>
                <Field data-invalid={Boolean(formState.errors.plate)}>
                  <FieldLabel htmlFor="entry-plate">Matrícula</FieldLabel>
                  <input
                    id="entry-plate"
                    className="plate-input"
                    autoComplete="off"
                    autoFocus
                    placeholder="ABC123"
                    aria-invalid={Boolean(formState.errors.plate)}
                    {...register('plate')}
                  />
                  <FieldError errors={[formState.errors.plate]} />
                  {plateIsValid && coverage ? (
                    <p className="field-hint">
                      <Badge variant="secondary">Mensualidad</Badge> {coverage.customerName} ·{' '}
                      {describeCoverage(coverage.startsAt, coverage.endsAt)}
                    </p>
                  ) : null}
                </Field>

                <Field>
                  <FieldLabel htmlFor="entry-vehicle-type">Tipo de vehículo</FieldLabel>
                  <Controller
                    control={control}
                    name="vehicleType"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="entry-vehicle-type" className="min-h-11">
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

                <Field data-invalid={Boolean(formState.errors.ratePlanId)}>
                  <FieldLabel htmlFor="entry-rate-plan">Tarifa</FieldLabel>
                  <Controller
                    control={control}
                    name="ratePlanId"
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger id="entry-rate-plan" className="min-h-11">
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
                  <FieldDescription>
                    Se cobra por {settings.billingUnit === 'hour' ? 'hora' : 'minuto'} con{' '}
                    {settings.graceMinutes} minutos de tolerancia.
                  </FieldDescription>
                  <FieldError errors={[formState.errors.ratePlanId]} />
                </Field>

                <Field data-invalid={Boolean(formState.errors.notes)}>
                  <FieldLabel htmlFor="entry-notes">Nota (opcional)</FieldLabel>
                  <Input
                    id="entry-notes"
                    className="min-h-11"
                    autoComplete="off"
                    placeholder="Casco entregado, puesto 12…"
                    {...register('notes')}
                  />
                  <FieldError errors={[formState.errors.notes]} />
                </Field>
              </FieldGroup>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={formState.isSubmitting}>
                {formState.isSubmitting ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <LogIn data-icon="inline-start" />
                )}
                {formState.isSubmitting ? 'Registrando…' : 'Registrar ingreso'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}
    </div>
  )
}
