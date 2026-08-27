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
      settings({ billingUnit: 'hour', graceMinutes: gracia, graceFromHour: 0 }),
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
      settings({ graceMinutes: 5, graceFromHour: 0 }),
      plan({ graceMinutes: 30 }),
    )
    expect(charge.graceMinutes).toBe(30)
    expect(charge.withinGrace).toBe(true)
  })
})

describe('hora desde la que aplica la tolerancia', () => {
  const desdeHora = (minutos: number, desde: number) =>
    calculateChargeForMinutes(
      minutos,
      settings({ billingUnit: 'hour', graceMinutes: 5, graceFromHour: desde }),
      plan(),
    )

  it('cobra la primera hora completa desde el minuto uno', () => {
    expect(desdeHora(1, 1).billedUnits).toBe(1)
    expect(desdeHora(4, 1).billedUnits).toBe(1)
    expect(desdeHora(60, 1).billedUnits).toBe(1)
  })

  it('activa la tolerancia recién al pasar la hora del umbral', () => {
    expect(desdeHora(65, 1).billedUnits).toBe(1)
    expect(desdeHora(65, 1).forgivenMinutes).toBe(5)
    expect(desdeHora(66, 1).billedUnits).toBe(2)
  })

  it('mantiene la tolerancia en las horas siguientes al umbral', () => {
    expect(desdeHora(125, 1).billedUnits).toBe(2)
    expect(desdeHora(126, 1).billedUnits).toBe(3)
  })

  it('cobra sin tolerancia mientras no se alcance un umbral alto', () => {
    // Con el umbral en la hora 3, las fracciones de las dos primeras horas se
    // cobran completas y la tolerancia recién aparece pasada la tercera.
    expect(desdeHora(65, 3).billedUnits).toBe(2)
    expect(desdeHora(125, 3).billedUnits).toBe(3)
    expect(desdeHora(185, 3).billedUnits).toBe(3)
    expect(desdeHora(186, 3).billedUnits).toBe(4)
  })

  it('no cobra una permanencia de cero minutos', () => {
    expect(desdeHora(0, 1).withinGrace).toBe(true)
    expect(desdeHora(0, 1).totalCop).toBe(0)
  })

  it('cobrando por minuto la gracia solo libera el arranque desde la hora cero', () => {
    const porMinuto = (minutos: number, desde: number) =>
      calculateChargeForMinutes(
        minutos,
        settings({ billingUnit: 'minute', graceMinutes: 5, graceFromHour: desde }),
        plan({ amountCop: 100 }),
      )
    expect(porMinuto(5, 0).totalCop).toBe(0)
    expect(porMinuto(5, 1).totalCop).toBe(500)
  })
})

describe('unidad de cobro', () => {
  it('cobra cada hora consumida más la fracción que supera la tolerancia', () => {
    const charge = calculateChargeForMinutes(
      95,
      settings({ billingUnit: 'hour', graceMinutes: 15, graceFromHour: 0 }),
      plan(),
    )
    expect(charge.billedUnits).toBe(2)
    expect(charge.totalCop).toBe(10_000)
  })

  it('por minuto la gracia es un umbral inicial, no una fracción', () => {
    const porMinuto = (minutos: number) =>
      calculateChargeForMinutes(
        minutos,
        settings({ billingUnit: 'minute', graceMinutes: 5, graceFromHour: 0 }),
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
      settings: settings({ billingUnit: 'hour', graceMinutes: 5, graceFromHour: 0 }),
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
      settings({ billingUnit: 'minute', graceMinutes: 15, graceFromHour: 0 }),
      plan({ amountCop: 50, minimumChargeCop: 2000 }),
    )
    expect(charge.appliedMinimumCharge).toBe(true)
    expect(charge.totalCop).toBe(2000)
  })
})

