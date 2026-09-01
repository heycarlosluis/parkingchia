import { zodResolver } from '@hookform/resolvers/zod'
import { CheckCircle2, LoaderCircle, LogOut, Printer } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link } from 'react-router-dom'
import { z } from 'zod'
import type { ActiveSession, ExitRegistration } from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import { describeElapsed, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { describeCoverage } from '@shared/monthly'
import { VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { MAX_PLATE_LENGTH, plateSchema, sanitizePlateInput } from '@shared/validation'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { ExitDialog } from '@/features/active-sessions/exit-dialog'
import { useCashStore } from '@/store/cash-store'
import { useParkingStore } from '@/store/parking-store'

const exitFormSchema = z.object({ plate: plateSchema })

type ExitFormInput = z.input<typeof exitFormSchema>
type ExitForm = z.output<typeof exitFormSchema>

export function ExitPage(): React.JSX.Element {
  const cashSession = useCashStore((store) => store.session)
  const cashLoading = useCashStore((store) => store.loading)
  const clearParkingError = useParkingStore((store) => store.clearError)
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [lastExit, setLastExit] = useState<ExitRegistration | null>(null)
  const [notFound, setNotFound] = useState('')
  const [lookupError, setLookupError] = useState('')
  const [searching, setSearching] = useState(false)
  const [reprinting, setReprinting] = useState(false)
  const [reprintMessage, setReprintMessage] = useState('')
  const continueRef = useRef<HTMLButtonElement>(null)

  const { control, handleSubmit, reset, setFocus, formState } = useForm<
    ExitFormInput,
    unknown,
    ExitForm
  >({
    resolver: zodResolver(exitFormSchema),
    defaultValues: { plate: '' },
  })

  // Cerrada la salida, Enter debe encadenar con la siguiente sin tocar el ratón.
  useEffect(() => {
    if (lastExit) continueRef.current?.focus()
  }, [lastExit])

  const submit = handleSubmit(async (values) => {
    setNotFound('')
    setLookupError('')
    setSearching(true)
    const result = await window.parkingAPI.listActiveSessions({ search: values.plate })
    setSearching(false)
    if (!result.ok) {
      setLookupError(result.error.message)
      return
    }
    // La búsqueda del proceso principal es parcial; aquí solo sirve la exacta.
    // Una matrícula tiene como mucho un ingreso activo, así que no hay que elegir.
    const match = result.data.find((item) => item.plate === values.plate)
    if (!match) {
      setNotFound(values.plate)
      return
    }
    // El diálogo muestra el error del store: un fallo anterior no es de esta salida.
    clearParkingError()
    setSession(match)
  })

  const startAnother = (): void => {
    setLastExit(null)
    setNotFound('')
    setLookupError('')
    setReprintMessage('')
    reset({ plate: '' })
    setFocus('plate')
  }

  const reprint = async (): Promise<void> => {
    if (!lastExit) return
    setReprinting(true)
    const result = await window.parkingAPI.reprintReceipt({ sessionId: lastExit.sessionId })
    setReprinting(false)
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  const printStatus = reprintMessage === '' ? (lastExit?.printMessage ?? '') : reprintMessage

  return (
    <div className="page-stack quick-page">
      <header className="quick-heading">
        <h1>Registrar salida</h1>
        <p>Escribe la matrícula y presiona Enter.</p>
      </header>

      {!cashLoading && !cashSession ? (
        <Alert variant="warning">
          <AlertTitle>No hay una caja abierta</AlertTitle>
          <AlertDescription>
            Sin caja abierta no se puede cobrar. Las salidas sin cobro sí se registran.
          </AlertDescription>
          <AlertActions>
            <Button variant="outline" size="sm" asChild>
              <Link to="/caja">Abrir caja</Link>
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      {lookupError ? (
        <Alert variant="destructive">
          <AlertTitle>No fue posible buscar la matrícula</AlertTitle>
          <AlertDescription>{lookupError}</AlertDescription>
        </Alert>
      ) : null}

      {notFound !== '' ? (
        <Alert variant="warning">
          <AlertTitle>{notFound} no está en el parqueadero</AlertTitle>
          <AlertDescription>
            No hay ningún ingreso activo con esa matrícula. Revisa el parqueo activo por si se
            registró con otra.
          </AlertDescription>
          <AlertActions>
            <Button variant="outline" size="sm" asChild>
              <Link to="/parqueo-activo">Ver parqueo activo</Link>
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      {lastExit ? (
        <Card className="quick-card">
          <CardContent className="quick-done">
            <p className="quick-done-title">
              <CheckCircle2 aria-hidden="true" /> Salida registrada
            </p>
            <p className="quick-done-plate">{lastExit.plate}</p>
            <dl className="charge-breakdown">
              <div>
                <dt>Vehículo</dt>
                <dd>{VEHICLE_TYPE_LABELS[lastExit.vehicleType]}</dd>
              </div>
              <div>
                <dt>Permanencia</dt>
                <dd className="tabular">{describeElapsed(lastExit.charge.totalMinutes)}</dd>
              </div>
              <div>
                <dt>Fecha y hora de salida</dt>
                <dd className="tabular">{formatDateTime(lastExit.exitedAt)}</dd>
              </div>
              {lastExit.receiptNumber === null ? null : (
                <div>
                  <dt>Recibo</dt>
                  <dd className="tabular">
                    N.º {lastExit.receiptNumber} · {PAYMENT_METHOD_LABELS[lastExit.method]}
                  </dd>
                </div>
              )}
              {lastExit.changeCop === null ? null : (
                <div>
                  <dt>Cambio a entregar</dt>
                  <dd className="tabular">{formatCurrency(lastExit.changeCop)}</dd>
                </div>
              )}
              <div className="charge-total">
                <dt>Total cobrado</dt>
                <dd className="tabular">{formatCurrency(lastExit.charge.totalCop)}</dd>
              </div>
            </dl>
            {lastExit.monthlyCoverage ? (
              <p className="field-hint">
                <Badge variant="secondary">Mensualidad</Badge>{' '}
                {lastExit.monthlyCoverage.customerName} ·{' '}
                {describeCoverage(
                  lastExit.monthlyCoverage.startsAt,
                  lastExit.monthlyCoverage.endsAt,
                )}
                . La salida no generó cobro.
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
              <LogOut data-icon="inline-start" />
              Registrar otra salida
            </Button>
            {lastExit.receiptNumber === null ? null : (
              <Button
                type="button"
                variant="ghost"
                onClick={() => void reprint()}
                disabled={reprinting}
              >
                <Printer data-icon="inline-start" />
                {reprinting ? 'Imprimiendo…' : 'Reimprimir recibo'}
              </Button>
            )}
          </CardFooter>
        </Card>
      ) : (
        <Card className="quick-card">
          <form onSubmit={(event) => void submit(event)} noValidate>
            <CardContent className="quick-form">
              <Field data-invalid={Boolean(formState.errors.plate)} className="quick-plate-field">
                <FieldLabel htmlFor="exit-plate">Matrícula</FieldLabel>
                <Controller
                  control={control}
                  name="plate"
                  render={({ field }) => (
                    <input
                      id="exit-plate"
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
                      onChange={(event) => {
                        setNotFound('')
                        field.onChange(sanitizePlateInput(event.target.value))
                      }}
                    />
                  )}
                />
                <FieldError errors={[formState.errors.plate]} />
              </Field>

              <Button type="submit" size="lg" className="quick-submit" disabled={searching}>
                {searching ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : (
                  <LogOut data-icon="inline-start" />
                )}
                {searching ? 'Buscando…' : 'Registrar salida'}
              </Button>
            </CardContent>
          </form>
        </Card>
      )}

      {session ? (
        <ExitDialog
          key={session.id}
          session={session}
          onOpenChange={(open) => {
            if (!open) {
              setSession(null)
              setFocus('plate')
            }
          }}
          onClosed={(exit) => {
            setSession(null)
            setLastExit(exit)
            setReprintMessage('')
          }}
        />
      ) : null}
    </div>
  )
}
