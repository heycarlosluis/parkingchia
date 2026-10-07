import bwipjs from 'bwip-js/node'
import type {
  CashCloseSummary,
  EntryRegistration,
  PaperWidth,
  ParkingProfile,
  PendingPayment,
} from '@shared/contracts'
import { formatCurrency, formatDateTime } from '@shared/format'
import { describeCashDifference, describePendingCount } from '@shared/cash'
import { PRINTABLE_WIDTH_MM } from '@shared/ipc'
import { formatNit } from '@shared/nit'
import { describeElapsed, PAYMENT_METHOD_LABELS } from '@shared/parking'
import { describeBillingUnit, VEHICLE_TYPE_LABELS } from '@shared/tariff'
import { describeCoverage } from '@shared/monthly'
import { encodeEntryTicketReference, formatEntryTicketReference } from '@shared/entry-ticket'
import type { MonthlyReceiptSnapshot } from '@main/monthly/service'
import type { FreeExitTicket, ReceiptSnapshot } from '@main/parking/service'

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

// El ancho estándar de cada rollo vive en `@shared/ipc`: lo usan también Configuración y el servicio.
export { PRINTABLE_WIDTH_MM }

/**
 * Cómo se acomoda el documento en el papel de la impresora elegida.
 *
 * Cada driver térmico declara el papel a su manera: unos publican 72 mm sin
 * márgenes, otros 80 mm con márgenes propios y otros ignoran el tamaño pedido.
 * El contenido mide como máximo `widthMm`, se centra en lo que el driver
 * declare imprimible y se encoge si ese espacio es menor; el ajuste manual
 * cubre a los drivers que declaran medidas que no coinciden con el cabezal.
 */
export type PrintLayout = {
  paperWidth: PaperWidth
  /** Ancho del contenido; `null` usa el imprimible estándar del rollo. */
  widthMm: number | null
  /** Positivo mueve el contenido a la derecha. */
  offsetMm: number
}

type LayoutInput = PaperWidth | PrintLayout

function toLayout(input: LayoutInput): PrintLayout {
  return typeof input === 'string' ? { paperWidth: input, widthMm: null, offsetMm: 0 } : input
}

export function contentWidthMm(layout: PrintLayout): number {
  return layout.widthMm ?? PRINTABLE_WIDTH_MM[layout.paperWidth]
}

/** Margen lateral del cuerpo de todos los documentos. */
const BODY_PADDING_MM = 2

/**
 * Un punto del cabezal: la página de 72 mm se imprime en 576 puntos (203 ppp).
 *
 * Los símbolos se dibujan con módulos de un número entero de puntos y
 * alineados a la rejilla del cabezal. Si un módulo midiera 1,7 puntos, unas
 * barras saldrían de 1 punto y otras de 2, y el lector no reconocería las
 * proporciones del Code 128.
 */
const DOT_MM = 0.125

type SymbolSize = {
  /** Módulo del Code 128: 3 puntos (0,375 mm) en 80 mm y 2 (0,25 mm) en 58 mm. */
  barcodeModuleDots: number
  barcodeHeightMm: number
  /** Módulo del QR: 8 puntos (1 mm) en 80 mm y 6 (0,75 mm) en 58 mm. */
  qrModuleDots: number
}

const SYMBOL_SIZES: Record<PaperWidth, SymbolSize> = {
  '80mm': { barcodeModuleDots: 3, barcodeHeightMm: 12, qrModuleDots: 8 },
  '58mm': { barcodeModuleDots: 2, barcodeHeightMm: 10, qrModuleDots: 6 },
}

/** Unidades del SVG de bwip-js por módulo con `scale: 1`. */
const BWIP_UNITS_PER_MODULE = { code128: 1, qrcode: 2 } as const

/**
 * Da al SVG un tamaño exacto en puntos del cabezal y lo centra.
 *
 * Si el driver declarara un área más angosta que el símbolo, `max-width` lo
 * comprime antes que dejarlo cortado.
 */
