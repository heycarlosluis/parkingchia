import { describe, expect, it } from 'vitest'
import {
  calculateChargeForMinutes,
  calculateParkingCharge,
  describeBilledTime,
  createRatePlanSchema,
  DEFAULT_TARIFF_SETTINGS,
  roundUpToStep,
  updateTariffSettingsSchema,
  type RatePlanPricing,
  type TariffSettings,
} from './tariff'

const settings = (overrides: Partial<TariffSettings> = {}): TariffSettings => ({
  ...DEFAULT_TARIFF_SETTINGS,
  taxEnabled: false,
  roundingStepCop: 0,
  ...overrides,
})

const plan = (overrides: Partial<RatePlanPricing> = {}): RatePlanPricing => ({
  amountCop: 5000,
  minimumChargeCop: 0,
  plenaCop: null,
  graceMinutes: null,
  ...overrides,
})

describe('tolerancia sobre la fracción', () => {
  const conGracia = (minutos: number, gracia = 5) =>
    calculateChargeForMinutes(
      minutos,
      settings({ billingUnit: 'hour', graceMinutes: gracia }),
      plan(),
    )

  it('no cobra mientras la permanencia no supere la tolerancia', () => {
    const charge = conGracia(5)
    expect(charge.withinGrace).toBe(true)
    expect(charge.billedUnits).toBe(0)
    expect(charge.totalCop).toBe(0)
  })

  it('cobra la hora completa apenas se pasa un minuto de la tolerancia', () => {
    const charge = conGracia(6)
    expect(charge.withinGrace).toBe(false)
    expect(charge.billedUnits).toBe(1)
    expect(charge.totalCop).toBe(5000)
  })

  it('perdona la fracción final que cabe en la tolerancia', () => {
    const charge = conGracia(65)
    expect(charge.billedUnits).toBe(1)
    expect(charge.forgivenMinutes).toBe(5)
    expect(charge.totalCop).toBe(5000)
  })

  it('cobra la hora siguiente cuando la fracción supera la tolerancia', () => {
    const charge = conGracia(66)
    expect(charge.billedUnits).toBe(2)
    expect(charge.forgivenMinutes).toBe(0)
    expect(charge.totalCop).toBe(10_000)
  })

  it('repite la tolerancia en cada hora consumida', () => {
    expect(conGracia(120).billedUnits).toBe(2)
    expect(conGracia(125).billedUnits).toBe(2)
    expect(conGracia(126).billedUnits).toBe(3)
  })

  it('sin tolerancia cobra cualquier fracción iniciada', () => {
    expect(conGracia(1, 0).billedUnits).toBe(1)
    expect(conGracia(60, 0).billedUnits).toBe(1)
    expect(conGracia(61, 0).billedUnits).toBe(2)
  })

  it('la gracia de la tarifa tiene prioridad sobre la gracia general', () => {
    const charge = calculateChargeForMinutes(
      20,
      settings({ graceMinutes: 5 }),
      plan({ graceMinutes: 30 }),
    )
    expect(charge.graceMinutes).toBe(30)
    expect(charge.withinGrace).toBe(true)
  })
})

describe('unidad de cobro', () => {
  it('cobra cada hora consumida más la fracción que supera la tolerancia', () => {
    const charge = calculateChargeForMinutes(
      95,
      settings({ billingUnit: 'hour', graceMinutes: 15 }),
      plan(),
    )
    expect(charge.billedUnits).toBe(2)
    expect(charge.totalCop).toBe(10_000)
  })

  it('por minuto la gracia es un umbral inicial, no una fracción', () => {
    const porMinuto = (minutos: number) =>
      calculateChargeForMinutes(
        minutos,
        settings({ billingUnit: 'minute', graceMinutes: 5 }),
        plan({ amountCop: 100 }),
      )
    expect(porMinuto(5).totalCop).toBe(0)
    expect(porMinuto(6).billedUnits).toBe(6)
    expect(porMinuto(61).totalCop).toBe(6100)
  })

  it('calcula los minutos a partir de dos marcas de tiempo UTC', () => {
    const charge = calculateParkingCharge({
      enteredAt: '2026-08-18T10:00:00.000Z',
      exitedAt: '2026-08-18T11:30:00.000Z',
      settings: settings({ billingUnit: 'hour', graceMinutes: 5 }),
      plan: plan(),
    })
    expect(charge.totalMinutes).toBe(90)
    expect(charge.billedUnits).toBe(2)
  })
})

