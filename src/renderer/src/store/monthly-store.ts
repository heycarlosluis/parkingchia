import { create } from 'zustand'
import type {
  ApiResult,
  MonthlyCustomer,
  MonthlyCustomerDraft,
  MonthlyOverview,
  MonthlyPaymentRegistration,
  MonthlyPlanDraft,
  MonthlySubscription,
  MonthlySummary,
  RatePlan,
  SubscriptionDraft,
} from '@shared/contracts'
import type { SubscriptionStatus } from '@shared/monthly'
import type { PaymentMethod } from '@shared/parking'

export type SubscriptionFilter = 'all' | SubscriptionStatus

const EMPTY_SUMMARY: MonthlySummary = {
  activeCount: 0,
  expiringSoonCount: 0,
  expiredCount: 0,
  pendingCollectionCop: 0,
  collectedThisMonthCop: 0,
}

type PaymentInput = {
  subscriptionId: string
  amountCop: number
  method: PaymentMethod
  receivedCop: number | null
  reference: string | null
}

type MonthlyStore = {
  subscriptions: MonthlySubscription[]
  customers: MonthlyCustomer[]
  plans: RatePlan[]
  summary: MonthlySummary
  search: string
  status: SubscriptionFilter
  loading: boolean
  mutating: boolean
  error: string | null
  message: string
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  setSearch: (search: string) => Promise<void>
  setStatus: (status: SubscriptionFilter) => Promise<void>
  createCustomer: (input: MonthlyCustomerDraft) => Promise<boolean>
  updateCustomer: (input: MonthlyCustomerDraft & { id: string }) => Promise<boolean>
  deleteCustomer: (id: string) => Promise<boolean>
  createPlan: (input: MonthlyPlanDraft) => Promise<boolean>
  updatePlan: (input: MonthlyPlanDraft & { id: string }) => Promise<boolean>
  deletePlan: (id: string) => Promise<boolean>
  createSubscription: (input: SubscriptionDraft) => Promise<boolean>
  renewSubscription: (input: {
    id: string
    months: number
    amountCop: number | null
  }) => Promise<boolean>
  cancelSubscription: (id: string, reason: string) => Promise<boolean>
  registerPayment: (input: PaymentInput) => Promise<MonthlyPaymentRegistration | null>
  clearFeedback: () => void
}

export const useMonthlyStore = create<MonthlyStore>((set, get) => {
  let latestLoad = 0
  const apply = (overview: MonthlyOverview): void => {
    set({
      subscriptions: overview.subscriptions,
      customers: overview.customers,
      plans: overview.plans,
      summary: overview.summary,
      loading: false,
      error: null,
    })
  }

  const load = async (): Promise<void> => {
    const request = ++latestLoad
    try {
      const result = await window.parkingAPI.getMonthlyOverview({
        search: get().search,
        status: get().status,
      })
      if (request !== latestLoad) return
      if (result.ok) apply(result.data)
      else set({ loading: false, error: result.error.message })
    } catch {
      if (request === latestLoad)
        set({
          loading: false,
          error:
            'No fue posible actualizar las mensualidades. Pulsa Actualizar para volver a consultar.',
        })
    }
  }

  /** Ejecuta una operación y vuelve a leer el módulo con los filtros vigentes. */
  const run = async <T>(
    operation: () => Promise<ApiResult<T>>,
    message: string,
  ): Promise<T | null> => {
    if (get().mutating) return null
    set({ mutating: true, error: null, message: '' })
    try {
      const result = await operation()
      if (!result.ok) {
        set({ error: result.error.message })
        return null
      }
      await load()
      set({ message })
      return result.data
    } catch {
      set({
        error:
          'No fue posible completar la operación. Consulta las mensualidades antes de volver a intentarlo.',
      })
      return null
    } finally {
      set({ mutating: false })
    }
  }

  const runBoolean = async <T>(
    operation: () => Promise<ApiResult<T>>,
    message: string,
  ): Promise<boolean> => (await run(operation, message)) !== null

  return {
    subscriptions: [],
    customers: [],
    plans: [],
    summary: EMPTY_SUMMARY,
    search: '',
    status: 'all',
    loading: true,
    mutating: false,
    error: null,
    message: '',
    initialize: async () => {
      set({ loading: true, error: null })
      await load()
    },
    refresh: load,
    setSearch: async (search) => {
      set({ search })
      await load()
    },
    setStatus: async (status) => {
      set({ status })
      await load()
    },
    createCustomer: (input) =>
      runBoolean(() => window.parkingAPI.createMonthlyCustomer(input), 'Cliente creado.'),
    updateCustomer: (input) =>
      runBoolean(() => window.parkingAPI.updateMonthlyCustomer(input), 'Cliente actualizado.'),
    deleteCustomer: (id) =>
      runBoolean(() => window.parkingAPI.deleteMonthlyCustomer({ id }), 'Cliente eliminado.'),
    createPlan: (input) =>
      runBoolean(() => window.parkingAPI.createMonthlyPlan(input), 'Plan mensual creado.'),
    updatePlan: (input) =>
      runBoolean(() => window.parkingAPI.updateMonthlyPlan(input), 'Plan mensual actualizado.'),
    deletePlan: (id) =>
      runBoolean(() => window.parkingAPI.deleteMonthlyPlan({ id }), 'Plan mensual eliminado.'),
    createSubscription: (input) =>
      runBoolean(() => window.parkingAPI.createSubscription(input), 'Mensualidad creada.'),
    renewSubscription: (input) =>
      runBoolean(() => window.parkingAPI.renewSubscription(input), 'Mensualidad renovada.'),
    cancelSubscription: (id, reason) =>
      runBoolean(
        () => window.parkingAPI.cancelSubscription({ id, reason }),
        'Mensualidad cancelada.',
      ),
    registerPayment: (input) =>
      run(() => window.parkingAPI.registerSubscriptionPayment(input), 'Pago registrado.'),
    clearFeedback: () => set({ error: null, message: '' }),
  }
})
