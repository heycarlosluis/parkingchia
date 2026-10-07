import { HandCoins, Hourglass } from 'lucide-react'
import type { PendingPayment } from '@shared/contracts'
import { formatCurrency, formatDate, formatDateTime, formatTime } from '@shared/format'
import { describeElapsed } from '@shared/parking'
import { describeBilledTime, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

type PendingPaymentsCardProps = {
  payments: PendingPayment[]
  onCollect: (pending: PendingPayment) => void
}

/** Salidas que quedaron debiendo. Cada fila se cobra por separado. */
export function PendingPaymentsCard({
  payments,
  onCollect,
}: PendingPaymentsCardProps): React.JSX.Element {
  const totalCop = payments.reduce((total, pending) => total + pending.amountCop, 0)

  return (
    <Card>
      <CardHeader className="sessions-toolbar">
        <CardTitle className="title-with-icon">
          <Hourglass aria-hidden="true" /> Pagos pendientes
        </CardTitle>
        <Badge variant="warning">
          {payments.length} {payments.length === 1 ? 'pendiente' : 'pendientes'} ·{' '}
          {formatCurrency(totalCop)}
        </Badge>
      </CardHeader>
      <CardContent>
        <div className="table-scroll">
          <table className="data-table">
            <caption className="sr-only">
              Vehículos que salieron sin pagar, con la permanencia y el total que deben.
            </caption>
            <thead>
              <tr>
                <th scope="col">Matrícula</th>
                <th scope="col">Salida</th>
                <th scope="col">Permanencia</th>
                <th scope="col">Cobro</th>
                <th scope="col" className="numeric">
                  Total
                </th>
                <th scope="col" className="actions">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {payments.map((pending) => (
                <tr key={pending.id}>
                  <th scope="row">
                    <span className="cell-stack">
                      <span className="plate-cell">{pending.plate}</span>
                      <span className="cell-note">{VEHICLE_TYPE_LABELS[pending.vehicleType]}</span>
                    </span>
                  </th>
                  <td>
                    <span className="cell-stack">
                      <span className="tabular">{formatTime(pending.exitedAt)}</span>
                      <span className="cell-note tabular">{formatDate(pending.exitedAt)}</span>
                    </span>
                  </td>
                  <td>
                    <span className="cell-stack">
                      <span className="tabular">
                        {describeElapsed(pending.charge.totalMinutes)}
                      </span>
                      <span className="cell-note tabular">
                        Desde {formatDateTime(pending.enteredAt)}
                      </span>
                    </span>
                  </td>
                  <td className="cell-wide">
                    <span className="cell-stack">
                      <span>{pending.ratePlanName ?? 'Sin tarifa'}</span>
                      <span className="cell-note">{describeBilledTime(pending.charge)}</span>
                    </span>
                  </td>
                  <td className="numeric tabular cell-total">
                    {formatCurrency(pending.amountCop)}
                  </td>
                  <td className="actions">
                    <Button type="button" size="sm" onClick={() => onCollect(pending)}>
                      <HandCoins data-icon="inline-start" />
                      Cobrar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
