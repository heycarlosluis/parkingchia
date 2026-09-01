import { FilterX, History, Printer, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExitHistory, ExitRecord } from '@shared/contracts'
import { formatCurrency, formatDate, formatDateTime, formatTime } from '@shared/format'
import {
  describeElapsed,
  EXIT_STATUS_LABELS,
  exitStatusOf,
  MAX_HISTORY_PAGE_SIZE,
  PAYMENT_METHOD_LABELS,
  type ExitStatus,
} from '@shared/parking'
import { describeBilledTime, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge, type BadgeProps } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeading } from '@/components/page-heading'

const EMPTY_HISTORY: ExitHistory = { records: [], totalCount: 0, totalCollectedCop: 0 }

const STATUS_VARIANTS: Record<ExitStatus, BadgeProps['variant']> = {
  charged: 'success',
  monthly: 'secondary',
  free: 'warning',
  cancelled: 'danger',
}

/** Detalle del cobro: la tarifa aplicada arriba y el porqué del importe debajo. */
function describeCharge(record: ExitRecord): string {
  if (record.status === 'cancelled') return 'El ingreso se anuló antes de cobrar'
  if (record.monthlyCustomerName !== null) return `Cubierta por ${record.monthlyCustomerName}`
  if (record.charge === null) return 'No generó cobro'
  return describeBilledTime(record.charge)
}

export function HistoryPage(): React.JSX.Element {
  const [history, setHistory] = useState<ExitHistory>(EMPTY_HISTORY)
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reprintMessage, setReprintMessage] = useState('')

  const [reloadToken, setReloadToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    void window.parkingAPI
      .listExits({ search, from, to, limit: MAX_HISTORY_PAGE_SIZE })
      .then((result) => {
        if (cancelled) return
        setHistory(result.ok ? result.data : EMPTY_HISTORY)
        setError(result.ok ? '' : result.error.message)
        setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [search, from, to, reloadToken])

  const reload = (): void => setReloadToken((token) => token + 1)

  const reprint = async (record: ExitRecord): Promise<void> => {
    setReprintMessage('Enviando el recibo…')
    const result = await window.parkingAPI.reprintReceipt({ sessionId: record.sessionId })
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  const hasFilters = search !== '' || from !== '' || to !== ''

  const clearFilters = (): void => {
    setSearch('')
    setFrom('')
    setTo('')
  }

  // La consulta corta en MAX_HISTORY_PAGE_SIZE, pero el total cuenta todo el filtro.
  const truncated = history.records.length < history.totalCount

  return (
    <div className="page-stack">
      <PageHeading
        title="Historial de salidas"
        description="Consulta las salidas cobradas, las que no generaron cobro y los ingresos anulados."
        action={
          <Badge variant="success">{formatCurrency(history.totalCollectedCop)} cobrados</Badge>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No fue posible consultar el historial</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {truncated ? (
        <Alert variant="warning">
          <AlertTitle>Se muestran las {history.records.length} salidas más recientes</AlertTitle>
          <AlertDescription>
            El filtro tiene {history.totalCount} salidas en total. Acota el rango de fechas para ver
            las anteriores.
          </AlertDescription>
          <AlertActions>
            <Button type="button" variant="outline" size="sm" onClick={clearFilters}>
              <FilterX data-icon="inline-start" />
              Limpiar filtros
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="sessions-toolbar">
          <CardTitle className="title-with-icon">
            <History aria-hidden="true" /> {history.totalCount}{' '}
            {history.totalCount === 1 ? 'salida' : 'salidas'}
          </CardTitle>
          <div className="sessions-toolbar-actions">
            <Field>
              <FieldLabel htmlFor="history-search" className="sr-only">
                Buscar por matrícula
              </FieldLabel>
              <div className="search-field">
                <Search aria-hidden="true" />
                <Input
                  id="history-search"
                  className="min-h-11"
                  autoComplete="off"
                  placeholder="Buscar matrícula"
                  value={search}
                  onChange={(event) => setSearch(event.target.value.toUpperCase())}
                />
              </div>
            </Field>
            <Field>
              <FieldLabel htmlFor="history-from">Desde</FieldLabel>
              <Input
                id="history-from"
                className="min-h-11"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="history-to">Hasta</FieldLabel>
              <Input
                id="history-to"
                className="min-h-11"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
              />
            </Field>
            {hasFilters ? (
              <Button type="button" variant="ghost" onClick={clearFilters}>
                <FilterX data-icon="inline-start" />
                Limpiar filtros
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={reload}>
              <RefreshCw data-icon="inline-start" />
              Actualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="stable-status" role="status" aria-live="polite">
            {reprintMessage}
          </div>

          {loading ? (
            <p className="field-hint">Consultando el historial…</p>
          ) : history.records.length === 0 ? (
            <Empty className="module-empty border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History aria-hidden="true" />
                </EmptyMedia>
                <EmptyTitle>
                  {hasFilters ? 'Ninguna salida coincide' : 'Todavía no hay salidas'}
                </EmptyTitle>
                <EmptyDescription>
                  {hasFilters
                    ? 'Ajusta la matrícula o el rango de fechas para ampliar la búsqueda.'
                    : 'Las salidas aparecerán aquí en cuanto registres la primera.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <caption className="sr-only">
                  Salidas registradas con su estado, permanencia, lo cobrado y el recibo emitido.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Matrícula</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Salida</th>
                    <th scope="col">Permanencia</th>
                    <th scope="col">Cobro</th>
                    <th scope="col" className="numeric">
                      Total
                    </th>
                    <th scope="col">Recibo</th>
                    <th scope="col" className="actions">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {history.records.map((record) => {
                    const status = exitStatusOf(record)
                    return (
                      <tr key={record.sessionId} data-inactive={status === 'cancelled'}>
                        <th scope="row">
                          <span className="cell-stack">
                            <span className="plate-cell">{record.plate}</span>
                            <span className="cell-note">
                              {VEHICLE_TYPE_LABELS[record.vehicleType]}
                            </span>
                          </span>
                        </th>
                        <td>
                          <Badge variant={STATUS_VARIANTS[status]}>
                            {EXIT_STATUS_LABELS[status]}
                          </Badge>
                        </td>
                        <td>
                          <span className="cell-stack">
                            <span className="tabular">{formatTime(record.exitedAt)}</span>
                            <span className="cell-note tabular">{formatDate(record.exitedAt)}</span>
                          </span>
                        </td>
                        <td>
                          <span className="cell-stack">
                            <span className="tabular">{describeElapsed(record.totalMinutes)}</span>
                            <span className="cell-note tabular">
                              Desde {formatDateTime(record.enteredAt)}
                            </span>
                          </span>
                        </td>
                        <td className="cell-wide">
                          <span className="cell-stack">
                            <span>{record.ratePlanName ?? 'Tarifa eliminada'}</span>
                            <span className="cell-note">{describeCharge(record)}</span>
                          </span>
                        </td>
                        <td className="numeric tabular cell-total">
                          {formatCurrency(record.totalCop)}
                        </td>
                        <td>
                          {record.receiptNumber === null ? (
                            <span aria-hidden="true">—</span>
                          ) : (
                            <span className="cell-stack">
                              <span className="tabular">N.º {record.receiptNumber}</span>
                              {record.method === null ? null : (
                                <span className="cell-note">
                                  {PAYMENT_METHOD_LABELS[record.method]}
                                </span>
                              )}
                            </span>
                          )}
                        </td>
                        <td className="actions">
                          {record.receiptNumber === null ? null : (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void reprint(record)}
                            >
                              <Printer data-icon="inline-start" />
                              Reimprimir
                            </Button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
