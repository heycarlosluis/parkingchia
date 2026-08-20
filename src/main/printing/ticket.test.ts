// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { EntryRegistration } from '@shared/contracts'
import { calculateChargeForMinutes, DEFAULT_TARIFF_SETTINGS } from '@shared/tariff'
import type { ReceiptSnapshot } from '@main/parking/service'
import { createEntryTicketHtml, createExitReceiptHtml } from './ticket'

const profile = {
  name: 'Parqueadero <Central>',
  address: 'Carrera 10 # 12-34',
  phone: '300 123 4567',
}

const entry: EntryRegistration = {
  sessionId: 'session-1',
  plate: 'ABC123',
  vehicleType: 'motorcycle',
  ratePlanName: 'Motocicleta por hora',
  enteredAt: '2026-08-18T15:00:00.000Z',
  graceMinutes: 15,
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
  notes: null,
}

describe('tiquete de ingreso', () => {
  it('incluye matrícula, tarifa y gracia, y escapa el perfil', () => {
    const html = createEntryTicketHtml('80mm', profile, entry)
    expect(html).toContain('ABC123')
    expect(html).toContain('Motocicleta por hora')
    expect(html).toContain('15 min')
    expect(html).toContain('Parqueadero &lt;Central&gt;')
    expect(html).not.toContain('<Central>')
  })
})

describe('recibo de salida', () => {
  it('discrimina el IVA, el efectivo recibido y el cambio', () => {
    const html = createExitReceiptHtml('58mm', profile, receipt)
    expect(html).toContain('N.º 7')
    expect(html).toContain('IVA (19 %)')
    expect(html).toContain('Recibido')
    expect(html).toContain('Cambio')
    expect(html).toContain('@page { size: 58mm auto')
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
