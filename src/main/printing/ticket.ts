import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type {
  CashCloseSummary,
  EntryRegistration,
  PaperWidth,
  ParkingProfile,
} from '@shared/contracts'
import { formatCurrency } from '@shared/format'
import { describeElapsed, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { describeBilledTime, describeBillingUnit, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { describeCoverage } from '@shared/monthly'
import type { MonthlyReceiptSnapshot } from '@main/monthly/service'
import type { ReceiptSnapshot } from '@main/parking/service'

/** Ajustes de render comunes a todos los documentos. */
export type TicketRenderOptions = {
  /**
   * Marca el documento como duplicado.
   *
   * Un tiquete o un recibo reimpreso circula igual que el original, así que
   * debe distinguirse en el papel: de lo contrario un duplicado sirve para
   * retirar un vehículo o para justificar dos veces el mismo cobro.
   */
  reprint?: boolean
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;',
    }
    return entities[character] ?? character
  })
}

export function createTestTicketHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
): string {
  const ticketNumber = `PR-${Date.now().toString().slice(-8)}`
  const localDate = format(new Date(), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
  const width = paperWidth === '58mm' ? 58 : 80

  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>Ticket de prueba</title>
    <style>
      @page { size: ${width}mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      body { width: ${width - 6}mm; margin: 0; color: #000; background: #fff; font: 11px/1.35 ui-monospace, monospace; }
      h1 { margin: 0 0 2mm; text-align: center; font-size: 17px; }
      .subtitle { margin: 0 0 3mm; text-align: center; font-weight: 700; }
      .rule { border-top: 1px dashed #000; margin: 2mm 0; }
      dl { margin: 0; }
      .row { display: flex; justify-content: space-between; gap: 3mm; margin: 1mm 0; }
      dt { font-weight: 400; }
      dd { margin: 0; text-align: right; font-weight: 700; }
      .total { font-size: 14px; }
      .footer { margin-top: 3mm; text-align: center; font-size: 9px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(profile?.name ?? 'Parking Chía')}</h1>
    ${profile ? `<p class="subtitle">${escapeHtml(profile.address)}<br />${escapeHtml(profile.phone)}</p>` : ''}
    <p class="subtitle">Ticket de prueba</p>
    <div class="rule"></div>
    <dl>
      <div class="row"><dt>Número</dt><dd>${escapeHtml(ticketNumber)}</dd></div>
      <div class="row"><dt>Fecha</dt><dd>${escapeHtml(localDate)}</dd></div>
      <div class="row"><dt>Matrícula</dt><dd>ABC123</dd></div>
      <div class="row"><dt>Tarifa</dt><dd>Automóvil / hora</dd></div>
    </dl>
    <div class="rule"></div>
    <div class="row total"><strong>Total</strong><strong>${escapeHtml(formatCurrency(5000))}</strong></div>
    <p class="footer">Impresión de diagnóstico · Papel ${paperWidth}</p>
  </body>
</html>`
}

function documentShell(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  title: string,
  body: string,
  options: TicketRenderOptions = {},
): string {
  const width = paperWidth === '58mm' ? 58 : 80
  const reprintMark = options.reprint
    ? `<p class="reprint-mark">** REIMPRESIÓN **<br />${escapeHtml(localDateTime(new Date().toISOString()))}</p>`
    : ''
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      @page { size: ${width}mm auto; margin: 3mm; }
      * { box-sizing: border-box; }
      body { width: ${width - 6}mm; margin: 0; color: #000; background: #fff; font: 11px/1.35 ui-monospace, monospace; }
      h1 { margin: 0 0 2mm; text-align: center; font-size: 17px; }
      .subtitle { margin: 0 0 3mm; text-align: center; font-weight: 700; }
      .rule { border-top: 1px dashed #000; margin: 2mm 0; }
      dl { margin: 0; }
      .row { display: flex; justify-content: space-between; gap: 3mm; margin: 1mm 0; }
      dt { font-weight: 400; }
      dd { margin: 0; text-align: right; font-weight: 700; }
      .plate { text-align: center; font-size: 22px; font-weight: 700; letter-spacing: 2px; margin: 2mm 0; }
      .total { font-size: 14px; }
      .note { margin: 2mm 0 0; text-align: left; }
      .reprint-mark { margin: 0 0 3mm; text-align: center; font-weight: 700; letter-spacing: 1px; }
      .footer { margin-top: 3mm; text-align: center; font-size: 9px; }
    </style>
  </head>
  <body>
    <h1>${escapeHtml(profile?.name ?? 'Parking Chía')}</h1>
    ${profile ? `<p class="subtitle">${escapeHtml(profile.address)}<br />${escapeHtml(profile.phone)}</p>` : ''}
    <p class="subtitle">${escapeHtml(title)}</p>
    ${reprintMark}
    <div class="rule"></div>
    ${body}
  </body>
</html>`
}

function localDateTime(isoUtc: string): string {
  return format(new Date(isoUtc), "d 'de' MMMM 'de' yyyy, HH:mm", { locale: es })
}

export function createEntryTicketHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  entry: EntryRegistration,
  options: TicketRenderOptions = {},
): string {
  const body = `
    <p class="plate">${escapeHtml(entry.plate)}</p>
    <dl>
      <div class="row"><dt>Vehículo</dt><dd>${escapeHtml(VEHICLE_TYPE_LABELS[entry.vehicleType])}</dd></div>
      <div class="row"><dt>Tarifa</dt><dd>${escapeHtml(entry.ratePlanName)}</dd></div>
      <div class="row"><dt>Costo por ${escapeHtml(describeBillingUnit(entry.billingUnit))}</dt><dd>${escapeHtml(formatCurrency(entry.ratePlanAmountCop))}</dd></div>
      <div class="row"><dt>Ingreso</dt><dd>${escapeHtml(localDateTime(entry.enteredAt))}</dd></div>
      <div class="row"><dt>Gracia</dt><dd>${entry.graceMinutes} min</dd></div>
    </dl>
    <div class="rule"></div>
    <p class="footer">Conserve este tiquete. Se exige para retirar el vehículo.</p>`
  return documentShell(paperWidth, profile, 'Tiquete de ingreso', body, options)
}

export function createExitReceiptHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  receipt: ReceiptSnapshot,
  options: TicketRenderOptions = {},
): string {
  const { charge } = receipt
  const taxRows =
    charge.taxPercent > 0
      ? `<div class="row"><dt>Subtotal sin IVA</dt><dd>${escapeHtml(formatCurrency(charge.subtotalCop))}</dd></div>
       <div class="row"><dt>IVA (${charge.taxPercent} %)</dt><dd>${escapeHtml(formatCurrency(charge.taxCop))}</dd></div>`
      : ''
  const cashRows =
    receipt.receivedCop === null
      ? ''
      : `<div class="row"><dt>Recibido</dt><dd>${escapeHtml(formatCurrency(receipt.receivedCop))}</dd></div>
       <div class="row"><dt>Cambio</dt><dd>${escapeHtml(formatCurrency(receipt.changeCop ?? 0))}</dd></div>`
  const employeeRow =
    receipt.employeeName === null
      ? ''
      : `<div class="row"><dt>Atendió</dt><dd>${escapeHtml(receipt.employeeName)}</dd></div>`
  const notesBlock =
    receipt.notes === null || receipt.notes.trim() === ''
      ? ''
      : `<p class="note">Nota: ${escapeHtml(receipt.notes)}</p>`

  const body = `
    <p class="plate">${escapeHtml(receipt.plate)}</p>
    <dl>
      <div class="row"><dt>Recibo</dt><dd>N.º ${receipt.receiptNumber}</dd></div>
      <div class="row"><dt>Vehículo</dt><dd>${escapeHtml(VEHICLE_TYPE_LABELS[receipt.vehicleType])}</dd></div>
      <div class="row"><dt>Tarifa</dt><dd>${escapeHtml(receipt.ratePlanName ?? 'Sin tarifa')}</dd></div>
      <div class="row"><dt>Ingreso</dt><dd>${escapeHtml(localDateTime(receipt.enteredAt))}</dd></div>
      <div class="row"><dt>Salida</dt><dd>${escapeHtml(localDateTime(receipt.exitedAt))}</dd></div>
      <div class="row"><dt>Permanencia</dt><dd>${escapeHtml(describeElapsed(charge.totalMinutes))}</dd></div>
      <div class="row"><dt>Cobrado</dt><dd>${escapeHtml(describeBilledTime(charge))}</dd></div>
    </dl>
    <div class="rule"></div>
    <dl>
      ${taxRows}
      <div class="row total"><dt><strong>Total</strong></dt><dd>${escapeHtml(formatCurrency(charge.totalCop))}</dd></div>
      <div class="row"><dt>Pago</dt><dd>${escapeHtml(PAYMENT_METHOD_LABELS[receipt.method])}</dd></div>
      ${cashRows}
      ${employeeRow}
    </dl>
    ${notesBlock}
    <div class="rule"></div>
    <p class="footer">Gracias por su visita.</p>`
  return documentShell(paperWidth, profile, 'Recibo de salida', body, options)
}

export function createMonthlyReceiptHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  receipt: MonthlyReceiptSnapshot,
): string {
  const cashRows =
    receipt.receivedCop === null
      ? ''
      : `<div class="row"><dt>Recibido</dt><dd>${escapeHtml(formatCurrency(receipt.receivedCop))}</dd></div>
       <div class="row"><dt>Cambio</dt><dd>${escapeHtml(formatCurrency(receipt.changeCop ?? 0))}</dd></div>`
  const documentRow =
    receipt.documentNumber === null
      ? ''
      : `<div class="row"><dt>Documento</dt><dd>${escapeHtml(receipt.documentNumber)}</dd></div>`
  const referenceRow =
    receipt.reference === null
      ? ''
      : `<div class="row"><dt>Referencia</dt><dd>${escapeHtml(receipt.reference)}</dd></div>`
  const balanceRow =
    receipt.balanceCop <= 0
      ? '<div class="row"><dt>Estado</dt><dd>Mensualidad pagada</dd></div>'
      : `<div class="row"><dt>Saldo pendiente</dt><dd>${escapeHtml(formatCurrency(receipt.balanceCop))}</dd></div>`

  const body = `
    <p class="plate">${escapeHtml(receipt.plate)}</p>
    <dl>
      <div class="row"><dt>Recibo</dt><dd>N.º ${receipt.receiptNumber}</dd></div>
      <div class="row"><dt>Cliente</dt><dd>${escapeHtml(receipt.customerName)}</dd></div>
      ${documentRow}
      <div class="row"><dt>Vehículo</dt><dd>${escapeHtml(VEHICLE_TYPE_LABELS[receipt.vehicleType])}</dd></div>
      <div class="row"><dt>Plan</dt><dd>${escapeHtml(receipt.planName)}</dd></div>
      <div class="row"><dt>Vigencia</dt><dd>${escapeHtml(describeCoverage(receipt.startsAt, receipt.endsAt))}</dd></div>
      <div class="row"><dt>Emitido</dt><dd>${escapeHtml(localDateTime(receipt.issuedAt))}</dd></div>
    </dl>
    <div class="rule"></div>
    <dl>
      <div class="row"><dt>Costo del periodo</dt><dd>${escapeHtml(formatCurrency(receipt.amountCop))}</dd></div>
      <div class="row total"><dt><strong>Pago recibido</strong></dt><dd>${escapeHtml(formatCurrency(receipt.paidCop))}</dd></div>
      <div class="row"><dt>Medio de pago</dt><dd>${escapeHtml(PAYMENT_METHOD_LABELS[receipt.method])}</dd></div>
      ${cashRows}
      ${referenceRow}
      ${balanceRow}
    </dl>
    <div class="rule"></div>
    <p class="footer">Conserve este comprobante mientras dure la mensualidad.</p>`
  return documentShell(paperWidth, profile, 'Recibo de mensualidad', body)
}

export function createCashCloseReceiptHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  summary: CashCloseSummary,
): string {
  const employeeRow =
    summary.employeeName === null
      ? ''
      : `<div class="row"><dt>Empleado</dt><dd>${escapeHtml(summary.employeeName)}</dd></div>`
  const differenceRow =
    summary.differenceCop === 0
      ? '<div class="row"><dt>Diferencia</dt><dd>Cuadra</dd></div>'
      : `<div class="row"><dt>Diferencia</dt><dd>${escapeHtml(
          summary.differenceCop > 0
            ? `Sobra ${formatCurrency(summary.differenceCop)}`
            : `Falta ${formatCurrency(-summary.differenceCop)}`,
        )}</dd></div>`

  const body = `
    <dl>
      <div class="row"><dt>Apertura</dt><dd>${escapeHtml(localDateTime(summary.openedAt))}</dd></div>
      <div class="row"><dt>Cierre</dt><dd>${escapeHtml(localDateTime(summary.closedAt))}</dd></div>
      ${employeeRow}
      <div class="row"><dt>Movimientos</dt><dd>${summary.movementCount}</dd></div>
    </dl>
    <div class="rule"></div>
    <dl>
      <div class="row"><dt>Fondo inicial</dt><dd>${escapeHtml(formatCurrency(summary.openingAmountCop))}</dd></div>
      <div class="row"><dt>Recaudado</dt><dd>${escapeHtml(formatCurrency(summary.collectedCop))}</dd></div>
      <div class="row"><dt>Anulado</dt><dd>${escapeHtml(formatCurrency(summary.voidedCop))}</dd></div>
      <div class="row"><dt>Esperado</dt><dd>${escapeHtml(formatCurrency(summary.expectedAmountCop))}</dd></div>
      <div class="row total"><dt><strong>Efectivo contado</strong></dt><dd>${escapeHtml(formatCurrency(summary.closingAmountCop))}</dd></div>
      ${differenceRow}
    </dl>
    <div class="rule"></div>
    <p class="footer">Cierre de caja · conserve este comprobante.</p>`
  return documentShell(paperWidth, profile, 'Cierre de caja', body)
}
