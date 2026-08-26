import { CarFront, LogOut, Printer, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { ActiveSession, ExitRegistration } from '@shared/contracts'
import { elapsedMinutesOrZero, formatCurrency } from '@shared/format'
import { describeElapsed, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { calculateChargeForMinutes, VEHICLE_TYPE_LABELS } from '@shared/tariff'
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
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeading } from '@/components/page-heading'
import { ExitDialog } from '@/features/active-sessions/exit-dialog'
import { useParkingStore } from '@/store/parking-store'
import { useTariffStore } from '@/store/tariff-store'

/** Cada cuánto se recalculan las permanencias y los estimados en pantalla. */
const TICK_MILLISECONDS = 30_000

export function ActiveSessionsPage(): React.JSX.Element {
  const sessions = useParkingStore((store) => store.sessions)
  const search = useParkingStore((store) => store.search)
  const loading = useParkingStore((store) => store.loading)
  const error = useParkingStore((store) => store.error)
  const refresh = useParkingStore((store) => store.refresh)
  const setSearch = useParkingStore((store) => store.setSearch)
  const cancelSession = useParkingStore((store) => store.cancelSession)
  const clearError = useParkingStore((store) => store.clearError)

  const initializeTariffs = useTariffStore((store) => store.initialize)
  const settings = useTariffStore((store) => store.settings)
  const plans = useTariffStore((store) => store.plans)

  const [now, setNow] = useState(() => new Date().toISOString())
  const [exiting, setExiting] = useState<ActiveSession | null>(null)
  const [cancelling, setCancelling] = useState<ActiveSession | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [lastExit, setLastExit] = useState<ExitRegistration | null>(null)
  const [reprintMessage, setReprintMessage] = useState('')
  const [ticketMessage, setTicketMessage] = useState('')
  const [printingTicketId, setPrintingTicketId] = useState<string | null>(null)

  useEffect(() => {
    void initializeTariffs()
    void refresh()
  }, [initializeTariffs, refresh])

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date().toISOString()), TICK_MILLISECONDS)
    return () => window.clearInterval(interval)
  }, [])

  const plansById = useMemo(() => new Map(plans.map((plan) => [plan.id, plan])), [plans])

  const rows = useMemo(
    () =>
      sessions.map((session) => {
        const minutes = elapsedMinutesOrZero(session.enteredAt, now)
        const plan = session.ratePlanId === null ? undefined : plansById.get(session.ratePlanId)
        // Una mensualidad vigente exime del cobro por tiempo; el total real lo
        // confirma el proceso principal al cotizar la salida.
        const charge =
          session.monthlyCoverage !== null
            ? null
            : plan
              ? calculateChargeForMinutes(minutes, settings, {
                  amountCop: plan.amountCop,
                  minimumChargeCop: plan.minimumChargeCop,
                  plenaCop: plan.plenaCop,
                  graceMinutes: plan.graceMinutes,
                })
              : null
        return { session, minutes, charge }
      }),
    [sessions, now, plansById, settings],
  )

  const reprintReceipt = async (sessionId: string): Promise<void> => {
    setReprintMessage('Enviando el recibo…')
    const result = await window.parkingAPI.reprintReceipt({ sessionId })
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  /** Reemite el tiquete de un vehículo que sigue en el parqueadero. */
  const reprintEntryTicket = async (session: ActiveSession): Promise<void> => {
    setPrintingTicketId(session.id)
    setTicketMessage(`Enviando el tiquete de ${session.plate}…`)
    const result = await window.parkingAPI.reprintEntryTicket({ sessionId: session.id })
    setPrintingTicketId(null)
    setTicketMessage(result.ok ? result.data.message : result.error.message)
  }

  const confirmCancel = async (): Promise<void> => {
    if (!cancelling) return
    const cancelled = await cancelSession(cancelling.id, cancelReason)
    if (cancelled) {
      setCancelling(null)
      setCancelReason('')
    }
  }

  return (
    <div className="page-stack">
      <PageHeading
        title="Parqueo activo"
        description="Sesiones abiertas que todavía no tienen una salida registrada."
        action={<Badge variant="secondary">{sessions.length} activos</Badge>}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {lastExit ? (
        <Alert className="exit-summary">
          <AlertTitle>
            Salida registrada · {lastExit.plate} · {formatCurrency(lastExit.charge.totalCop)}
          </AlertTitle>
          <AlertDescription>
            <span>
              {lastExit.receiptNumber === null
                ? lastExit.monthlyCoverage
                  ? `Cubierta por la mensualidad de ${lastExit.monthlyCoverage.customerName}.`
                  : 'Dentro del tiempo de gracia, sin cobro ni recibo.'
                : `Recibo N.º ${lastExit.receiptNumber} · ${PAYMENT_METHOD_LABELS[lastExit.method]}`}
              {lastExit.changeCop === null
                ? ''
                : ` · Cambio a entregar: ${formatCurrency(lastExit.changeCop)}`}
            </span>
            {lastExit.receiptNumber === null ? null : (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void reprintReceipt(lastExit.sessionId)}
              >
                <Printer data-icon="inline-start" />
                Reimprimir recibo
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setLastExit(null)
                setReprintMessage('')
              }}
            >
              Cerrar aviso
            </Button>
            <span className="reprint-status" role="status" aria-live="polite">
              {reprintMessage}
            </span>
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="sessions-toolbar">
          <CardTitle className="title-with-icon">
            <CarFront aria-hidden="true" /> Vehículos en el parqueadero
          </CardTitle>
          <div className="sessions-toolbar-actions">
            <Field>
              <FieldLabel htmlFor="sessions-search" className="sr-only">
                Buscar por matrícula
              </FieldLabel>
              <div className="search-field">
                <Search aria-hidden="true" />
                <Input
                  id="sessions-search"
                  className="min-h-11"
                  autoComplete="off"
                  placeholder="Buscar matrícula"
                  value={search}
                  onChange={(event) => void setSearch(event.target.value.toUpperCase())}
                />
              </div>
            </Field>
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              <RefreshCw data-icon="inline-start" />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="stable-status" role="status" aria-live="polite">
            {ticketMessage}
          </div>

          {loading ? (
            <p className="field-hint">Consultando el parqueo activo…</p>
          ) : rows.length === 0 ? (
            <Empty className="module-empty border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <CarFront aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {search === '' ? 'No hay vehículos activos' : 'Ninguna matrícula coincide'}
                </EmptyTitle>
                <EmptyDescription>
                  {search === ''
                    ? 'Los vehículos aparecerán aquí después de registrar su ingreso.'
                    : 'Revisa la matrícula o limpia la búsqueda para ver todo el parqueo.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Vehículos con parqueo activo, su permanencia y el cobro estimado.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Matrícula</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col">Tarifa</th>
                    <th scope="col" className="numeric">
                      Ingreso
                    </th>
                    <th scope="col" className="numeric">
                      Permanencia
                    </th>
                    <th scope="col" className="numeric">
                      Estimado
                    </th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ session, minutes, charge }) => (
                    <tr key={session.id}>
                      <th scope="row" className="plate-cell">
                        {session.plate}
                      </th>
                      <td>{VEHICLE_TYPE_LABELS[session.vehicleType]}</td>
                      <td>
                        {session.monthlyCoverage === null ? (
                          (session.ratePlanName ?? 'Sin tarifa')
                        ) : (
                          <Badge variant="secondary">
                            Mensualidad · {session.monthlyCoverage.customerName}
                          </Badge>
                        )}
                      </td>
                      <td className="numeric tabular">
                        {new Date(session.enteredAt).toLocaleTimeString('es-CO', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="numeric tabular">{describeElapsed(minutes)}</td>
                      <td className="numeric tabular">
                        {session.monthlyCoverage !== null
                          ? formatCurrency(0)
                          : charge === null
                            ? '—'
                            : formatCurrency(charge.totalCop)}
                      </td>
                      <td className="actions">
                        <div className="row-actions">
                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              clearError()
                              setExiting(session)
                            }}
                          >
                            <LogOut data-icon="inline-start" />
                            Salida
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={printingTicketId === session.id}
                            onClick={() => void reprintEntryTicket(session)}
                          >
                            <Printer data-icon="inline-start" />
                            {printingTicketId === session.id ? 'Imprimiendo…' : 'Tiquete'}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              clearError()
                              setCancelling(session)
                            }}
                          >
                            <Trash2 data-icon="inline-start" />
                            Anular
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {exiting ? (
        <ExitDialog
          key={exiting.id}
          session={exiting}
          onOpenChange={(open) => {
            if (!open) setExiting(null)
          }}
          onClosed={(exit) => {
            setExiting(null)
            setLastExit(exit)
            setReprintMessage('')
          }}
        />
      ) : null}

      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(open) => {
          if (!open) {
            setCancelling(null)
            setCancelReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Anular el ingreso de {cancelling?.plate}?</AlertDialogTitle>
            <AlertDialogDescription>
              La sesión se marca como anulada, no genera cobro y queda registrada en la auditoría.
              Úsalo solo para corregir un ingreso mal registrado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="cancel-reason">Motivo</FieldLabel>
            <Input
              id="cancel-reason"
              className="min-h-11"
              autoComplete="off"
              placeholder="Matrícula digitada por error"
              value={cancelReason}
              onChange={(event) => setCancelReason(event.target.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={cancelReason.trim().length < 4}
              onClick={(event) => {
                event.preventDefault()
                void confirmCancel()
              }}
            >
              Anular ingreso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