describe('plena', () => {
  /** Escenario real: hora a 3.500, plena a 20.000, umbral de 5 horas y plena de 12. */
  const cobro = (minutos: number, gracia = 5) =>
    calculateChargeForMinutes(
      minutos,
      settings({
        billingUnit: 'hour',
        graceMinutes: gracia,
        graceFromHour: 1,
        plenaThresholdHours: 5,
        plenaHours: 12,
      }),
      plan({ amountCop: 3500, plenaCop: 20_000 }),
    )
  const horas = (h: number, m = 0, gracia = 5) => cobro(h * 60 + m, gracia)

  it('cobra por horas mientras no se supere el umbral', () => {
    expect(horas(4).chargedUnits).toBe(4)
    expect(horas(4).totalCop).toBe(14_000)
    expect(horas(5).chargedUnits).toBe(5)
    expect(horas(5).totalCop).toBe(17_500)
  })

  it('mantiene las horas sueltas mientras la gracia cubra la fracción del umbral', () => {
    const charge = horas(5, 5)
    expect(charge.plenaCount).toBe(0)
    expect(charge.chargedUnits).toBe(5)
    expect(charge.totalCop).toBe(17_500)
  })

  it('entra en plena con la primera hora que supera el umbral', () => {
    expect(horas(5, 6).plenaCount).toBe(1)
    expect(horas(5, 6).totalCop).toBe(20_000)
    // Sin tolerancia basta un minuto para superar las cinco horas.
    expect(horas(5, 1, 0).plenaCount).toBe(1)
    expect(horas(5, 1, 0).totalCop).toBe(20_000)
  })

  it('congela el cobro en la plena hasta cerrar su duración', () => {
    expect(horas(6).totalCop).toBe(20_000)
    expect(horas(11).totalCop).toBe(20_000)
    expect(horas(12).totalCop).toBe(20_000)
    expect(horas(12, 5).totalCop).toBe(20_000)
  })

  it('retoma el cobro por hora al superar la duración de la plena', () => {
    const charge = horas(12, 6)
    expect(charge.plenaCount).toBe(1)
    expect(charge.chargedUnits).toBe(1)
    expect(charge.totalCop).toBe(23_500)
    expect(horas(16).totalCop).toBe(20_000 + 4 * 3500)
    expect(horas(17).totalCop).toBe(20_000 + 5 * 3500)
  })

  it('suma una segunda plena cuando el excedente vuelve a superar el umbral', () => {
    const charge = horas(17, 6)
    expect(charge.plenaCount).toBe(2)
    expect(charge.chargedUnits).toBe(0)
    expect(charge.totalCop).toBe(40_000)
  })

  it('repite el ciclo indefinidamente', () => {
    expect(horas(24).plenaCount).toBe(2)
    expect(horas(24).totalCop).toBe(40_000)
    expect(horas(24, 6).totalCop).toBe(43_500)
    expect(horas(29, 6).plenaCount).toBe(3)
    expect(horas(36).plenaCount).toBe(3)
    expect(horas(36).totalCop).toBe(60_000)
  })

  it('respeta el umbral y la duración configurados', () => {
    const conCiclo = (h: number, umbral: number, duracion: number) =>
      calculateChargeForMinutes(
        h * 60,
        settings({
          billingUnit: 'hour',
          graceMinutes: 0,
          plenaThresholdHours: umbral,
          plenaHours: duracion,
        }),
        plan({ amountCop: 3500, plenaCop: 20_000 }),
      )
    expect(conCiclo(6, 6, 24).plenaCount).toBe(0)
    expect(conCiclo(7, 6, 24).plenaCount).toBe(1)
    expect(conCiclo(24, 6, 24).plenaCount).toBe(1)
    expect(conCiclo(31, 6, 24).plenaCount).toBe(2)
  })

  it('no aplica plena cuando la tarifa no la define', () => {
    const charge = calculateChargeForMinutes(
      30 * 60,
      settings({ billingUnit: 'hour', graceMinutes: 5 }),
      plan({ amountCop: 3500, plenaCop: null }),
    )
    expect(charge.plenaCount).toBe(0)
    expect(charge.totalCop).toBe(105_000)
  })

  it('no aplica plena cobrando por minuto', () => {
    const charge = calculateChargeForMinutes(
      15 * 60,
      settings({ billingUnit: 'minute', graceMinutes: 5 }),
      plan({ amountCop: 100, plenaCop: 20_000 }),
    )
    expect(charge.plenaCount).toBe(0)
    expect(charge.totalCop).toBe(90_000)
  })

  it('describe el cobro con plenas y horas sueltas', () => {
    expect(describeBilledTime(horas(12, 6))).toBe('1 plena + 1 hora')
    expect(describeBilledTime(horas(16))).toBe('1 plena + 4 horas')
    expect(describeBilledTime(horas(17, 6))).toBe('2 plenas')
    expect(describeBilledTime(horas(4))).toBe('4 horas')
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
    expect(updateTariffSettingsSchema.safeParse({ plenaHours: 12 }).success).toBe(true)
    expect(updateTariffSettingsSchema.safeParse({ plenaHours: 1 }).success).toBe(false)
    expect(updateTariffSettingsSchema.safeParse({ plenaHours: 25 }).success).toBe(false)
    expect(updateTariffSettingsSchema.safeParse({}).success).toBe(false)
  })
})
