import { History, Printer, RefreshCw, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { ExitHistory, ExitRecord } from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import { describeElapsed, MAX_HISTORY_PAGE_SIZE, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { describeBilledTime, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Field, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { PageHeading } from '@/components/page-heading'

const EMPTY_HISTORY: ExitHistory = { records: [], totalCount: 0, totalCollectedCop: 0 }

function localTime(isoUtc: string): string {
  return new Date(isoUtc).toLocaleString('es-CO', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
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

  return (
    <div className="page-stack">
      <PageHeading
        title="Historial de salidas"
        description="Consulta las salidas cobradas, las que no generaron cobro y los ingresos anulados."
        action={
          <Badge variant="secondary">{formatCurrency(history.totalCollectedCop)} cobrados</Badge>
        }
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>No fue posible consultar el historial</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
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
                  Salidas registradas con su permanencia, lo cobrado y el recibo emitido.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Matrícula</th>
                    <th scope="col">Vehículo</th>
                    <th scope="col" className="numeric">
                      Salida
                    </th>
                    <th scope="col" className="numeric">
                      Permanencia
                    </th>
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
                  {history.records.map((record) => (
                    <tr key={record.sessionId} data-inactive={record.status === 'cancelled'}>
                      <th scope="row" className="plate-cell">
                        {record.plate}
                      </th>
                      <td>{VEHICLE_TYPE_LABELS[record.vehicleType]}</td>
                      <td className="numeric tabular">{localTime(record.exitedAt)}</td>
                      <td className="numeric tabular">{describeElapsed(record.totalMinutes)}</td>
                      <td>
                        {record.status === 'cancelled'
                          ? 'Ingreso anulado'
                          : record.monthlyCustomerName !== null
                            ? `Mensualidad · ${record.monthlyCustomerName}`
                            : record.charge === null
                              ? 'Sin cobro'
                              : describeBilledTime(record.charge)}
                      </td>
                      <td className="numeric tabular">{formatCurrency(record.totalCop)}</td>
                      <td>
                        {record.receiptNumber === null ? (
                          '—'
                        ) : (
                          <span className="tabular">
                            N.º {record.receiptNumber}
                            {record.method === null
                              ? ''
                              : ` · ${PAYMENT_METHOD_LABELS[record.method]}`}
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
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