function fitSymbol(
  svg: string,
  unitsPerModule: number,
  moduleDots: number,
  heightMm?: number,
): string {
  const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  if (!viewBox) throw new Error('bwip-js devolvió un SVG sin viewBox')
  const modulesWide = Number(viewBox[1]) / unitsPerModule
  const modulesHigh = Number(viewBox[2]) / unitsPerModule
  const widthDots = Math.round(modulesWide * moduleDots)
  const height = heightMm ?? modulesHigh * moduleDots * DOT_MM
  // Un Code 128 tolera comprimirse a lo ancho con el alto fijo; un QR no: si
  // se encoge debe seguir siendo cuadrado o el lector deja de reconocerlo.
  const shrink = heightMm === undefined ? 'max-width: 100%; height: auto' : 'max-width: 100%'
  return svg.replace(
    '<svg ',
    `<svg width="${widthDots * DOT_MM}mm" height="${height}mm" preserveAspectRatio="none" shape-rendering="crispEdges" style="margin: 0 auto; ${shrink}" `,
  )
}

/**
 * Estilos comunes; el cuerpo mide el ancho del contenido y se centra.
 *
 * Ningún texto va en negrita: en el cabezal térmico el trazo grueso se empasta
 * y cuesta leerlo. La jerarquía sale del tamaño, las mayúsculas espaciadas y
 * los recuadros. Se usa una sans de sistema de trazo firme, disponible en
 * Windows y macOS, con cifras tabulares para alinear los importes.
 */
function ticketStyles(layout: PrintLayout): string {
  const width = contentWidthMm(layout)
  return `
      /* Sin @page: una regla de margen aquí anularía los márgenes que declara el driver. */
      * { box-sizing: border-box; font-weight: 400; }
      html { margin: 0; padding: 0; }
      body { position: relative; left: ${layout.offsetMm}mm; width: ${width}mm; max-width: 100%; margin: 0 auto; padding: ${BODY_PADDING_MM}mm ${BODY_PADDING_MM}mm 6mm; color: #000; background: #fff; font: 13px/1.35 Arial, 'Helvetica Neue', Helvetica, sans-serif; font-variant-numeric: tabular-nums; }
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
      .scan-block svg { display: block; }
      .barcode { margin-top: 2mm; }
      .ticket-reference { margin-top: 1.5mm; font-size: 13px; letter-spacing: 0.08em; }
      .footer { text-align: center; font-size: 12px; }
      .legal { margin-top: 2mm; text-align: center; font-size: 11px; line-height: 1.3; }
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

/** Aviso de responsabilidad que cierra los documentos que se entregan al cliente. */
const LIABILITY_NOTE =
  '<p class="legal">El parqueadero no se hace responsable de los objetos dejados en el vehículo.</p>'

type DocumentHeader = {
  title: string
  /** Número o dato que identifica el documento, bajo el título. */
  meta?: string
}

function documentShell(
  layout: LayoutInput,
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
    <style>${ticketStyles(toLayout(layout))}</style>
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

export function createTestTicketHtml(layout: LayoutInput, profile: ParkingProfile | null): string {
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
    <p class="footer">Impresión de diagnóstico · Papel ${toLayout(layout).paperWidth}</p>`
  return documentShell(layout, profile, { title: 'Ticket de prueba', meta: ticketNumber }, body)
}

/** El mismo código identifica el ingreso activo o su deuda pendiente. */
function ticketScanBlock(layout: LayoutInput, sessionId: string, instruction: string): string {
  // QR y Code 128 llevan el mismo código numérico: cualquiera de los dos abre la salida.
  const reference = encodeEntryTicketReference(sessionId)
  const sizes = SYMBOL_SIZES[toLayout(layout).paperWidth]
  // Corrección Q (25 %): tolera manchas y roces del papel térmico. `eclevel` es
  // una opción de BWIPP que los tipos de bwip-js no declaran.
  const qrOptions = {
    bcid: 'qrcode',
    text: reference,
    eclevel: 'Q',
    scale: 1,
    // Zona de silencio de 4 módulos; en el QR cada módulo son 2 unidades.
    paddingwidth: 8,
    paddingheight: 8,
  }
  const qrSvg = fitSymbol(bwipjs.toSVG(qrOptions), BWIP_UNITS_PER_MODULE.qrcode, sizes.qrModuleDots)
  const barcodeSvg = fitSymbol(
    bwipjs.toSVG({
      bcid: 'code128',
      text: reference,
      scale: 1,
      height: 8,
      // Zona de silencio de 10 módulos a cada lado, dentro del propio símbolo.
      paddingwidth: 10,
      paddingheight: 0,
    }),
    BWIP_UNITS_PER_MODULE.code128,
    sizes.barcodeModuleDots,
    sizes.barcodeHeightMm,
  )
  return `<section class="scan-block" aria-label="Códigos del tiquete">
      <p class="scan-title">${escapeHtml(instruction)}</p>
      <div class="qr">${qrSvg}</div>
      <div class="barcode">${barcodeSvg}</div>
      <p class="ticket-reference">${escapeHtml(formatEntryTicketReference(reference))}</p>
    </section>`
}

