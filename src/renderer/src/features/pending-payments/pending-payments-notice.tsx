import { HandCoins, Printer } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ExitRegistration, PendingPayment } from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import { describeElapsed, describePendingPayments, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { Alert, AlertActions, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { SettlePendingDialog } from '@/features/pending-payments/settle-pending-dialog'
import { useParkingStore } from '@/store/parking-store'

type PendingPaymentsNoticeProps = {
  /** Matrícula normalizada. El llamador usa `key={plate}` para no arrastrar el último cobro. */
  plate: string
  /** Solo informa: dentro de otro cobro no se abre un segundo diálogo. */
  readOnly?: boolean
}

/**
 * Avisa que una matrícula tiene salidas sin pagar y permite cobrarlas.
 *
 * Cada pendiente es independiente: se lista y se cobra por separado, con su
 * propio recibo. Sin pendientes no dibuja nada.
 */
export function PendingPaymentsNotice({
  plate,
  readOnly = false,
}: PendingPaymentsNoticeProps): React.JSX.Element | null {
  const pendingPayments = useParkingStore((store) => store.pendingPayments)
  const clearError = useParkingStore((store) => store.clearError)
  const [collecting, setCollecting] = useState<PendingPayment | null>(null)
  const [settled, setSettled] = useState<ExitRegistration | null>(null)
  const [reprintMessage, setReprintMessage] = useState('')

  const payments = useMemo(
    () => pendingPayments.filter((pending) => pending.plate === plate),
    [pendingPayments, plate],
  )

  const reprint = async (sessionId: string): Promise<void> => {
    setReprintMessage('Enviando el recibo…')
    const result = await window.parkingAPI.reprintReceipt({ sessionId })
    setReprintMessage(result.ok ? result.data.message : result.error.message)
  }

  if (payments.length === 0 && settled === null) return null

  return (
    <>
      {settled ? (
        <Alert variant="success">
          <AlertTitle>
            Pago pendiente cobrado · {settled.plate} · {formatCurrency(settled.charge.totalCop)}
          </AlertTitle>
          <AlertDescription>
            <span>
              Recibo N.º {settled.receiptNumber} · {PAYMENT_METHOD_LABELS[settled.method]}
              {settled.changeCop === null
                ? ''
                : ` · Cambio a entregar: ${formatCurrency(settled.changeCop)}`}
            </span>
            <span className="reprint-status">
              {reprintMessage === '' ? settled.printMessage : reprintMessage}
            </span>
          </AlertDescription>
          <AlertActions>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void reprint(settled.sessionId)}
            >
              <Printer data-icon="inline-start" />
              Reimprimir recibo
            </Button>
          </AlertActions>
        </Alert>
      ) : null}

      {payments.length > 0 ? (
        <Alert variant="warning">
          <AlertTitle>{describePendingPayments(payments.length)}</AlertTitle>
          <AlertDescription>
            <ul className="pending-list">
              {payments.map((pending) => (
                <li key={pending.id}>
                  <span>
                    Salió el <span className="tabular">{formatDateTime(pending.exitedAt)}</span> ·{' '}
                    {describeElapsed(pending.charge.totalMinutes)}
                  </span>
                  {readOnly ? (
                    <span className="tabular pending-list-amount">
                      {formatCurrency(pending.amountCop)}
                    </span>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        clearError()
                        setCollecting(pending)
                      }}
                    >
                      <HandCoins data-icon="inline-start" />
                      Cobrar <span className="tabular">{formatCurrency(pending.amountCop)}</span>
                    </Button>
                  )}
                </li>
              ))}
            </ul>
            <p>
              {readOnly
                ? 'No se suma a este cobro: se cobra aparte desde Pagos pendientes, en Parqueo activo.'
                : 'Cada pago pendiente se cobra por separado y genera su propio recibo.'}
            </p>
          </AlertDescription>
        </Alert>
      ) : null}

      {collecting ? (
        <SettlePendingDialog
          key={collecting.id}
          pending={collecting}
          onOpenChange={(open) => {
            if (!open) setCollecting(null)
          }}
          onSettled={(exit) => {
            setCollecting(null)
            setSettled(exit)
            setReprintMessage('')
          }}
        />
      ) : null}
    </>
  )
}
