import bwipjs from 'bwip-js/node'
import type {
  CashCloseSummary,
  EntryRegistration,
  PaperWidth,
  ParkingProfile,
} from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import { formatNit } from '@shared/nit'
import { describeElapsed, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { describeBillingUnit, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { describeCoverage } from '@shared/monthly'
import {
  encodeEntryTicketBarcode,
  encodeEntryTicketQr,
  ENTRY_TICKET_VERSION,
  type EntryTicketPayload,
} from '@shared/entry-ticket'
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

function logoHtml(profile: ParkingProfile | null): string {
  const logo = profile?.logoDataUrl
  if (!logo || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(logo)) return ''
  return `<img class="logo" src="${escapeHtml(logo)}" alt="" />`
}

function entryTicketPayload(entry: EntryRegistration): EntryTicketPayload {
  return {
    version: ENTRY_TICKET_VERSION,
    sessionId: entry.sessionId,
    plate: entry.plate,
    vehicleType: entry.vehicleType,
    ratePlanId: entry.ratePlanId,
    ratePlanName: entry.ratePlanName,
    ratePlanAmountCop: entry.ratePlanAmountCop,
    billingUnit: entry.billingUnit,
    enteredAt: entry.enteredAt,
    graceMinutes: entry.graceMinutes,
    employeeName: entry.employeeName,
    notes: entry.notes,
  }
}

/**
 * Ancho que el cabezal térmico realmente imprime.
 *
 * Un rollo de 80 mm deja unos 4 mm sin imprimir a cada lado (576 puntos a
 * 203 ppp, 72 mm) y uno de 58 mm deja 5 mm (384 puntos, 48 mm). Los drivers
 * publican el papel con ese ancho: maquetar sobre los 80 mm del rollo
 * desplaza el contenido hacia un lado y lo recorta en el borde.
 */
export const PRINTABLE_WIDTH_MM: Record<PaperWidth, number> = { '80mm': 72, '58mm': 48 }

/**
 * Estilos comunes; el cuerpo ocupa exactamente el ancho imprimible.
 *
 * Ningún texto va en negrita: en el cabezal térmico el trazo grueso se empasta
 * y cuesta leerlo. La jerarquía sale del tamaño, las mayúsculas espaciadas y
 * los recuadros. Se usa una sans de sistema de trazo firme, disponible en
 * Windows y macOS, con cifras tabulares para alinear los importes.
 */
function ticketStyles(paperWidth: PaperWidth): string {
  const width = PRINTABLE_WIDTH_MM[paperWidth]
  return `
      @page { margin: 0; }
      * { box-sizing: border-box; font-weight: 400; }
      html { margin: 0; padding: 0; }
      body { width: ${width}mm; margin: 0; padding: 2mm 2mm 6mm; color: #000; background: #fff; font: 13px/1.35 Arial, 'Helvetica Neue', Helvetica, sans-serif; font-variant-numeric: tabular-nums; }
      p { margin: 0; }
      .header { text-align: center; }
      .logo { display: block; max-width: 34mm; max-height: 16mm; object-fit: contain; margin: 0 auto 2mm; }
      .business { margin: 0; font-size: 18px; line-height: 1.2; overflow-wrap: anywhere; }
      .nit { margin-top: 0.5mm; font-size: 13px; }
      .contact { margin-top: 1mm; font-size: 12px; overflow-wrap: anywhere; }
      .doc-title { margin-top: 3mm; font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; }
      .doc-meta { margin-top: 0.5mm; font-size: 12px; }
      .reprint-mark { margin-top: 2mm; padding: 1.5mm; border: 1px solid #000; text-align: center; font-size: 13px; letter-spacing: 0.08em; }
      .rule { border-top: 1px dashed #000; margin: 2.5mm 0; }
      .plate-block { text-align: center; }
      .plate { font-size: 30px; line-height: 1.1; letter-spacing: 0.08em; overflow-wrap: anywhere; }
      .vehicle { margin-top: 0.5mm; font-size: 12px; letter-spacing: 0.12em; text-transform: uppercase; }
      dl { margin: 0; }
      .row { display: flex; justify-content: space-between; align-items: baseline; gap: 3mm; margin: 1.2mm 0; }
      dt { flex-shrink: 0; }
      dd { min-width: 0; margin: 0; text-align: right; overflow-wrap: anywhere; }
      /* El importe principal se destaca con el recuadro, no con el tamaño. */
      .total { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: baseline; column-gap: 3mm; margin: 2mm 0; padding: 1.2mm 2mm; border: 1px solid #000; }
      .total-label { letter-spacing: 0.08em; text-transform: uppercase; }
      .total-amount { margin-left: auto; }
      .note { margin-top: 2mm; overflow-wrap: anywhere; }
      .scan-block { break-inside: avoid; text-align: center; }
      .scan-title { margin-bottom: 1.5mm; font-size: 12px; }
      .qr svg { display: block; width: 31mm; height: 31mm; margin: 0 auto; }
      .barcode svg { display: block; width: 100%; max-height: 15mm; margin: 2mm auto 0; }
      .ticket-reference { margin-top: 1mm; font-size: 9px; overflow-wrap: anywhere; }
      .footer { text-align: center; font-size: 12px; }
      .nowrap { white-space: nowrap; }
    `
}

/**
 * Fecha y hora locales que, si no caben en una línea, se parten entre la
 * fecha y la hora y nunca dentro de «10:34 a. m.».
 */
function dateTimeHtml(isoUtc: string): string {
  return formatDateTime(isoUtc)
    .split(', ')
    .map((part) => `<span class="nowrap">${escapeHtml(part)}</span>`)
    .join(' ')
}

/** Fila etiqueta · valor; el valor ya viene escapado o es un literal seguro. */
function row(label: string, value: string): string {
  return `<div class="row"><dt>${escapeHtml(label)}</dt><dd>${value}</dd></div>`
}

/** Importe principal del documento, recuadrado para ubicarlo de un vistazo. */
function totalBlock(label: string, amountCop: number): string {
  return `<div class="total"><span class="total-label">${escapeHtml(label)}</span><span class="total-amount">${escapeHtml(formatCurrency(amountCop))}</span></div>`
}

function plateBlock(plate: string, vehicleType: EntryRegistration['vehicleType']): string {
  return `<div class="plate-block"><p class="plate">${escapeHtml(plate)}</p><p class="vehicle">${escapeHtml(VEHICLE_TYPE_LABELS[vehicleType])}</p></div>`
}

function notesBlock(notes: string | null): string {
  return notes === null || notes.trim() === ''
    ? ''
    : `<p class="note">Nota: ${escapeHtml(notes)}</p>`
}

const RULE = '<div class="rule"></div>'

type DocumentHeader = {
  title: string
  /** Número o dato que identifica el documento, bajo el título. */
  meta?: string
}

function documentShell(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  header: DocumentHeader,
  body: string,
  options: TicketRenderOptions = {},
): string {
  const contact = profile
    ? `<p class="contact">${escapeHtml(profile.address)}<br />${escapeHtml(profile.phone)}</p>`
    : ''
  const meta = header.meta ? `<p class="doc-meta">${escapeHtml(header.meta)}</p>` : ''
  const reprintMark = options.reprint
    ? `<p class="reprint-mark">** REIMPRESIÓN **<br />${dateTimeHtml(new Date().toISOString())}</p>`
    : ''
  return `<!doctype html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <title>${escapeHtml(header.title)}</title>
    <style>${ticketStyles(paperWidth)}</style>
  </head>
  <body>
    <header class="header">
      ${logoHtml(profile)}
      <h1 class="business">${escapeHtml(profile?.name ?? 'Parking Chía')}</h1>
      ${profile?.nit ? `<p class="nit">NIT ${escapeHtml(formatNit(profile.nit))}</p>` : ''}
      ${contact}
      <p class="doc-title">${escapeHtml(header.title)}</p>
      ${meta}
      ${reprintMark}
    </header>
    ${RULE}
    ${body}
  </body>
</html>`
}

export function createTestTicketHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
): string {
  const ticketNumber = `PR-${Date.now().toString().slice(-8)}`
  const body = `
    ${plateBlock('ABC123', 'car')}
    ${RULE}
    <dl>
      ${row('Fecha', dateTimeHtml(new Date().toISOString()))}
      ${row('Tarifa', 'Automóvil por hora')}
      ${row('Permanencia', '1 h 30 min')}
    </dl>
    ${totalBlock('Total', 5000)}
    ${RULE}
    <p class="footer">Impresión de diagnóstico · Papel ${paperWidth}</p>`
  return documentShell(paperWidth, profile, { title: 'Ticket de prueba', meta: ticketNumber }, body)
}

export function createEntryTicketHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  entry: EntryRegistration,
  options: TicketRenderOptions = {},
): string {
  const payload = entryTicketPayload(entry)
  const qrValue = encodeEntryTicketQr(payload)
  const barcodeValue = encodeEntryTicketBarcode(entry.sessionId)
  const qrSvg = bwipjs.toSVG({ bcid: 'qrcode', text: qrValue, scale: 2, padding: 0 })
  const barcodeSvg = bwipjs.toSVG({
    bcid: 'code128',
    text: barcodeValue,
    scale: 1,
    height: 8,
    padding: 0,
  })
  const body = `
    ${plateBlock(entry.plate, entry.vehicleType)}
    ${RULE}
    <dl>
      ${row('Ingreso', dateTimeHtml(entry.enteredAt))}
      ${row('Tarifa', escapeHtml(entry.ratePlanName))}
      ${row(`Costo por ${describeBillingUnit(entry.billingUnit)}`, escapeHtml(formatCurrency(entry.ratePlanAmountCop)))}
      ${row('Gracia', `${entry.graceMinutes} min`)}
      ${entry.employeeName === null ? '' : row('Recibió', escapeHtml(entry.employeeName))}
    </dl>
    ${notesBlock(entry.notes)}
    ${RULE}
    <section class="scan-block" aria-label="Códigos del tiquete">
      <p class="scan-title">Escanee para registrar la salida</p>
      <div class="qr">${qrSvg}</div>
      <div class="barcode">${barcodeSvg}</div>
      <p class="ticket-reference">Referencia ${escapeHtml(entry.sessionId)}</p>
    </section>
    ${RULE}
    <p class="footer">Conserve este tiquete.<br />Se exige para retirar el vehículo.</p>`
  return documentShell(paperWidth, profile, { title: 'Tiquete de ingreso' }, body, options)
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
      ? `<dl>
      ${row('Subtotal sin IVA', escapeHtml(formatCurrency(charge.subtotalCop)))}
      ${row(`IVA (${charge.taxPercent} %)`, escapeHtml(formatCurrency(charge.taxCop)))}
    </dl>`
      : ''
  const cashRows =
    receipt.receivedCop === null
      ? ''
      : `${row('Recibido', escapeHtml(formatCurrency(receipt.receivedCop)))}
      ${row('Cambio', escapeHtml(formatCurrency(receipt.changeCop ?? 0)))}`

  const body = `
    ${plateBlock(receipt.plate, receipt.vehicleType)}
    ${RULE}
    <dl>
      ${row('Ingreso', dateTimeHtml(receipt.enteredAt))}
      ${row('Salida', dateTimeHtml(receipt.exitedAt))}
      ${row('Permanencia', escapeHtml(describeElapsed(charge.totalMinutes)))}
      ${row('Tarifa', escapeHtml(receipt.ratePlanName ?? 'Sin tarifa'))}
    </dl>
    ${RULE}
    ${taxRows}
    ${totalBlock('Total', charge.totalCop)}
    <dl>
      ${row('Pago', escapeHtml(PAYMENT_METHOD_LABELS[receipt.method]))}
      ${cashRows}
      ${receipt.employeeName === null ? '' : row('Atendió', escapeHtml(receipt.employeeName))}
    </dl>
    ${notesBlock(receipt.notes)}
    ${RULE}
    <p class="footer">Gracias por su visita.</p>`
  return documentShell(
    paperWidth,
    profile,
    { title: 'Recibo de salida', meta: `N.º ${receipt.receiptNumber}` },
    body,
    options,
  )
}

