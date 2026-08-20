import { describe, expect, it } from 'vitest'
import { closeCashSessionSchema, openCashSessionSchema, voidPaymentSchema } from './cash'

describe('esquemas de caja', () => {
  it('acepta un fondo inicial, un empleado y una nota opcional', () => {
    expect(
      openCashSessionSchema.safeParse({
        employeeId: 'employee-1',
        openingAmountCop: 50_000,
        notes: null,
      }).success,
    ).toBe(true)
    expect(
      openCashSessionSchema.safeParse({ employeeId: 'employee-1', openingAmountCop: 0, notes: '' })
        .data,
    ).toMatchObject({ notes: null })
  })

  it('exige seleccionar un empleado', () => {
    expect(openCashSessionSchema.safeParse({ openingAmountCop: 50_000, notes: null }).success).toBe(
      false,
    )
    expect(
      openCashSessionSchema.safeParse({ employeeId: '', openingAmountCop: 0, notes: null }).success,
    ).toBe(false)
  })

  it('rechaza fondos negativos, con decimales o por encima del máximo', () => {
    expect(
      openCashSessionSchema.safeParse({ employeeId: 'e-1', openingAmountCop: -1, notes: null })
        .success,
    ).toBe(false)
    expect(
      openCashSessionSchema.safeParse({ employeeId: 'e-1', openingAmountCop: 1.5, notes: null })
        .success,
    ).toBe(false)
    expect(
      openCashSessionSchema.safeParse({
        employeeId: 'e-1',
        openingAmountCop: 10_000_001,
        notes: null,
      }).success,
    ).toBe(false)
  })

  it('valida el efectivo contado al cerrar', () => {
    expect(
      closeCashSessionSchema.safeParse({ closingAmountCop: 123_000, notes: null }).success,
    ).toBe(true)
    expect(closeCashSessionSchema.safeParse({ closingAmountCop: -5, notes: null }).success).toBe(
      false,
    )
  })

  it('exige un motivo al anular un cobro', () => {
    expect(
      voidPaymentSchema.safeParse({ paymentId: 'p-1', reason: 'Cobro mal registrado' }).success,
    ).toBe(true)
    expect(voidPaymentSchema.safeParse({ paymentId: 'p-1', reason: 'a' }).success).toBe(false)
    expect(
      voidPaymentSchema.safeParse({ paymentId: '', reason: 'Cobro mal registrado' }).success,
    ).toBe(false)
  })
})
