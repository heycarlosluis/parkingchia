import { zodResolver } from '@hookform/resolvers/zod'
import { Barcode, CheckCircle2, LoaderCircle, LogOut, Printer, ScanLine } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useLocation } from 'react-router-dom'
import type { z } from 'zod'
import type { ActiveSession, ExitRegistration } from '@shared/contracts'
import {
  isEntryTicketCode,
  MAX_ENTRY_SCAN_LENGTH,
  sanitizeExitCodeInput,
} from '@shared/entry-ticket'
import { formatCurrency, formatDateTime } from '@shared/format'
import { describeElapsed, PAYMENT_METHOD_LABELS, resolveExitTargetSchema } from '@shared/parking'
import { describeCoverage } from '@shared/monthly'
import { VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { MAX_PLATE_LENGTH } from '@shared/validation'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { ExitDialog } from '@/features/active-sessions/exit-dialog'
import { useCashStore } from '@/store/cash-store'
import { useParkingStore } from '@/store/parking-store'

type ExitFormInput = z.input<typeof resolveExitTargetSchema>
type ExitForm = z.output<typeof resolveExitTargetSchema>

type ExitRouteState = { entryTicketCode?: string; scanNonce?: number } | null

export function ExitPage(): React.JSX.Element {
  const location = useLocation()
  const cashSession = useCashStore((store) => store.session)
  const cashLoading = useCashStore((store) => store.loading)
  const clearParkingError = useParkingStore((store) => store.clearError)
  const [session, setSession] = useState<ActiveSession | null>(null)
  const [lastExit, setLastExit] = useState<ExitRegistration | null>(null)
  const [lookupError, setLookupError] = useState('')
  const [searching, setSearching] = useState(false)
  const [reprinting, setReprinting] = useState(false)
  const [reprintMessage, setReprintMessage] = useState('')
  const continueRef = useRef<HTMLButtonElement>(null)
  const handledScanNonce = useRef<number | undefined>(undefined)

  const { control, handleSubmit, reset, setFocus, formState } = useForm<
    ExitFormInput,
    unknown,
    ExitForm
  >({
    resolver: zodResolver(resolveExitTargetSchema),
    defaultValues: { code: '' },
  })

  // Cerrada la salida, Enter debe encadenar con la siguiente sin tocar el ratón.
  useEffect(() => {
    if (lastExit) continueRef.current?.focus()
  }, [lastExit])

  const lookup = async (code: string): Promise<void> => {
    setLookupError('')
    setSearching(true)
    const result = await window.parkingAPI.resolveExitTarget({ code })
    setSearching(false)
    if (!result.ok) {
      setLookupError(result.error.message)
      return
    }
    // El diálogo muestra el error del store: un fallo anterior no es de esta salida.
    clearParkingError()
    setSession(result.data)
  }

  const submit = handleSubmit((values) => lookup(values.code))

  useEffect(() => {
    const state = location.state as ExitRouteState
    if (!state?.entryTicketCode || state.scanNonce === handledScanNonce.current) return
    handledScanNonce.current = state.scanNonce
    reset({ code: state.entryTicketCode })
    void lookup(state.entryTicketCode)
    // `lookup` usa únicamente setters estables y la API segura; el nonce evita relecturas.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, reset])

  const startAnother = (): void => {
    setLastExit(null)
    setLookupError('')
    setReprintMessage('')
    reset({ code: '' })
    setFocus('code')
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
        <p>Escanea el tiquete o escribe la matrícula para preparar el cobro.</p>
      </header>

      {!lastExit ? (
        <div className="scanner-ready" role="status">
          <span className="scanner-ready-icon" aria-hidden="true">
            <ScanLine />
          </span>
          <span>
            <strong>Lector listo</strong>
            <small>Compatible con lectores USB que funcionan como teclado</small>
          </span>
        </div>
      ) : null}

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
          <AlertTitle>No fue posible encontrar el ingreso</AlertTitle>
          <AlertDescription>{lookupError}</AlertDescription>
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
              <Field data-invalid={Boolean(formState.errors.code)} className="quick-plate-field">
                <FieldLabel htmlFor="exit-code">Tiquete o matrícula</FieldLabel>
                <Controller
                  control={control}
                  name="code"
                  render={({ field }) => (
                    <input
                      id="exit-code"
                      // Un código escaneado es largo: se muestra compacto en lugar de a tamaño de matrícula.
                      className={
                        field.value.length > MAX_PLATE_LENGTH || isEntryTicketCode(field.value)
                          ? 'plate-input scanner-code-input'
                          : 'plate-input'
                      }
                      autoComplete="off"
                      autoFocus
                      spellCheck={false}
                      enterKeyHint="done"
                      maxLength={MAX_ENTRY_SCAN_LENGTH}
                      placeholder="ABC123"
                      aria-invalid={Boolean(formState.errors.code)}
                      name={field.name}
                      ref={field.ref}
                      value={field.value}
                      onBlur={field.onBlur}
                      // Un lector configurado con Tab como sufijo debe buscar, no saltar al botón.
                      onKeyDown={(event) => {
                        if (event.key !== 'Tab' || event.shiftKey) return
                        if (!isEntryTicketCode(field.value)) return
                        event.preventDefault()
                        void submit()
                      }}
                      // Igual que en Registrar ingreso: solo letras y dígitos, salvo un tiquete escaneado.
                      onChange={(event) => {
                        setLookupError('')
                        field.onChange(sanitizeExitCodeInput(event.target.value))
                      }}
                    />
                  )}
                />
                <p className="field-hint">
                  <Barcode aria-hidden="true" /> El lector completa el campo y continúa con Enter.
                  Sin lector, escribe la matrícula o los 16 dígitos impresos bajo el código de
                  barras.
                </p>
                <FieldError errors={[formState.errors.code]} />
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
              setFocus('code')
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