export function createMonthlyReceiptHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  receipt: MonthlyReceiptSnapshot,
): string {
  const cashRows =
    receipt.receivedCop === null
      ? ''
      : `${row('Recibido', escapeHtml(formatCurrency(receipt.receivedCop)))}
      ${row('Cambio', escapeHtml(formatCurrency(receipt.changeCop ?? 0)))}`

  const body = `
    ${plateBlock(receipt.plate, receipt.vehicleType)}
    ${RULE}
    <dl>
      ${row('Cliente', escapeHtml(receipt.customerName))}
      ${receipt.documentNumber === null ? '' : row('Documento', escapeHtml(receipt.documentNumber))}
      ${row('Plan', escapeHtml(receipt.planName))}
      ${row('Vigencia', escapeHtml(describeCoverage(receipt.startsAt, receipt.endsAt)))}
      ${row('Emitido', dateTimeHtml(receipt.issuedAt))}
    </dl>
    ${RULE}
    <dl>
      ${row('Costo del periodo', escapeHtml(formatCurrency(receipt.amountCop)))}
    </dl>
    ${totalBlock('Pago recibido', receipt.paidCop)}
    <dl>
      ${row('Medio de pago', escapeHtml(PAYMENT_METHOD_LABELS[receipt.method]))}
      ${cashRows}
      ${receipt.reference === null ? '' : row('Referencia', escapeHtml(receipt.reference))}
      ${
        receipt.balanceCop <= 0
          ? row('Estado', 'Mensualidad pagada')
          : row('Saldo pendiente', escapeHtml(formatCurrency(receipt.balanceCop)))
      }
    </dl>
    ${RULE}
    <p class="footer">Conserve este comprobante mientras dure la mensualidad.</p>`
  return documentShell(
    paperWidth,
    profile,
    { title: 'Recibo de mensualidad', meta: `N.º ${receipt.receiptNumber}` },
    body,
  )
}

