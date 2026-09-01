import {
  Ban,
  CalendarPlus,
  CreditCard,
  Plus,
  Printer,
  RefreshCw,
  Search,
  UsersRound,
} from 'lucide-react'
import { useState } from 'react'
import type { MonthlyPaymentRegistration, MonthlySubscription } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import {
  describeCoverage,
  describeRemaining,
  isExpiringSoon,
  MAX_SUBSCRIPTION_MONTHS,
  MIN_SUBSCRIPTION_MONTHS,
  PAYMENT_STATE_LABELS,
  SUBSCRIPTION_STATUS_LABELS,
  SUBSCRIPTION_STATUSES,
} from '@shared/monthly'
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@shared/parking'
import { VEHICLE_TYPE_LABELS } from '@shared/tariff'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PaymentDialog } from '@/features/monthly/payment-dialog'
import { SubscriptionDialog } from '@/features/monthly/subscription-dialog'
import { useMonthlyStore, type SubscriptionFilter } from '@/store/monthly-store'

const MONTH_OPTIONS = Array.from(
  { length: MAX_SUBSCRIPTION_MONTHS - MIN_SUBSCRIPTION_MONTHS + 1 },
  (_, index) => MIN_SUBSCRIPTION_MONTHS + index,
)

const STATUS_BADGE: Record<
  MonthlySubscription['status'],
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  active: 'default',
  pending: 'secondary',
  expired: 'destructive',
  cancelled: 'outline',
}

