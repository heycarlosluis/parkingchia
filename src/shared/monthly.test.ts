import { describe, expect, it } from 'vitest'
import {
  addMonthsToLocalDate,
  countCoveredDays,
  coverageEndDate,
  coversInstant,
  daysUntilExpiry,
  deriveSubscriptionStatus,
  describeRemaining,
  formatLocalDate,
  isExpiringSoon,
  isRealLocalDate,
  lastCoveredLocalDate,
  resolvePaymentState,
  shiftLocalDate,
  startOfLocalDayUtc,
  toLocalDate,
} from './monthly'

describe('calendario de mensualidades', () => {
  it('reconoce fechas reales y descarta las imposibles', () => {
    expect(isRealLocalDate('2026-02-28')).toBe(true)
    expect(isRealLocalDate('2026-02-31')).toBe(false)
    expect(isRealLocalDate('2026-13-01')).toBe(false)
    expect(isRealLocalDate('19-08-2026')).toBe(false)
  })

  it('suma meses recortando al último día real del mes destino', () => {
    expect(addMonthsToLocalDate('2026-01-31', 1)).toBe('2026-02-28')
    expect(addMonthsToLocalDate('2024-01-31', 1)).toBe('2024-02-29')
    expect(addMonthsToLocalDate('2026-08-19', 1)).toBe('2026-09-19')
    expect(addMonthsToLocalDate('2026-12-15', 2)).toBe('2027-02-15')
  })

  it('un mes desde el 19 de agosto cubre hasta el 18 de septiembre', () => {
    expect(coverageEndDate('2026-08-19', 1)).toBe('2026-09-18')
    expect(coverageEndDate('2026-01-31', 1)).toBe('2026-02-27')
    expect(coverageEndDate('2026-08-19', 3)).toBe('2026-11-18')
  })

  it('convierte fechas locales en instantes y vuelve al mismo día', () => {
    const startsAt = startOfLocalDayUtc('2026-08-19')
    expect(toLocalDate(startsAt)).toBe('2026-08-19')
    expect(startOfLocalDayUtc('2026-08-19', 1)).toBe(startOfLocalDayUtc('2026-08-20'))
  })

  it('el límite final es exclusivo: el último día cubierto es el anterior', () => {
    const endsAt = startOfLocalDayUtc('2026-09-19')
    expect(lastCoveredLocalDate(endsAt)).toBe('2026-09-18')
  })

  it('cuenta los días completos del periodo', () => {
    expect(
      countCoveredDays(startOfLocalDayUtc('2026-08-19'), startOfLocalDayUtc('2026-09-19')),
    ).toBe(31)
    expect(
      countCoveredDays(startOfLocalDayUtc('2026-08-19'), startOfLocalDayUtc('2026-08-19')),
    ).toBe(0)
  })

  it('desplaza fechas cruzando el cambio de mes', () => {
    expect(shiftLocalDate('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftLocalDate('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('formatea la fecha como la lee el operador', () => {
    expect(formatLocalDate('2026-09-18')).toBe('18/09/2026')
  })
})

describe('vigencia de una mensualidad', () => {
  const startsAt = startOfLocalDayUtc('2026-08-19')
  const endsAt = startOfLocalDayUtc('2026-09-19')

  it('cubre desde el primer instante y excluye el límite final', () => {
    expect(coversInstant(startsAt, endsAt, startsAt)).toBe(true)
    expect(coversInstant(startsAt, endsAt, new Date(Date.parse(endsAt) - 1).toISOString())).toBe(
      true,
    )
    expect(coversInstant(startsAt, endsAt, endsAt)).toBe(false)
    expect(coversInstant(startsAt, endsAt, new Date(Date.parse(startsAt) - 1).toISOString())).toBe(
      false,
    )
  })

  it('deduce el estado del calendario y respeta la cancelación', () => {
    const before = new Date(Date.parse(startsAt) - 86_400_000).toISOString()
    const during = new Date(Date.parse(startsAt) + 86_400_000).toISOString()

    expect(deriveSubscriptionStatus({ startsAt, endsAt, cancelled: false, nowUtc: before })).toBe(
      'pending',
    )
    expect(deriveSubscriptionStatus({ startsAt, endsAt, cancelled: false, nowUtc: during })).toBe(
      'active',
    )
    expect(deriveSubscriptionStatus({ startsAt, endsAt, cancelled: false, nowUtc: endsAt })).toBe(
      'expired',
    )
    expect(deriveSubscriptionStatus({ startsAt, endsAt, cancelled: true, nowUtc: during })).toBe(
      'cancelled',
    )
  })

  it('cuenta los días que faltan y avisa cuando está por vencer', () => {
    const twoDaysBefore = new Date(Date.parse(endsAt) - 2 * 86_400_000).toISOString()
    expect(daysUntilExpiry(endsAt, twoDaysBefore)).toBe(2)
    expect(daysUntilExpiry(endsAt, endsAt)).toBe(0)
    expect(isExpiringSoon(endsAt, twoDaysBefore)).toBe(true)
    expect(
      isExpiringSoon(endsAt, new Date(Date.parse(endsAt) - 30 * 86_400_000).toISOString()),
    ).toBe(false)
    expect(isExpiringSoon(endsAt, endsAt)).toBe(false)
  })

  it('describe la vigencia restante en el idioma del operador', () => {
    const lastDay = new Date(Date.parse(endsAt) - 3_600_000).toISOString()
    expect(describeRemaining('active', endsAt, lastDay)).toBe('Vence hoy')
    expect(
      describeRemaining(
        'active',
        endsAt,
        new Date(Date.parse(endsAt) - 3 * 86_400_000).toISOString(),
      ),
    ).toBe('3 días restantes')
    expect(describeRemaining('expired', endsAt, endsAt)).toBe('Venció el 18/09/2026')
    expect(describeRemaining('cancelled', endsAt, endsAt)).toBe('Cancelada')
    expect(describeRemaining('pending', endsAt, startsAt)).toBe('Todavía no inicia')
  })
})

describe('estado de pago', () => {
  it('distingue sin pagar, abono parcial y pagada', () => {
    expect(resolvePaymentState(150_000, 0)).toBe('unpaid')
    expect(resolvePaymentState(150_000, 50_000)).toBe('partial')
    expect(resolvePaymentState(150_000, 150_000)).toBe('paid')
    expect(resolvePaymentState(150_000, 200_000)).toBe('paid')
  })

  it('una mensualidad sin costo queda pagada', () => {
    expect(resolvePaymentState(0, 0)).toBe('paid')
  })
})
