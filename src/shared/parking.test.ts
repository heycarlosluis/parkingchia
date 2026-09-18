import { describe, expect, it } from 'vitest'
import {
  addReceivedCash,
  calculateChange,
  closeSessionSchema,
  describeElapsed,
  exitStatusOf,
  QUICK_CASH_AMOUNTS_COP,
  resolveExitTargetSchema,
} from './parking'
import { MAX_AMOUNT_COP } from './tariff'

describe('esquema de lectura del tiquete', () => {
  it('acepta una matrícula o un código y rechaza entradas vacías o excesivas', () => {
    expect(resolveExitTargetSchema.safeParse({ code: 'ABC123' }).success).toBe(true)
    expect(resolveExitTargetSchema.safeParse({ code: 'PC1S123456' }).success).toBe(true)
    expect(resolveExitTargetSchema.safeParse({ code: '  ' }).success).toBe(false)
    expect(resolveExitTargetSchema.safeParse({ code: 'X'.repeat(4097) }).success).toBe(false)
  })
})

describe('esquema de cierre de salida', () => {
  const base = {
    sessionId: 'session-1',
    expectedTotalCop: 10_000,
    method: 'cash' as const,
    receivedCop: 20_000,
    notes: null,
  }

  it('exige el efectivo recibido cuando se cobra en efectivo', () => {
    expect(closeSessionSchema.safeParse(base).success).toBe(true)
    expect(closeSessionSchema.safeParse({ ...base, receivedCop: null }).success).toBe(false)
    expect(closeSessionSchema.safeParse({ ...base, receivedCop: 5000 }).success).toBe(false)
  })

  it('no exige efectivo para otros medios ni para salidas sin cobro', () => {
    expect(
      closeSessionSchema.safeParse({ ...base, method: 'card', receivedCop: null }).success,
    ).toBe(true)
    expect(
      closeSessionSchema.safeParse({ ...base, expectedTotalCop: 0, receivedCop: null }).success,
    ).toBe(true)
  })

  it('calcula el cambio solo cuando hay efectivo recibido', () => {
    expect(calculateChange(10_000, 20_000)).toBe(10_000)
    expect(calculateChange(10_000, null)).toBeNull()
  })
})

describe('describeElapsed', () => {
  it('muestra solo minutos cuando no llegan a una hora', () => {
    expect(describeElapsed(0)).toBe('0 min')
    expect(describeElapsed(45)).toBe('45 min')
  })

  it('muestra horas y minutos completos', () => {
    expect(describeElapsed(60)).toBe('1 h')
    expect(describeElapsed(90)).toBe('1 h 30 min')
  })

  it('conserva los minutos al pasar de un día', () => {
    expect(describeElapsed(1440)).toBe('1 d')
    expect(describeElapsed(1500)).toBe('1 d 1 h')
    expect(describeElapsed(1505)).toBe('1 d 1 h 5 min')
    expect(describeElapsed(2900)).toBe('2 d 20 min')
  })
})

describe('exitStatusOf', () => {
  const closed = { status: 'closed' as const, monthlyCustomerName: null, receiptNumber: 7 }

  it('distingue una salida cobrada de una que no generó recibo', () => {
    expect(exitStatusOf(closed)).toBe('charged')
    expect(exitStatusOf({ ...closed, receiptNumber: null })).toBe('free')
  })

  it('marca la cobertura por mensualidad aunque no haya recibo', () => {
    expect(exitStatusOf({ ...closed, receiptNumber: null, monthlyCustomerName: 'Ana' })).toBe(
      'monthly',
    )
  })

  it('la anulación manda sobre cualquier otro rastro', () => {
    expect(
      exitStatusOf({ status: 'cancelled', monthlyCustomerName: 'Ana', receiptNumber: 7 }),
    ).toBe('cancelled')
  })
})

describe('montos rápidos del efectivo', () => {
  it('van de 5.000 en 5.000 hasta 50.000 y de 10.000 en 10.000 hasta 100.000', () => {
    expect(QUICK_CASH_AMOUNTS_COP).toEqual([
      5_000, 10_000, 15_000, 20_000, 25_000, 30_000, 35_000, 40_000, 45_000, 50_000, 60_000, 70_000,
      80_000, 90_000, 100_000,
    ])
  })

  it('suman sobre lo registrado sin pasar del máximo permitido', () => {
    expect(addReceivedCash(null, 5_000)).toBe(5_000)
    expect(addReceivedCash(20_000, 20_000)).toBe(40_000)
    expect(addReceivedCash(MAX_AMOUNT_COP - 1_000, 5_000)).toBe(MAX_AMOUNT_COP)
  })
})
