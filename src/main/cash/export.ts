import type { CashCloseSummary } from '@shared/contracts'
import { describeCashDifference, type CashPaymentStatus } from '@shared/cash'
import { elapsedMinutesOrZero } from '@shared/format'
import { formatMonthlyReceiptNumber } from '@shared/monthly'
import { describeElapsed, PAYMENT_METHOD_LABELS, type PaymentMethod } from '@shared/parking'
import { VEHICLE_TYPE_LABELS, type VehicleType } from '@shared/tariff'

/** Qué pasó con un vehículo dentro del turno exportado. */
export type CashReportOutcome =
  'paid' | 'voided' | 'pending' | 'monthly' | 'free' | 'cancelled' | 'parked' | 'paid-elsewhere'

export type CashReportVehicle = {
  plate: string
  vehicleType: VehicleType
  ratePlanName: string | null
  enteredAt: string
  /** `null` si el vehículo seguía en el parqueadero al cerrar la caja. */
  exitedAt: string | null
  outcome: CashReportOutcome
  /** Lo cobrado en esta caja o, si quedó pendiente, lo que debe. */
  amountCop: number
  method: PaymentMethod | null
  receiptNumber: number | null
  /** Momento del cobro en esta caja; `null` si no hubo cobro. */
  paidAt: string | null
  monthlyCustomerName: string | null
}

export type CashReportMonthlyPayment = {
  paidAt: string
  customerName: string
  plate: string
  planName: string
  amountCop: number
  method: PaymentMethod
  status: CashPaymentStatus
  receiptNumber: number | null
}

export type CashCloseReport = {
  summary: CashCloseSummary
  vehicles: CashReportVehicle[]
  monthlyPayments: CashReportMonthlyPayment[]
}

const OUTCOME_LABELS: Record<CashReportOutcome, string> = {
  paid: 'Cobrado',
  voided: 'Cobro anulado',
  pending: 'Pago pendiente',
  monthly: 'Cubierto por mensualidad',
  free: 'Sin cobro',
  cancelled: 'Ingreso anulado',
  parked: 'En el parqueadero al cierre',
  'paid-elsewhere': 'Cobrado en otro turno',
}

export type CsvSeparator = ',' | ';'

/**
 * Separador que espera la hoja de cálculo del equipo.
 *
 * Excel parte las columnas con el separador de listas de la configuración
 * regional: punto y coma donde el decimal es la coma (Colombia) y coma donde
 * es el punto. Con el separador equivocado todo el archivo cae en una columna.
 */
export function csvSeparatorFor(locale: string): CsvSeparator {
  try {
    return new Intl.NumberFormat(locale).format(1.5).includes(',') ? ';' : ','
  } catch {
    return ';'
  }
}

/** Sin la marca de orden de bytes, Excel lee las tildes como texto dañado. */
const BYTE_ORDER_MARK = '﻿'

type Cell = string | number | null

/** Una fila por movimiento; todas las filas del archivo tienen estas columnas. */
const COLUMNS = [
  'Concepto',
  'Placa',
  'Tipo de vehículo',
  'Fecha de ingreso',
  'Hora de ingreso',
  'Fecha de salida',
  'Hora de salida',
  'Permanencia',
  'Minutos',
  'Tarifa',
  'Estado',
  'Cobrado',
  'Anulado',
  'Pago pendiente',
  'Valor',
  'Medio de pago',
  'Recibo',
  'Fecha de cobro',
  'Hora de cobro',
  'Cliente mensual',
  'Empleado',
] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

