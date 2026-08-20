import { create } from 'zustand'
import type { CashCloseSummary, CashMovement, CashSession, CashState } from '@shared/contracts'
import type { CloseCashSessionInput, OpenCashSessionInput, VoidPaymentInput } from '@shared/cash'

type CashStore = {
  session: CashSession | null
  movements: CashMovement[]
  collectedCop: number
  voidedCop: number
  expectedCop: number
  movementCount: number
  closedSessions: CashCloseSummary[]
  loading: boolean
  error: string | null
  message: string
  lastClose: CashCloseSummary | null
  initialize: () => Promise<void>
  refresh: () => Promise<void>
  openSession: (input: OpenCashSessionInput) => Promise<boolean>
  closeSession: (input: CloseCashSessionInput) => Promise<CashCloseSummary | null>
  voidPayment: (input: VoidPaymentInput) => Promise<boolean>
  clearFeedback: () => void
  dismissClose: () => void
}

const EMPTY_STATE: CashState = {
  session: null,
  movements: [],
  collectedCop: 0,
  voidedCop: 0,
  expectedCop: 0,
  movementCount: 0,
}

export const useCashStore = create<CashStore>((set, get) => {
  const apply = (state: CashState): void => {
    set({
      session: state.session,
      movements: state.movements,
      collectedCop: state.collectedCop,
      voidedCop: state.voidedCop,
      expectedCop: state.expectedCop,
      movementCount: state.movementCount,
      loading: false,
      error: null,
    })
  }

  const load = async (): Promise<void> => {
    const [stateResult, sessionsResult] = await Promise.all([
      window.parkingAPI.getCashState(),
      window.parkingAPI.listCashSessions(),
    ])
    if (stateResult.ok) {
      apply(stateResult.data)
      set({ closedSessions: sessionsResult.ok ? sessionsResult.data : [] })
    } else {
      set({ loading: false, error: stateResult.error.message })
    }
  }

  return {
    ...EMPTY_STATE,
    closedSessions: [],
    loading: true,
    error: null,
    message: '',
    lastClose: null,
    initialize: async () => {
      set({ loading: true, error: null })
      await load()
    },
    refresh: load,
    openSession: async (input) => {
      set({ error: null, message: '' })
      const result = await window.parkingAPI.openCashSession(input)
      if (!result.ok) {
        set({ error: result.error.message })
        return false
      }
      apply(result.data)
      set({ message: 'Caja abierta.' })
      return true
    },
    closeSession: async (input) => {
      set({ error: null, message: '' })
      const result = await window.parkingAPI.closeCashSession(input)
      if (!result.ok) {
        set({ error: result.error.message })
        return null
      }
      set({ lastClose: result.data, message: 'Caja cerrada.' })
      await get().refresh()
      return result.data
    },
    voidPayment: async (input) => {
      set({ error: null, message: '' })
      const result = await window.parkingAPI.voidCashPayment(input)
      if (!result.ok) {
        set({ error: result.error.message })
        return false
      }
      apply(result.data)
      set({ message: 'Cobro anulado.' })
      return true
    },
    clearFeedback: () => set({ error: null, message: '' }),
    dismissClose: () => set({ lastClose: null }),
  }
})
