import {
  Banknote,
  HandCoins,
  History,
  Lock,
  Plus,
  Printer,
  RefreshCw,
  ShieldX,
  Wallet,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import type { CashCloseSummary, CashMovement } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import { CASH_MOVEMENT_SOURCE_LABELS, CASH_PAYMENT_STATUS_LABELS } from '@shared/cash'
import { PAYMENT_METHOD_LABELS } from '@shared/parking'
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
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeading } from '@/components/page-heading'
import { CloseCashDialog } from '@/features/cash/close-cash-dialog'
import { OpenCashDialog } from '@/features/cash/open-cash-dialog'
import { useCashStore } from '@/store/cash-store'

function localTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleString('es-CO', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

function localDateTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function describeDifference(summary: CashCloseSummary): string {
  if (summary.differenceCop === 0) return 'Cuadra'
  return summary.differenceCop > 0
    ? `Sobra ${formatCurrency(summary.differenceCop)}`
    : `Falta ${formatCurrency(-summary.differenceCop)}`
}

export function CashPage(): React.JSX.Element {
  const session = useCashStore((store) => store.session)
  const movements = useCashStore((store) => store.movements)
  const collectedCop = useCashStore((store) => store.collectedCop)
  const voidedCop = useCashStore((store) => store.voidedCop)
  const expectedCop = useCashStore((store) => store.expectedCop)
  const loading = useCashStore((store) => store.loading)
  const error = useCashStore((store) => store.error)
  const message = useCashStore((store) => store.message)
  const lastClose = useCashStore((store) => store.lastClose)
  const closedSessions = useCashStore((store) => store.closedSessions)
  const initialize = useCashStore((store) => store.initialize)
  const refresh = useCashStore((store) => store.refresh)
  const openSession = useCashStore((store) => store.openSession)
  const closeSession = useCashStore((store) => store.closeSession)
  const voidPayment = useCashStore((store) => store.voidPayment)
  const clearFeedback = useCashStore((store) => store.clearFeedback)
  const dismissClose = useCashStore((store) => store.dismissClose)

  const [opening, setOpening] = useState(false)
  const [closing, setClosing] = useState(false)
  const [voiding, setVoiding] = useState<CashMovement | null>(null)
  const [voidReason, setVoidReason] = useState('')
  const [reprintMessage, setReprintMessage] = useState('')

  useEffect(() => {
    void initialize()
  }, [initialize])

  const confirmVoid = async (): Promise<void> => {
    if (!voiding) return
    const done = await voidPayment({ paymentId: voiding.paymentId, reason: voidReason })
    if (done) {
      setVoiding(null)
      setVoidReason('')
    }
  }

  const printClose = async (sessionId: string): Promise<void> => {
    setReprintMessage('Enviando el recibo de cierre…')
    const result = await window.parkingAPI.printCashCloseReceipt({ sessionId })
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  const closeSummary = lastClose

  return (
    <div className="page-stack">
      <PageHeading
        title="Caja"
        description="Apertura, movimientos del turno y cierre explícito con su arqueo."
        action={
          session ? (
            <Badge variant="secondary">
              Caja abierta{session.employeeName ? ` · ${session.employeeName}` : ''}
            </Badge>
          ) : (
            <Badge variant="outline">Sin caja abierta</Badge>
          )
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="stable-status" role="status" aria-live="polite">
        {message}
      </div>

      {closeSummary ? (
        <Alert variant="success">
          <AlertTitle>
            Caja cerrada
            {closeSummary.employeeName ? ` · ${closeSummary.employeeName}` : ''} ·{' '}
            {formatCurrency(closeSummary.expectedAmountCop)} esperado ·{' '}
            {formatCurrency(closeSummary.closingAmountCop)} contado
          </AlertTitle>
          <AlertDescription>
            <span>
              {closeSummary.differenceCop === 0
                ? 'El arqueo cuadra.'
                : closeSummary.differenceCop > 0
                  ? `Sobrante de ${formatCurrency(closeSummary.differenceCop)}.`
                  : `Faltante de ${formatCurrency(-closeSummary.differenceCop)}.`}
              {closeSummary.movementCount > 0
                ? ` · ${closeSummary.movementCount} ${
                    closeSummary.movementCount === 1 ? 'movimiento' : 'movimientos'
                  }`
                : ''}
            </span>
            {/* El aviso ya es una región viva: anunciar aquí duplicaría la lectura. */}
            <span className="reprint-status">{reprintMessage}</span>
          </AlertDescription>
          <AlertActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void printClose(closeSummary.sessionId)}
            >
              <Printer data-icon="inline-start" />
              Imprimir recibo de cierre
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                dismissClose()
                setReprintMessage('')
              }}
            >
              Entendido
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      {loading ? (
        <Card>
          <CardContent>
            <p className="field-hint">Consultando la caja…</p>
          </CardContent>
        </Card>
      ) : session === null ? (
        <Empty className="module-empty border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Banknote aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No hay una caja abierta</EmptyTitle>
            <EmptyDescription>
              Abre la caja al iniciar el turno para asociar cada cobro y poder cerrar el arqueo al
              finalizar.
            </EmptyDescription>
            <Button type="button" onClick={() => setOpening(true)}>
              <Plus data-icon="inline-start" />
              Abrir caja
            </Button>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <section aria-labelledby="cash-summary-title">
            <h2 id="cash-summary-title" className="sr-only">
              Resumen de la caja abierta
            </h2>
            <div className="summary-grid">
              <Card>
                <CardHeader>
                  <CardDescription>Fondo inicial</CardDescription>
                  <CardTitle className="metric-value tabular">
                    {formatCurrency(session.openingAmountCop)}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card className="active-card">
                <CardHeader>
                  <CardDescription>Recaudado</CardDescription>
                  <CardTitle className="metric-value tabular">
                    {formatCurrency(collectedCop)}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Anulado</CardDescription>
                  <CardTitle className="metric-value tabular">
                    {formatCurrency(voidedCop)}
                  </CardTitle>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader>
                  <CardDescription>Esperado al cierre</CardDescription>
                  <CardTitle className="metric-value tabular">
                    {formatCurrency(expectedCop)}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>
          </section>

          <Card>
            <CardHeader className="sessions-toolbar">
              <CardTitle className="title-with-icon">
                <Wallet aria-hidden="true" /> {movements.length}{' '}
                {movements.length === 1 ? 'movimiento' : 'movimientos'}
              </CardTitle>
              <div className="sessions-toolbar-actions">
                <Button type="button" variant="outline" onClick={() => void refresh()}>
                  <RefreshCw data-icon="inline-start" />
                  Actualizar
                </Button>
                <Button type="button" onClick={() => setClosing(true)}>
                  <Lock data-icon="inline-start" />
                  Cerrar caja
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {movements.length === 0 ? (
                <Empty className="module-empty border">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <HandCoins aria-hidden="true" />
                    </EmptyMedia>
                    <EmptyTitle>Todavía no hay movimientos</EmptyTitle>
                    <EmptyDescription>
                      Los cobros de parqueo y de mensualidades que registres durante el turno
                      aparecerán aquí.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <div className="table-scroll">
                  <table className="data-table">
                    <caption className="sr-only">
                      Movimientos de la caja abierta con su concepto, medio y estado.
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Hora</th>
                        <th scope="col">Concepto</th>
                        <th scope="col">Medio</th>
                        <th scope="col" className="numeric">
                          Monto
                        </th>
                        <th scope="col">Estado</th>
                        <th scope="col" className="numeric">
                          Recibo
                        </th>
                        <th scope="col" className="actions">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((movement) => (
                        <tr
                          key={movement.paymentId}
                          data-inactive={movement.status !== 'completed'}
                        >
                          <td className="numeric tabular">{localTime(movement.paidAt)}</td>
                          <td>
                            {CASH_MOVEMENT_SOURCE_LABELS[movement.source]}
                            <br />
                            <small>
                              {movement.source === 'parking'
                                ? movement.plate
                                : (movement.customerName ?? movement.plate)}
                            </small>
                          </td>
                          <td>{PAYMENT_METHOD_LABELS[movement.method]}</td>
                          <td className="numeric tabular">{formatCurrency(movement.amountCop)}</td>
                          <td>
                            <Badge
                              variant={movement.status === 'completed' ? 'default' : 'destructive'}
                            >
                              {CASH_PAYMENT_STATUS_LABELS[movement.status]}
                            </Badge>
                          </td>
                          <td className="numeric tabular">
                            {movement.receiptNumber === null
                              ? '—'
                              : `N.º ${movement.receiptNumber}`}
                          </td>
                          <td className="actions">
                            {movement.status === 'completed' ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  clearFeedback()
                                  setVoiding(movement)
                                  setVoidReason('')
                                }}
                              >
                                <ShieldX data-icon="inline-start" />
                                Anular
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!loading && closedSessions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="title-with-icon">
              <History aria-hidden="true" /> Cierres anteriores
            </CardTitle>
            <CardDescription>
              Arqueo de los turnos ya cerrados, con su recibo reimprimible.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Cierres de caja anteriores con empleado, recaudado, esperado y diferencia.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Empleado</th>
                    <th scope="col" className="numeric">
                      Cierre
                    </th>
                    <th scope="col" className="numeric">
                      Recaudado
                    </th>
                    <th scope="col" className="numeric">
                      Esperado
                    </th>
                    <th scope="col" className="numeric">
                      Contado
                    </th>
                    <th scope="col">Diferencia</th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {closedSessions.map((summary) => (
                    <tr key={summary.sessionId}>
                      <td>{summary.employeeName ?? '—'}</td>
                      <td className="numeric tabular">{localDateTime(summary.closedAt)}</td>
                      <td className="numeric tabular">{formatCurrency(summary.collectedCop)}</td>
                      <td className="numeric tabular">
                        {formatCurrency(summary.expectedAmountCop)}
                      </td>
                      <td className="numeric tabular">
                        {formatCurrency(summary.closingAmountCop)}
                      </td>
                      <td>
                        <Badge
                          variant={
                            summary.differenceCop === 0
                              ? 'secondary'
                              : summary.differenceCop > 0
                                ? 'default'
                                : 'destructive'
                          }
                        >
                          {describeDifference(summary)}
                        </Badge>
                      </td>
                      <td className="actions">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void printClose(summary.sessionId)}
                        >
                          <Printer data-icon="inline-start" />
                          Recibo
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <OpenCashDialog
        open={opening}
        error={error}
        onOpenChange={setOpening}
        onSubmit={openSession}
      />

      <CloseCashDialog
        open={closing}
        expectedCop={expectedCop}
        error={error}
        onOpenChange={setClosing}
        onSubmit={closeSession}
      />

      <AlertDialog
        open={voiding !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVoiding(null)
            setVoidReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Anular el cobro de {voiding ? formatCurrency(voiding.amountCop) : ''}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              El importe dejará de contar en la caja y su recibo quedará anulado. Esta acción no se
              puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="void-payment-reason">Motivo</FieldLabel>
            <Input
              id="void-payment-reason"
              className="min-h-11"
              autoComplete="off"
              placeholder="Se cobró la tarifa equivocada"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
            />
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              disabled={voidReason.trim().length < 4}
              onClick={(event) => {
                event.preventDefault()
                void confirmVoid()
              }}
            >
              Anular cobro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