export function SubscriptionsCard(): React.JSX.Element {
  const subscriptions = useMonthlyStore((store) => store.subscriptions)
  const customers = useMonthlyStore((store) => store.customers)
  const plans = useMonthlyStore((store) => store.plans)
  const search = useMonthlyStore((store) => store.search)
  const status = useMonthlyStore((store) => store.status)
  const loading = useMonthlyStore((store) => store.loading)
  const error = useMonthlyStore((store) => store.error)
  const setSearch = useMonthlyStore((store) => store.setSearch)
  const setStatus = useMonthlyStore((store) => store.setStatus)
  const refresh = useMonthlyStore((store) => store.refresh)
  const createSubscription = useMonthlyStore((store) => store.createSubscription)
  const renewSubscription = useMonthlyStore((store) => store.renewSubscription)
  const cancelSubscription = useMonthlyStore((store) => store.cancelSubscription)
  const registerPayment = useMonthlyStore((store) => store.registerPayment)
  const clearFeedback = useMonthlyStore((store) => store.clearFeedback)

  const [creating, setCreating] = useState(false)
  const [charging, setCharging] = useState<MonthlySubscription | null>(null)
  const [renewing, setRenewing] = useState<MonthlySubscription | null>(null)
  const [renewMonths, setRenewMonths] = useState(1)
  const [renewAmount, setRenewAmount] = useState<number>(Number.NaN)
  const [cancelling, setCancelling] = useState<MonthlySubscription | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [lastPayment, setLastPayment] = useState<MonthlyPaymentRegistration | null>(null)
  const [reprintMessage, setReprintMessage] = useState('')

  const now = new Date().toISOString()

  const reprint = async (subscriptionId: string): Promise<void> => {
    setReprintMessage('Enviando el comprobante…')
    const result = await window.parkingAPI.reprintSubscriptionReceipt({ subscriptionId })
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  const confirmRenew = async (): Promise<void> => {
    if (!renewing) return
    const renewed = await renewSubscription({
      id: renewing.id,
      months: renewMonths,
      amountCop: Number.isFinite(renewAmount) ? renewAmount : null,
    })
    if (renewed) {
      setRenewing(null)
      setRenewMonths(1)
      setRenewAmount(Number.NaN)
    }
  }

  const confirmCancel = async (): Promise<void> => {
    if (!cancelling) return
    const cancelled = await cancelSubscription(cancelling.id, cancelReason)
    if (cancelled) {
      setCancelling(null)
      setCancelReason('')
    }
  }

  const hasFilters = search !== '' || status !== 'all'

  return (
    <>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {lastPayment ? (
        <Alert variant="success">
          <AlertTitle>
            Pago registrado · {lastPayment.plate} · {formatCurrency(lastPayment.amountCop)}
          </AlertTitle>
          <AlertDescription>
            <span>
              Recibo N.º {lastPayment.receiptNumber} ·{' '}
              {PAYMENT_METHOD_LABELS[lastPayment.method as PaymentMethod]}
              {lastPayment.changeCop === null
                ? ''
                : ` · Cambio a entregar: ${formatCurrency(lastPayment.changeCop)}`}
              {lastPayment.balanceCop > 0
                ? ` · Saldo pendiente: ${formatCurrency(lastPayment.balanceCop)}`
                : ' · Mensualidad pagada'}
            </span>
            {/* El aviso ya es una región viva: anunciar aquí duplicaría la lectura. */}
            <span className="reprint-status">{reprintMessage}</span>
          </AlertDescription>
          <AlertActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void reprint(lastPayment.subscriptionId)}
            >
              <Printer data-icon="inline-start" />
              Reimprimir comprobante
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setLastPayment(null)
                setReprintMessage('')
              }}
            >
              Cerrar aviso
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="sessions-toolbar">
          <CardTitle className="title-with-icon">
            <UsersRound aria-hidden="true" /> {subscriptions.length}{' '}
            {subscriptions.length === 1 ? 'mensualidad' : 'mensualidades'}
          </CardTitle>
          <div className="sessions-toolbar-actions">
            <Field>
              <FieldLabel htmlFor="monthly-search" className="sr-only">
                Buscar por matrícula, cliente o documento
              </FieldLabel>
              <div className="search-field">
                <Search aria-hidden="true" />
                <Input
                  id="monthly-search"
                  className="min-h-11"
                  autoComplete="off"
                  placeholder="Buscar matrícula o cliente"
                  value={search}
                  onChange={(event) => void setSearch(event.target.value)}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="monthly-status" className="sr-only">
                Filtrar por estado
              </FieldLabel>
              <Select
                value={status}
                onValueChange={(value) => void setStatus(value as SubscriptionFilter)}
              >
                <SelectTrigger id="monthly-status" className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    {SUBSCRIPTION_STATUSES.map((value) => (
                      <SelectItem key={value} value={value}>
                        {SUBSCRIPTION_STATUS_LABELS[value]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>
            <Button type="button" variant="outline" onClick={() => void refresh()}>
              <RefreshCw data-icon="inline-start" />
              Actualizar
            </Button>
            <Button
              type="button"
              onClick={() => {
                clearFeedback()
                setCreating(true)
              }}
            >
              <Plus data-icon="inline-start" />
              Nueva mensualidad
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="field-hint">Consultando las mensualidades…</p>
          ) : subscriptions.length === 0 ? (
            <Empty className="module-empty border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <UsersRound aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {hasFilters ? 'Ninguna mensualidad coincide' : 'Todavía no hay mensualidades'}
                </EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? 'Ajusta la búsqueda o el estado para ampliar el listado.'
                    : 'Crea un cliente y un plan mensual y luego registra su primera mensualidad.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Mensualidades con su vigencia, estado de pago y acciones disponibles.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Matrícula</th>
                    <th scope="col">Cliente</th>
                    <th scope="col">Plan</th>
                    <th scope="col">Vigencia</th>
                    <th scope="col">Estado</th>
                    <th scope="col" className="numeric">
                      Costo
                    </th>
                    <th scope="col">Pago</th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((subscription) => (
                    <tr key={subscription.id} data-inactive={subscription.status === 'cancelled'}>
                      <th scope="row" className="plate-cell">
                        {subscription.plate}
                      </th>
                      <td>
                        {subscription.customerName}
                        <br />
                        <small>{VEHICLE_TYPE_LABELS[subscription.vehicleType]}</small>
                      </td>
                      <td>{subscription.planName}</td>
                      <td>
                        <span className="tabular">
                          {describeCoverage(subscription.startsAt, subscription.endsAt)}
                        </span>
                        <br />
                        <small>
                          {describeRemaining(subscription.status, subscription.endsAt, now)}
                        </small>
                      </td>
                      <td>
                        <Badge variant={STATUS_BADGE[subscription.status]}>
                          {SUBSCRIPTION_STATUS_LABELS[subscription.status]}
                        </Badge>
                        {subscription.status === 'active' &&
                        isExpiringSoon(subscription.endsAt, now) ? (
                          <>
                            {' '}
                            <Badge variant="outline">Por vencer</Badge>
                          </>
                        ) : null}
                      </td>
                      <td className="numeric tabular">{formatCurrency(subscription.amountCop)}</td>
                      <td>
                        {PAYMENT_STATE_LABELS[subscription.paymentState]}
                        {subscription.balanceCop > 0 ? (
                          <>
                            <br />
                            <small className="tabular">
                              Saldo {formatCurrency(subscription.balanceCop)}
                            </small>
                          </>
                        ) : null}
                      </td>
                      <td className="actions">
                        <div className="row-actions">
                          {subscription.balanceCop > 0 && subscription.status !== 'cancelled' ? (
                            <Button
                              type="button"
                              size="sm"
                              onClick={() => {
                                clearFeedback()
                                setCharging(subscription)
                              }}
                            >
                              <CreditCard data-icon="inline-start" />
                              Cobrar
                            </Button>
                          ) : null}
                          {subscription.status !== 'cancelled' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                clearFeedback()
                                setRenewAmount(subscription.amountCop)
                                setRenewing(subscription)
                              }}
                            >
                              <CalendarPlus data-icon="inline-start" />
                              Renovar
                            </Button>
                          ) : null}
                          {subscription.paidCop > 0 ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void reprint(subscription.id)}
                            >
                              <Printer data-icon="inline-start" />
                              Recibo
                            </Button>
                          ) : null}
                          {subscription.status === 'active' || subscription.status === 'pending' ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                clearFeedback()
                                setCancelling(subscription)
                              }}
                            >
                              <Ban data-icon="inline-start" />
                              Cancelar
                            </Button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="stable-status" role="status" aria-live="polite">
            {lastPayment ? '' : reprintMessage}
          </div>
        </CardContent>
      </Card>

      <SubscriptionDialog
        open={creating}
        customers={customers}
        plans={plans}
        error={error}
        onOpenChange={setCreating}
        onSubmit={createSubscription}
      />

      {charging ? (
        <PaymentDialog
          key={charging.id}
          subscription={charging}
          error={error}
          onOpenChange={(open) => {
            if (!open) setCharging(null)
          }}
          onSubmit={registerPayment}
          onPaid={(registration) => {
            setCharging(null)
            setLastPayment(registration)
            setReprintMessage(registration.printMessage)
          }}
        />
      ) : null}

      <AlertDialog
        open={renewing !== null}
        onOpenChange={(open) => {
          if (!open) setRenewing(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Renovar la mensualidad de {renewing?.plate}</AlertDialogTitle>
            <AlertDialogDescription>
              Se abre un periodo nuevo que empieza el día siguiente al último cubierto, o hoy si la
              anterior ya venció. El periodo actual y sus pagos no se modifican.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="renew-months">Duración</FieldLabel>
            <Select
              value={String(renewMonths)}
              onValueChange={(value) => setRenewMonths(Number(value))}
            >
              <SelectTrigger id="renew-months" className="min-h-11">
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
          </Field>
          <Field>
            <FieldLabel htmlFor="renew-amount">Costo del nuevo periodo</FieldLabel>
            <Input
              id="renew-amount"
              className="min-h-11"
              type="number"
              inputMode="numeric"
              min={0}
              step={1000}
              value={Number.isFinite(renewAmount) ? renewAmount : ''}
              onChange={(event) => setRenewAmount(event.target.valueAsNumber)}
            />
            <FieldDescription>Se propone el costo del periodo anterior.</FieldDescription>
          </Field>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void confirmRenew()
              }}
            >
              Renovar mensualidad
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
            <AlertDialogTitle>¿Cancelar la mensualidad de {cancelling?.plate}?</AlertDialogTitle>
            <AlertDialogDescription>
              El vehículo vuelve a cobrarse por horas desde este momento. Los pagos ya registrados
              se conservan y no se devuelven automáticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Field>
            <FieldLabel htmlFor="cancel-subscription-reason">Motivo</FieldLabel>
            <Input
              id="cancel-subscription-reason"
              className="min-h-11"
              autoComplete="off"
              placeholder="El cliente cambió de vehículo"
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
              Cancelar mensualidad
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
