// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { EntryRegistration } from '@shared/contracts'
import { encodeEntryTicketReference, formatEntryTicketReference } from '@shared/entry-ticket'
import { calculateChargeForMinutes, DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'
import type { MonthlyReceiptSnapshot } from '@main/monthly/service'
import type { ReceiptSnapshot } from '@main/parking/service'
import { isPrintCancellation } from './service'
import {
  createCalibrationGuideHtml,
  createCashCloseReceiptHtml,
  createEntryTicketHtml,
  createExitReceiptHtml,
  createMonthlyReceiptHtml,
  createTestTicketHtml,
} from './ticket'

const profile = {
  name: 'Parqueadero <Central>',
  address: 'Carrera 10 # 12-34',
  phone: '300 123 4567',
  nit: '800197268-4',
  logoDataUrl: 'data:image/png;base64,aGVsbG8=',
}

const entry: EntryRegistration = {
  sessionId: '123e4567-e89b-12d3-a456-426614174000',
  plate: 'ABC123',
  vehicleType: 'motorcycle',
  ratePlanId: 'rate-motorcycle',
  ratePlanName: 'Motocicleta por hora',
  ratePlanAmountCop: 2500,
  billingUnit: 'hour',
  enteredAt: '2026-08-18T15:00:00.000Z',
  graceMinutes: 15,
  employeeName: 'Ana Ruiz',
  notes: 'Casco en depósito',
  printed: false,
  printMessage: '',
}

const charge = calculateChargeForMinutes(
  90,
  { ...DEFAULT_TARIFF_SETTINGS, taxEnabled: true, taxPercent: 19, taxIncludedInPrice: true },
  { amountCop: 5000, minimumChargeCop: 0, plenaCop: null, graceMinutes: null },
)

const receipt: ReceiptSnapshot = {
  version: 1,
  receiptNumber: 7,
  issuedAt: '2026-08-18T16:30:00.000Z',
  plate: 'ABC123',
  vehicleType: 'car',
  ratePlanName: 'Automóvil por hora',
  enteredAt: '2026-08-18T15:00:00.000Z',
  exitedAt: '2026-08-18T16:30:00.000Z',
  charge,
  method: 'cash',
  receivedCop: 20_000,
  changeCop: 20_000 - charge.totalCop,
  employeeName: 'Ana Ruiz',
  notes: null,
}

describe('tiquete de ingreso', () => {
  it('incluye matrícula, tarifa, costo por hora y gracia, y escapa el perfil', () => {
    const html = createEntryTicketHtml('80mm', profile, entry)
    expect(html).toContain('ABC123')
    expect(html).toContain('Motocicleta por hora')
    expect(html).toContain('Costo por hora')
    expect(html).toContain('15 min')
    expect(html).toContain('Ana Ruiz')
    expect(html).toContain('Casco en depósito')
    expect(html).toContain('data:image/png;base64,aGVsbG8=')
    expect(html).toContain('Escanee para registrar la salida')
    expect(html).toContain('<svg')
    // El código numérico se imprime agrupado para teclearlo sin lector.
    expect(html).toContain(formatEntryTicketReference(encodeEntryTicketReference(entry.sessionId)))
    expect(html).not.toContain('PC1Q')
    expect(html).toContain('NIT 800.197.268-4')
    expect(html).toContain('Parqueadero &lt;Central&gt;')
    expect(html).not.toContain('<Central>')
  })

  it('nombra el costo según la unidad de cobro', () => {
    const perMinute = createEntryTicketHtml('58mm', null, {
      ...entry,
      billingUnit: 'minute',
    })
    expect(perMinute).toContain('Costo por minuto')
  })

  it('marca el duplicado y deja limpio el original', () => {
    expect(createEntryTicketHtml('80mm', profile, entry)).not.toContain('REIMPRESIÓN')

    const duplicate = createEntryTicketHtml('80mm', profile, entry, { reprint: true })
    expect(duplicate).toContain('** REIMPRESIÓN **')
  })
})

describe('recibo de salida', () => {
  it('discrimina el IVA, el efectivo recibido y el cambio', () => {
    const html = createExitReceiptHtml('58mm', profile, receipt)
    expect(html).toContain('N.º 7')
    expect(html).toContain('IVA (19 %)')
    expect(html).toContain('Recibido')
    expect(html).toContain('Cambio')
    // Se maqueta sobre el ancho que imprime el cabezal, no sobre el del rollo.
    expect(html).toContain('width: 48mm; max-width: 100%; margin: 0 auto;')
  })

  it('deja constancia del empleado del turno y de la nota de la salida', () => {
    const html = createExitReceiptHtml('80mm', profile, {
      ...receipt,
      notes: 'Salió con el casco del <cliente>',
    })
    expect(html).toContain('Atendió')
    expect(html).toContain('Ana Ruiz')
    expect(html).toContain('Nota: Salió con el casco del &lt;cliente&gt;')
  })

  it('omite al empleado y la nota cuando el recibo no los guardó', () => {
    const html = createExitReceiptHtml('80mm', profile, {
      ...receipt,
      employeeName: null,
      notes: '   ',
    })
    expect(html).not.toContain('Atendió')
    expect(html).not.toContain('Nota:')
  })

  it('marca el duplicado del recibo', () => {
    expect(createExitReceiptHtml('80mm', profile, receipt)).not.toContain('REIMPRESIÓN')

    const duplicate = createExitReceiptHtml('80mm', profile, receipt, { reprint: true })
    expect(duplicate).toContain('** REIMPRESIÓN **')
  })

  it('omite las filas de IVA y efectivo cuando no aplican', () => {
    const withoutTax = calculateChargeForMinutes(
      90,
      { ...DEFAULT_TARIFF_SETTINGS, taxEnabled: false },
      { amountCop: 5000, minimumChargeCop: 0, plenaCop: null, graceMinutes: null },
    )
    const html = createExitReceiptHtml('80mm', null, {
      ...receipt,
      charge: withoutTax,
      method: 'card',
      receivedCop: null,
      changeCop: null,
    })
    expect(html).not.toContain('IVA')
    expect(html).not.toContain('Recibido')
    expect(html).toContain('Tarjeta')
  })
})

describe('legibilidad en papel térmico', () => {
  it('no usa negrita en ningún documento', () => {
    const documents = [
      createTestTicketHtml('80mm', profile),
      createEntryTicketHtml('80mm', profile, entry, { reprint: true }),
      createExitReceiptHtml('58mm', profile, receipt, { reprint: true }),
      createCashCloseReceiptHtml('80mm', profile, {
        sessionId: 'cash-1',
        employeeName: 'Ana Ruiz',
        openedAt: '2026-08-18T12:00:00.000Z',
        closedAt: '2026-08-18T23:00:00.000Z',
        openingAmountCop: 100_000,
        collectedCop: 50_000,
        voidedCop: 0,
        expectedAmountCop: 150_000,
        closingAmountCop: 150_000,
        differenceCop: 0,
        movementCount: 4,
      }),
    ]
    for (const html of documents) {
      // El reset anula la negrita por defecto de títulos y énfasis.
      expect(html).toContain('font-weight: 400;')
      expect(html).not.toMatch(/font-weight:\s*(?:[5-9]00|bold)|<(?:strong|b)>/)
    }
  })

  it('destaca el total en un recuadro con la fecha partida solo entre fecha y hora', () => {
    const html = createExitReceiptHtml('80mm', profile, receipt)
    expect(html).toContain('<span class="total-label">Total</span>')
    expect(html).toMatch(/<span class="nowrap">\d{2}\/\d{2}\/\d{4}<\/span> <span class="nowrap">/)
  })
})

describe('símbolos del tiquete de ingreso', () => {
  it('dibuja los módulos con un número entero de puntos del cabezal', () => {
    const sizes = [
      ...createEntryTicketHtml('80mm', profile, entry).matchAll(/<svg width="([\d.]+)mm"/g),
    ]
    const narrow = [
      ...createEntryTicketHtml('58mm', profile, entry).matchAll(/<svg width="([\d.]+)mm"/g),
    ]
    // QR de 21 módulos + 8 de silencio; Code 128 de 123 módulos + 20 de silencio.
    expect(sizes.map((match) => Number(match[1]))).toEqual([29 * 1, 143 * 0.375])
    expect(narrow.map((match) => Number(match[1]))).toEqual([29 * 0.75, 143 * 0.25])
  })
})

describe('ajuste al papel de cada impresora', () => {
  it('no fija márgenes de página para que se respeten los que declara el driver', () => {
    // Una regla @page anularía el área imprimible del driver y cortaría el contenido.
    expect(createEntryTicketHtml('80mm', profile, entry)).not.toMatch(/@page\s*\{/)
  })

  it('aplica el ancho y el desplazamiento calibrados sin salirse del área disponible', () => {
    const html = createExitReceiptHtml(
      { paperWidth: '80mm', widthMm: 64.5, offsetMm: -1.5 },
      profile,
      receipt,
    )
    expect(html).toContain('left: -1.5mm; width: 64.5mm; max-width: 100%; margin: 0 auto;')
  })

  it('imprime una guía con regla, bordes e instrucciones', () => {
    const html = createCalibrationGuideHtml(
      { paperWidth: '80mm', widthMm: null, offsetMm: 2 },
      profile,
    )
    expect(html).toContain('72 mm (automático)')
    expect(html).toContain('2 mm a la derecha')
    expect(html).toContain('<text x="70mm" y="8mm" text-anchor="middle">70</text>')
    expect(html).toContain('el último milímetro que veas')
  })

  it('dibuja la regla como un SVG que se recorta sin encoger la página', () => {
    const html = createCalibrationGuideHtml(
      { paperWidth: '80mm', widthMm: null, offsetMm: 0 },
      profile,
    )
    // Marcas HTML fuera del área hacían que Chromium redujera la escala de la guía.
    expect(html).not.toContain('class="mark')
    expect(html).toContain('<svg class="ruler" width="100%"')
    // Una marca por milímetro, de 0 a 72.
    expect(html.match(/<line x1="\d+mm" x2="\d+mm" y1="(?:9|11|12\.5)mm"/g)).toHaveLength(73)
    // Los dos bordes gruesos son trazos: la impresión omite los fondos.
    expect(html.match(/stroke-width="0\.5mm"/g)).toHaveLength(2)
    expect(html).toContain('<line x1="71.75mm" x2="71.75mm" y1="0"')
    expect(html).not.toMatch(/background:\s*#000/)
  })

  it('mantiene cuadrado el QR si el área lo encoge y deja el alto fijo al Code 128', () => {
    const html = createEntryTicketHtml('80mm', profile, entry)
    expect(html.match(/max-width: 100%; height: auto/g)).toHaveLength(1)
  })

  it('distingue la cancelación del diálogo de una falla de impresión', () => {
    expect(isPrintCancellation('cancelled')).toBe(true)
    expect(isPrintCancellation('Print job canceled')).toBe(true)
    expect(isPrintCancellation('failed')).toBe(false)
    expect(isPrintCancellation(undefined)).toBe(false)
  })
})

describe('documentos que recibe el cliente', () => {
  const monthlyReceipt: MonthlyReceiptSnapshot = {
    version: 1,
    receiptNumber: 12,
    issuedAt: '2026-08-18T15:00:00.000Z',
    customerName: 'Carlos Peña',
    documentNumber: null,
    plate: 'MEN001',
    vehicleType: 'car',
    planName: 'Mensualidad automóvil',
    startsAt: '2026-08-18T05:00:00.000Z',
    endsAt: '2026-09-18T05:00:00.000Z',
    amountCop: 150_000,
    paidCop: 150_000,
    balanceCop: 0,
    method: 'cash',
    receivedCop: null,
    changeCop: null,
    reference: null,
  }
  const note = 'El parqueadero no se hace responsable de los objetos dejados en el vehículo.'

  it('cierra tiquete y recibos con el aviso de responsabilidad en letra pequeña', () => {
    const documents = [
      createEntryTicketHtml('80mm', profile, entry),
      createExitReceiptHtml('58mm', profile, receipt),
      createMonthlyReceiptHtml('80mm', profile, monthlyReceipt),
    ]
    for (const html of documents) {
      // Es lo último del documento, después del pie.
      expect(html).toMatch(
        new RegExp(`<p class="footer">[\\s\\S]*</p>\\s*<p class="legal">${note}</p>\\s*</body>`),
      )
    }
    expect(documents[0]).toContain('.legal { margin-top: 2mm; text-align: center; font-size: 11px;')
  })

  it('no lo añade a los documentos internos', () => {
    expect(createTestTicketHtml('80mm', profile)).not.toContain(note)
    expect(
      createCalibrationGuideHtml({ paperWidth: '80mm', widthMm: null, offsetMm: 0 }, profile),
    ).not.toContain(note)
  })

  it('marca como reimpresión el duplicado de un recibo de mensualidad', () => {
    expect(createMonthlyReceiptHtml('80mm', profile, monthlyReceipt)).not.toContain('REIMPRESIÓN')
    expect(createMonthlyReceiptHtml('80mm', profile, monthlyReceipt, { reprint: true })).toContain(
      '** REIMPRESIÓN **',
    )
  })
})

describe('cierre de caja', () => {
  const summary = {
    sessionId: 'cash-1',
    employeeName: 'Ana Ruiz',
    openedAt: '2026-08-18T12:00:00.000Z',
    closedAt: '2026-08-18T23:00:00.000Z',
    openingAmountCop: 0,
    collectedCop: 50_000,
    voidedCop: 5_000,
    expectedAmountCop: 50_000,
    movementCount: 4,
  }

  it('imprime el conteo y la diferencia de un cierre con arqueo', () => {
    const html = createCashCloseReceiptHtml('80mm', profile, {
      ...summary,
      closingAmountCop: 48_000,
      differenceCop: -2_000,
    })
    expect(html).toContain('<span class="total-label">Efectivo contado</span>')
    expect(html).toContain('Diferencia')
    expect(html).toContain('Falta')
  })

  it('imprime el total del turno cuando se cerró sin conteo', () => {
    const html = createCashCloseReceiptHtml('80mm', profile, {
      ...summary,
      closingAmountCop: null,
      differenceCop: null,
    })
    expect(html).toContain('<span class="total-label">Total del turno</span>')
    expect(html).toContain('Anulado')
    expect(html).not.toContain('Efectivo contado')
    expect(html).not.toContain('Diferencia')
    expect(html).not.toContain('Fondo inicial')
  })
})