export function createEntryTicketHtml(
  layout: LayoutInput,
  profile: ParkingProfile | null,
  entry: EntryRegistration,
  options: TicketRenderOptions = {},
): string {
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
    ${ticketScanBlock(layout, entry.sessionId, 'Escanee para registrar la salida')}
    ${RULE}
    <p class="footer">Conserve este tiquete.<br />Se exige para retirar el vehículo.</p>
    ${LIABILITY_NOTE}`
  return documentShell(layout, profile, { title: 'Tiquete de ingreso' }, body, options)
}

export function createPendingPaymentTicketHtml(
  layout: LayoutInput,
  profile: ParkingProfile | null,
  pending: PendingPayment,
  options: TicketRenderOptions = {},
): string {
  const body = `
    ${plateBlock(pending.plate, pending.vehicleType)}
    ${RULE}
    <dl>
      ${row('Ingreso', dateTimeHtml(pending.enteredAt))}
      ${row('Salida', dateTimeHtml(pending.exitedAt))}
      ${row('Permanencia', escapeHtml(describeElapsed(pending.charge.totalMinutes)))}
      ${row('Tarifa', escapeHtml(pending.ratePlanName ?? 'Sin tarifa'))}
      ${pending.employeeName === null ? '' : row('Atendió', escapeHtml(pending.employeeName))}
    </dl>
    ${RULE}
    ${totalBlock('Saldo pendiente', pending.amountCop)}
    <p class="footer">El vehículo ya salió.<br />Este tiquete no acredita un pago.</p>
    ${RULE}
    ${ticketScanBlock(layout, pending.sessionId, 'Escanee para consultar el pago pendiente')}
    ${LIABILITY_NOTE}`
  return documentShell(layout, profile, { title: 'Tiquete de pago pendiente' }, body, options)
}

export function createExitReceiptHtml(
  layout: LayoutInput,
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
  // Un pago pendiente se cobra después de la salida: el recibo dice cuándo.
  const paidLater = receipt.issuedAt !== receipt.exitedAt

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
      ${paidLater ? row('Pagado', dateTimeHtml(receipt.issuedAt)) : ''}
      ${receipt.employeeName === null ? '' : row('Atendió', escapeHtml(receipt.employeeName))}
    </dl>
    ${notesBlock(receipt.notes)}
    ${RULE}
    <p class="footer">Gracias por su visita.</p>
    ${LIABILITY_NOTE}`
  return documentShell(
    layout,
    profile,
    { title: 'Recibo de salida', meta: `N.º ${receipt.receiptNumber}` },
    body,
    options,
  )
}

/** Comprobante de una salida que cerró en cero: deja constancia sin ser un recibo. */
export function createFreeExitTicketHtml(
  layout: LayoutInput,
  profile: ParkingProfile | null,
  ticket: FreeExitTicket,
  options: TicketRenderOptions = {},
): string {
  const body = `
    ${plateBlock(ticket.plate, ticket.vehicleType)}
    ${RULE}
    <dl>
      ${row('Ingreso', dateTimeHtml(ticket.enteredAt))}
      ${row('Salida', dateTimeHtml(ticket.exitedAt))}
      ${row('Permanencia', escapeHtml(describeElapsed(ticket.totalMinutes)))}
      ${row('Tarifa', escapeHtml(ticket.ratePlanName ?? 'Sin tarifa'))}
      ${ticket.monthlyCustomerName === null ? '' : row('Mensualidad', escapeHtml(ticket.monthlyCustomerName))}
    </dl>
    ${RULE}
    ${totalBlock('Total', 0)}
    <dl>
      ${row('Pago', ticket.monthlyCustomerName === null ? 'Sin cobro' : 'Cubierto por mensualidad')}
      ${ticket.employeeName === null ? '' : row('Atendió', escapeHtml(ticket.employeeName))}
    </dl>
    ${notesBlock(ticket.notes)}
    ${RULE}
    <p class="footer">Gracias por su visita.</p>
    ${LIABILITY_NOTE}`
  return documentShell(layout, profile, { title: 'Comprobante de salida' }, body, options)
}