/** Fecha local `AAAA-MM-DD`: una hoja de cálculo la entiende en cualquier idioma. */
function localDate(isoUtc: string | null): string | null {
  if (isoUtc === null) return null
  const date = new Date(isoUtc)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Hora local `HH:mm`, en su propia columna para que no se recorte al abrir el archivo. */
function localTime(isoUtc: string | null): string | null {
  if (isoUtc === null) return null
  const date = new Date(isoUtc)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function yesNo(value: boolean): string {
  return value ? 'Sí' : 'No'
}

function cell(value: Cell, separator: CsvSeparator): string {
  if (value === null) return ''
  if (typeof value === 'number') return String(value)
  // Un nombre o una nota que empiece por un signo de fórmula se ejecutaría al abrir el archivo.
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return safe.includes(separator) || /["\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe
}

/** Nombre sugerido para el archivo, con la fecha y hora local del cierre. */
export function cashCloseCsvFileName(summary: CashCloseSummary): string {
  const time = localTime(summary.closedAt)?.replace(':', '') ?? ''
  return `cierre-caja-${localDate(summary.closedAt)}-${time}.csv`
}

/**
 * Reporte de un turno cerrado en CSV.
 *
 * Arriba va una sola tabla con encabezado y una fila por movimiento: cada
 * vehículo del turno y cada pago de mensualidad, con las mismas columnas.
 * Debajo, separado por una fila vacía, el resumen de la caja en dos columnas.
 * Todas las filas tienen el mismo número de celdas para que ninguna hoja de
 * cálculo desacomode las columnas.
 */
export function createCashCloseCsv(
  report: CashCloseReport,
  parkingName: string | null,
  separator: CsvSeparator = ';',
): string {
  const { summary } = report
  const employee = summary.employeeName ?? 'Sin empleado'

  const vehicleRows: Cell[][] = report.vehicles.map((vehicle) => {
    const minutes =
      vehicle.exitedAt === null ? null : elapsedMinutesOrZero(vehicle.enteredAt, vehicle.exitedAt)
    return [
      'Parqueo',
      vehicle.plate,
      VEHICLE_TYPE_LABELS[vehicle.vehicleType],
      localDate(vehicle.enteredAt),
      localTime(vehicle.enteredAt),
      localDate(vehicle.exitedAt),
      localTime(vehicle.exitedAt),
      minutes === null ? null : describeElapsed(minutes),
      minutes,
      vehicle.ratePlanName,
      OUTCOME_LABELS[vehicle.outcome],
      yesNo(vehicle.outcome === 'paid'),
      yesNo(vehicle.outcome === 'voided' || vehicle.outcome === 'cancelled'),
      yesNo(vehicle.outcome === 'pending'),
      vehicle.amountCop,
      vehicle.method === null ? null : PAYMENT_METHOD_LABELS[vehicle.method],
      vehicle.receiptNumber,
      localDate(vehicle.paidAt),
      localTime(vehicle.paidAt),
      vehicle.monthlyCustomerName,
      employee,
    ]
  })

  const monthlyRows: Cell[][] = report.monthlyPayments.map((payment) => {
    const completed = payment.status === 'completed'
    return [
      'Mensualidad',
      payment.plate,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      payment.planName,
      completed ? 'Cobrado' : 'Cobro anulado',
      yesNo(completed),
      yesNo(!completed),
      'No',
      payment.amountCop,
      PAYMENT_METHOD_LABELS[payment.method],
      payment.receiptNumber === null ? null : formatMonthlyReceiptNumber(payment.receiptNumber),
      localDate(payment.paidAt),
      localTime(payment.paidAt),
      payment.customerName,
      employee,
    ]
  })

  const summaryRows: Cell[][] = [
    ['Resumen de la caja', null],
    ['Parqueadero', parkingName ?? 'Parking Chía'],
    ['Empleado a cargo', employee],
    ['Fecha de apertura', localDate(summary.openedAt)],
    ['Hora de apertura', localTime(summary.openedAt)],
    ['Fecha de cierre', localDate(summary.closedAt)],
    ['Hora de cierre', localTime(summary.closedAt)],
    ['Fondo inicial', summary.openingAmountCop],
    ['Ingresos por parqueo', summary.parkingCollectedCop],
    ['Ingresos por mensualidades', summary.monthlyCollectedCop],
    ['Total recaudado', summary.collectedCop],
    ['Anulado', summary.voidedCop],
    [summary.closingAmountCop === null ? 'Total del turno' : 'Esperado', summary.expectedAmountCop],
    ...(summary.closingAmountCop === null
      ? []
      : ([
          ['Efectivo contado', summary.closingAmountCop],
          ['Diferencia', summary.differenceCop],
          ['Resultado del arqueo', describeCashDifference(summary.differenceCop)],
        ] satisfies Cell[][])),
    ['Movimientos de caja', summary.movementCount],
    ['Vehículos del turno', report.vehicles.length],
    ['Pagos pendientes al cierre', summary.pendingBalance.count],
    ['Saldo pendiente al cierre', summary.pendingBalance.totalCop],
  ]

  const rows: Cell[][] = [[...COLUMNS], ...vehicleRows, ...monthlyRows, [], ...summaryRows]
  const lines = rows.map((row) =>
    Array.from({ length: COLUMNS.length }, (_, index) => cell(row[index] ?? null, separator)).join(
      separator,
    ),
  )
  return `${BYTE_ORDER_MARK}${lines.join('\r\n')}\r\n`
}
