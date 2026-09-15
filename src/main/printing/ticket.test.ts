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
    expect(html).toContain('Referencia 123e4567-e89b-12d3-a456-426614174000')
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
    expect(html).toContain('@page { size: 58mm auto')
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