describe('cobro mínimo', () => {
  it('eleva el cobro hasta el mínimo configurado', () => {
    const charge = calculateChargeForMinutes(
      20,
      settings({ billingUnit: 'minute', graceMinutes: 15 }),
      plan({ amountCop: 50, minimumChargeCop: 2000 }),
    )
    expect(charge.appliedMinimumCharge).toBe(true)
    expect(charge.totalCop).toBe(2000)
  })
})

describe('plena', () => {
  /** Escenario del parqueadero: hora a 5.000, plena a 30.000, umbral de 10 horas. */
  const conPlena = (horas: number, umbral = 10) =>
    calculateChargeForMinutes(
      horas * 60,
      settings({ billingUnit: 'hour', graceMinutes: 5, plenaThresholdHours: umbral }),
      plan({ amountCop: 5000, plenaCop: 30_000 }),
    )

  it('cobra por horas mientras no se alcance el umbral', () => {
    const charge = conPlena(9)
    expect(charge.plenaCount).toBe(0)
    expect(charge.chargedUnits).toBe(9)
    expect(charge.totalCop).toBe(45_000)
  })

  it('cobra una plena al alcanzar el umbral', () => {
    const charge = conPlena(10)
    expect(charge.plenaCount).toBe(1)
    expect(charge.chargedUnits).toBe(0)
    expect(charge.totalCop).toBe(30_000)
  })

  it('mantiene la plena durante todo el día', () => {
    expect(conPlena(15).totalCop).toBe(30_000)
    expect(conPlena(23).totalCop).toBe(30_000)
    expect(conPlena(24).totalCop).toBe(30_000)
  })

  it('retoma el cobro por horas después de las 24 horas', () => {
    const charge = conPlena(33)
    expect(charge.plenaCount).toBe(1)
    expect(charge.chargedUnits).toBe(9)
    expect(charge.totalCop).toBe(75_000)
  })

  it('suma una segunda plena cuando el excedente vuelve a alcanzar el umbral', () => {
    const charge = conPlena(34)
    expect(charge.plenaCount).toBe(2)
    expect(charge.chargedUnits).toBe(0)
    expect(charge.totalCop).toBe(60_000)
  })

  it('acumula plenas por cada día completo', () => {
    expect(conPlena(48).plenaCount).toBe(2)
    expect(conPlena(48).totalCop).toBe(60_000)
    expect(conPlena(58).plenaCount).toBe(3)
    expect(conPlena(58).totalCop).toBe(90_000)
  })

  it('respeta el umbral configurado', () => {
    expect(conPlena(6, 6).plenaCount).toBe(1)
    expect(conPlena(5, 6).plenaCount).toBe(0)
  })

  it('no aplica plena cuando la tarifa no la define', () => {
    const charge = calculateChargeForMinutes(
      30 * 60,
      settings({ billingUnit: 'hour', graceMinutes: 5 }),
      plan({ amountCop: 5000, plenaCop: null }),
    )
    expect(charge.plenaCount).toBe(0)
    expect(charge.totalCop).toBe(150_000)
  })

  it('no aplica plena cobrando por minuto', () => {
    const charge = calculateChargeForMinutes(
      15 * 60,
      settings({ billingUnit: 'minute', graceMinutes: 5 }),
      plan({ amountCop: 100, plenaCop: 30_000 }),
    )
    expect(charge.plenaCount).toBe(0)
    expect(charge.totalCop).toBe(90_000)
  })

  it('describe el cobro con plenas y horas sueltas', () => {
    expect(describeBilledTime(conPlena(33))).toBe('1 plena + 9 horas')
    expect(describeBilledTime(conPlena(34))).toBe('2 plenas')
    expect(describeBilledTime(conPlena(9))).toBe('9 horas')
  })
})