export function createMonthlyReceiptHtml(
  layout: LayoutInput,
  profile: ParkingProfile | null,
  receipt: MonthlyReceiptSnapshot,
  options: TicketRenderOptions = {},
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
    <p class="footer">Conserve este comprobante mientras dure la mensualidad.</p>
    ${LIABILITY_NOTE}`
  return documentShell(
    layout,
    profile,
    { title: 'Recibo de mensualidad', meta: `N.º ${receipt.receiptNumber}` },
    body,
    options,
  )
}

export function createCashCloseReceiptHtml(
  layout: LayoutInput,
  profile: ParkingProfile | null,
  summary: CashCloseSummary,
): string {
  // Un turno cerrado sin conteo (cobro simplificado) no tiene efectivo contado
  // ni diferencia: el importe principal pasa a ser lo acumulado en el turno.
  const totals =
    summary.closingAmountCop === null
      ? `<dl>
      ${summary.openingAmountCop === 0 ? '' : row('Fondo inicial', escapeHtml(formatCurrency(summary.openingAmountCop)))}
      ${row('Recaudado', escapeHtml(formatCurrency(summary.collectedCop)))}
      ${row('Anulado', escapeHtml(formatCurrency(summary.voidedCop)))}
    </dl>
    ${totalBlock('Total del turno', summary.expectedAmountCop)}`
      : `<dl>
      ${row('Fondo inicial', escapeHtml(formatCurrency(summary.openingAmountCop)))}
      ${row('Recaudado', escapeHtml(formatCurrency(summary.collectedCop)))}
      ${row('Anulado', escapeHtml(formatCurrency(summary.voidedCop)))}
      ${row('Esperado', escapeHtml(formatCurrency(summary.expectedAmountCop)))}
    </dl>
    ${totalBlock('Efectivo contado', summary.closingAmountCop)}
    <dl>
      ${row('Diferencia', escapeHtml(describeCashDifference(summary.differenceCop)))}
    </dl>`

  // Fuera del bloque de totales: es dinero por cobrar, no parte del arqueo.
  const pending =
    summary.pendingBalance.count === 0
      ? ''
      : `${RULE}
    <dl>
      ${row(describePendingCount(summary.pendingBalance.count), escapeHtml(formatCurrency(summary.pendingBalance.totalCop)))}
    </dl>
    <p class="note">Por cobrar: no se suma ni se resta del total del turno.</p>`

  const body = `
    <dl>
      ${row('Apertura', dateTimeHtml(summary.openedAt))}
      ${row('Cierre', dateTimeHtml(summary.closedAt))}
      ${summary.employeeName === null ? '' : row('Empleado', escapeHtml(summary.employeeName))}
      ${row('Movimientos', String(summary.movementCount))}
    </dl>
    ${RULE}
    ${totals}
    ${pending}
    ${RULE}
    <p class="footer">Conserve este comprobante del turno.</p>`
  return documentShell(layout, profile, { title: 'Cierre de caja' }, body)
}

function describeOffset(offsetMm: number): string {
  if (offsetMm === 0) return 'centrado'
  const amount = `${String(Math.abs(offsetMm)).replace('.', ',')} mm`
  return offsetMm > 0 ? `${amount} a la derecha` : `${amount} a la izquierda`
}

const RULER_HEIGHT_MM = 14
const RULER_EDGE_MM = 0.5

/**
 * Guía para ajustar la impresión en un equipo nuevo.
 *
 * Imprime una regla del ancho configurado con sus dos bordes y una marca por
 * milímetro. Lo que el operador ve cortado le indica qué valor elegir: la
 * última marca a la derecha es el ancho que el cabezal realmente imprime.
 */
export function createCalibrationGuideHtml(
  layout: PrintLayout,
  profile: ParkingProfile | null,
): string {
  const width = contentWidthMm(layout)
  // La regla es un único SVG con posiciones en milímetros. Con marcas HTML
  // posicionadas, las que quedaban fuera del área del driver hacían que
  // Chromium encogiera toda la página para que cupieran, y la regla dejaba de
  // medir milímetros reales. El SVG recorta lo que no cabe sin cambiar la escala.
  const marks: string[] = []
  for (let mm = 0; mm <= width; mm += 1) {
    const top = mm % 10 === 0 ? 9 : mm % 5 === 0 ? 11 : 12.5
    marks.push(`<line x1="${mm}mm" x2="${mm}mm" y1="${top}mm" y2="${RULER_HEIGHT_MM}mm" />`)
    if (mm % 10 !== 0) continue
    marks.push(
      mm === 0
        ? `<text x="1.2mm" y="8mm">0</text>`
        : `<text x="${mm}mm" y="8mm" text-anchor="middle">${mm}</text>`,
    )
  }
  const widthLabel = `${String(width).replace('.', ',')} mm`
  // Los bordes son trazos y no fondos: la impresión omite los fondos.
  const edge = (xMm: number): string =>
    `<line x1="${xMm}mm" x2="${xMm}mm" y1="0" y2="${RULER_HEIGHT_MM}mm" stroke-width="${RULER_EDGE_MM}mm" />`
  const body = `
    <dl>
      ${row('Ancho de impresión', escapeHtml(layout.widthMm === null ? `${widthLabel} (automático)` : widthLabel))}
      ${row('Ajuste horizontal', escapeHtml(describeOffset(layout.offsetMm)))}
    </dl>
    <svg class="ruler" width="100%" height="${RULER_HEIGHT_MM}mm" role="img" aria-label="Regla de ${escapeHtml(widthLabel)}" stroke="#000" stroke-width="0.25mm" font-size="10px" fill="#000">
      ${edge(RULER_EDGE_MM / 2)}
      ${edge(width - RULER_EDGE_MM / 2)}
      <g>${marks.join('')}</g>
      <line x1="0" x2="${width}mm" y1="${RULER_HEIGHT_MM - 0.125}mm" y2="${RULER_HEIGHT_MM - 0.125}mm" />
      <text x="${width / 2}mm" y="2.8mm" text-anchor="middle">centro</text>
      <line x1="${width / 2}mm" x2="${width / 2}mm" y1="3.4mm" y2="5mm" />
    </svg>
    <p class="edge-labels"><span>◀ borde izquierdo</span><span>borde derecho ▶</span></p>
    ${RULE}
    <ol class="steps">
      <li>Si ves completas las dos líneas gruesas de los bordes, la impresión está bien ajustada.</li>
      <li>Si falta la línea del borde derecho, elige como ancho de impresión el último milímetro que veas: cada marca es 1 mm y los números van de 10 en 10.</li>
      <li>Si sobra espacio en un lado y falta en el otro, mueve el ajuste horizontal hacia el lado que falta.</li>
    </ol>
    ${RULE}
    <p class="footer">Configuración › Impresión › Ajuste del papel</p>`
  return documentShell(layout, profile, { title: 'Guía de ajuste' }, body).replace(
    '</style>',
    `
      /* La regla ocupa todo el ancho del contenido, incluido el margen interior. */
      .ruler { display: block; width: calc(100% + ${BODY_PADDING_MM * 2}mm); margin: 3mm -${BODY_PADDING_MM}mm 0; }
      .ruler text { stroke: none; }
      .edge-labels { display: flex; justify-content: space-between; margin: 1mm -${BODY_PADDING_MM}mm 0; font-size: 10px; }
      .steps { margin: 0; padding-left: 5mm; font-size: 12px; }
      .steps li { margin: 1mm 0; }
    </style>`,
  )
}