export function createCashCloseReceiptHtml(
  paperWidth: PaperWidth,
  profile: ParkingProfile | null,
  summary: CashCloseSummary,
): string {
  const difference =
    summary.differenceCop === 0
      ? 'Cuadra'
      : summary.differenceCop > 0
        ? `Sobra ${formatCurrency(summary.differenceCop)}`
        : `Falta ${formatCurrency(-summary.differenceCop)}`

  const body = `
    <dl>
      ${row('Apertura', dateTimeHtml(summary.openedAt))}
      ${row('Cierre', dateTimeHtml(summary.closedAt))}
      ${summary.employeeName === null ? '' : row('Empleado', escapeHtml(summary.employeeName))}
      ${row('Movimientos', String(summary.movementCount))}
    </dl>
    ${RULE}
    <dl>
      ${row('Fondo inicial', escapeHtml(formatCurrency(summary.openingAmountCop)))}
      ${row('Recaudado', escapeHtml(formatCurrency(summary.collectedCop)))}
      ${row('Anulado', escapeHtml(formatCurrency(summary.voidedCop)))}
      ${row('Esperado', escapeHtml(formatCurrency(summary.expectedAmountCop)))}
    </dl>
    ${totalBlock('Efectivo contado', summary.closingAmountCop)}
    <dl>
      ${row('Diferencia', escapeHtml(difference))}
    </dl>
    ${RULE}
    <p class="footer">Conserve este comprobante del turno.</p>`
  return documentShell(paperWidth, profile, { title: 'Cierre de caja' }, body)
}