describe('IVA en pesos colombianos', () => {
  it('no discrimina impuesto cuando está desactivado', () => {
    const charge = calculateChargeForMinutes(60, settings({ taxEnabled: false }), plan())
    expect(charge.taxPercent).toBe(0)
    expect(charge.taxCop).toBe(0)
    expect(charge.subtotalCop).toBe(charge.totalCop)
  })

  it('descuenta el IVA del precio cuando ya está incluido', () => {
    const charge = calculateChargeForMinutes(
      60,
      settings({ taxEnabled: true, taxPercent: 19, taxIncludedInPrice: true }),
      plan(),
    )
    expect(charge.totalCop).toBe(5000)
    expect(charge.subtotalCop).toBe(4202)
    expect(charge.taxCop).toBe(798)
    expect(charge.subtotalCop + charge.taxCop).toBe(charge.totalCop)
  })

  it('suma el IVA al precio cuando no está incluido', () => {
    const charge = calculateChargeForMinutes(
      60,
      settings({ taxEnabled: true, taxPercent: 19, taxIncludedInPrice: false }),
      plan(),
    )
    expect(charge.baseCop).toBe(5000)
    expect(charge.totalCop).toBe(5950)
    expect(charge.subtotalCop).toBe(5000)
    expect(charge.taxCop).toBe(950)
  })

  it('mantiene el total consistente con el redondeo aplicado', () => {
    const charge = calculateChargeForMinutes(
      60,
      settings({
        taxEnabled: true,
        taxPercent: 19,
        taxIncludedInPrice: false,
        roundingStepCop: 100,
      }),
      plan(),
    )
    expect(charge.totalCop).toBe(6000)
    expect(charge.roundingAdjustmentCop).toBe(50)
    expect(charge.subtotalCop + charge.taxCop).toBe(charge.totalCop)
  })
})

describe('redondeo del total', () => {
  it('redondea hacia arriba al múltiplo configurado', () => {
    expect(roundUpToStep(5010, 100)).toBe(5100)
    expect(roundUpToStep(5000, 100)).toBe(5000)
    expect(roundUpToStep(5010, 0)).toBe(5010)
  })
})

describe('entradas inválidas', () => {
  it('rechaza permanencias que no son minutos enteros no negativos', () => {
    expect(() => calculateChargeForMinutes(-1, settings(), plan())).toThrow(RangeError)
    expect(() => calculateChargeForMinutes(1.5, settings(), plan())).toThrow(RangeError)
  })

  it('valida el esquema de tarifas y de ajustes', () => {
    const base = {
      name: 'Automóvil',
      vehicleType: 'car' as const,
      amountCop: 5000,
      minimumChargeCop: 2000,
      plenaCop: 1000,
      graceMinutes: null,
      status: 'active' as const,
    }
    expect(createRatePlanSchema.safeParse(base).success).toBe(false)
    expect(createRatePlanSchema.safeParse({ ...base, plenaCop: null }).success).toBe(true)
    expect(createRatePlanSchema.safeParse({ ...base, amountCop: 1500.5 }).success).toBe(false)
    expect(createRatePlanSchema.safeParse({ ...base, canalOculto: true }).success).toBe(false)

    expect(updateTariffSettingsSchema.safeParse({ billingUnit: 'minute' }).success).toBe(true)
    expect(updateTariffSettingsSchema.safeParse({ billingUnit: 'week' }).success).toBe(false)
    expect(updateTariffSettingsSchema.safeParse({ graceMinutes: 999 }).success).toBe(false)
    expect(updateTariffSettingsSchema.safeParse({ taxPercent: 19.005 }).success).toBe(false)
    expect(updateTariffSettingsSchema.safeParse({ roundingStepCop: 37 }).success).toBe(false)
    expect(updateTariffSettingsSchema.safeParse({}).success).toBe(false)
  })
})
