import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiResult, MonthlyOverview, MonthlyPaymentRegistration } from '@shared/contracts'
import { useMonthlyStore } from './monthly-store'

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

const emptyOverview: MonthlyOverview = {
  subscriptions: [],
  customers: [],
  plans: [],
  summary: {
    activeCount: 0,
    expiringSoonCount: 0,
    expiredCount: 0,
    pendingCollectionCop: 0,
    collectedThisMonthCop: 0,
  },
}

const paymentInput = {
  subscriptionId: 'subscription-1',
  amountCop: 50_000,
  method: 'cash' as const,
  receivedCop: 50_000,
  reference: null,
}

describe('estado de mensualidades', () => {
  beforeEach(() => {
    useMonthlyStore.setState({
      search: '',
      status: 'all',
      loading: false,
      mutating: false,
      error: null,
      message: '',
      subscriptions: [],
      customers: [],
      plans: [],
    })
  })

  it('conserva la respuesta del filtro más reciente aunque las consultas terminen en otro orden', async () => {
    const old = deferred<ApiResult<MonthlyOverview>>()
    vi.mocked(window.parkingAPI.getMonthlyOverview)
      .mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce({ ok: true, data: emptyOverview })
    const first = useMonthlyStore.getState().setSearch('MEN')
    await useMonthlyStore.getState().setSearch('QQQ')
    old.resolve({
      ok: true,
      data: { ...emptyOverview, summary: { ...emptyOverview.summary, activeCount: 7 } },
    })
    await first
    expect(useMonthlyStore.getState().search).toBe('QQQ')
    expect(useMonthlyStore.getState().summary.activeCount).toBe(0)
  })

  it('no duplica un abono mientras el cobro está en curso', async () => {
    const pending = deferred<ApiResult<MonthlyPaymentRegistration>>()
    const api = vi
      .mocked(window.parkingAPI.registerSubscriptionPayment)
      .mockClear()
      .mockImplementationOnce(() => pending.promise)
    const first = useMonthlyStore.getState().registerPayment(paymentInput)
    expect(useMonthlyStore.getState().mutating).toBe(true)
    expect(await useMonthlyStore.getState().registerPayment(paymentInput)).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
    pending.resolve({ ok: false, error: { code: 'NO_CASH_SESSION', message: 'Abre la caja.' } })
    await first
    expect(useMonthlyStore.getState()).toMatchObject({ mutating: false, error: 'Abre la caja.' })
  })

  it('informa que el pago se guardó aunque falle la consulta posterior para evitar cobrarlo otra vez', async () => {
    const payment = await window.parkingAPI.registerSubscriptionPayment(paymentInput)
    if (!payment.ok) throw new Error('Falta el escenario de pago')
    vi.mocked(window.parkingAPI.getMonthlyOverview).mockRejectedValueOnce(
      new Error('Detalle interno'),
    )
    const registered = await useMonthlyStore.getState().registerPayment(paymentInput)
    expect(registered).toEqual(payment.data)
    expect(useMonthlyStore.getState()).toMatchObject({
      mutating: false,
      loading: false,
      message: 'Pago registrado.',
    })
    expect(useMonthlyStore.getState().error).toContain('No fue posible actualizar')
    expect(useMonthlyStore.getState().error).not.toContain('Detalle interno')
  })
})
