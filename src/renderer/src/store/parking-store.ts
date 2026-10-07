import { create } from 'zustand'
import type {
  ActiveSession,
  EntryRegistration,
  ExitRegistration,
  PendingPayment,
} from '@shared/contracts'
import type { PaymentMethod } from '@shared/parking'
import type { VehicleType } from '@shared/tariff'

type EntryInput = {
  plate: string
  vehicleType: VehicleType
  ratePlanId: string
  notes: string | null
}

type CloseInput = {
  sessionId: string
  expectedTotalCop: number
  method: PaymentMethod
  receivedCop: number | null
  notes: string | null
}

type PendingInput = {
  sessionId: string
  expectedTotalCop: number
}

type SettleInput = {
  pendingPaymentId: string
  method: PaymentMethod
  receivedCop: number | null
}

type ParkingStore = {
  sessions: ActiveSession[]
  /** Salidas que quedaron debiendo, de todos los vehículos. */
  pendingPayments: PendingPayment[]
  search: string
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  refreshPending: () => Promise<void>
  setSearch: (search: string) => Promise<void>
  registerEntry: (input: EntryInput) => Promise<EntryRegistration | null>
  closeSession: (input: CloseInput) => Promise<ExitRegistration | null>
  cancelSession: (sessionId: string, reason: string) => Promise<boolean>
  markPaymentPending: (input: PendingInput) => Promise<PendingPayment | null>
  settlePendingPayment: (input: SettleInput) => Promise<ExitRegistration | null>
  clearError: () => void
}

export const useParkingStore = create<ParkingStore>((set, get) => ({
  sessions: [],
  pendingPayments: [],
  search: '',
  loading: true,
  error: null,
  refresh: async () => {
    const [result] = await Promise.all([
      window.parkingAPI.listActiveSessions({ search: get().search }),
      get().refreshPending(),
    ])
    if (result.ok) set({ sessions: result.data, loading: false, error: null })
    else set({ loading: false, error: result.error.message })
  },
  refreshPending: async () => {
    const result = await window.parkingAPI.listPendingPayments()
    // Si la consulta falla se conserva lo último conocido: es un aviso, no una operación.
    if (result.ok) set({ pendingPayments: result.data })
  },
  setSearch: async (search) => {
    set({ search })
    await get().refresh()
  },
  registerEntry: async (input) => {
    set({ error: null })
    const result = await window.parkingAPI.registerEntry(input)
    if (!result.ok) {
      set({ error: result.error.message })
      return null
    }
    await get().refresh()
    return result.data
  },
  closeSession: async (input) => {
    set({ error: null })
    const result = await window.parkingAPI.closeSession(input)
    if (!result.ok) {
      set({ error: result.error.message })
      return null
    }
    await get().refresh()
    return result.data
  },
  cancelSession: async (sessionId, reason) => {
    set({ error: null })
    const result = await window.parkingAPI.cancelSession({ sessionId, reason })
    if (!result.ok) {
      set({ error: result.error.message })
      return false
    }
    set({ sessions: result.data, error: null })
    return true
  },
  markPaymentPending: async (input) => {
    set({ error: null })
    const result = await window.parkingAPI.markPaymentPending(input)
    if (!result.ok) {
      set({ error: result.error.message })
      return null
    }
    await get().refresh()
    return result.data
  },
  settlePendingPayment: async (input) => {
    set({ error: null })
    const result = await window.parkingAPI.settlePendingPayment(input)
    if (!result.ok) {
      set({ error: result.error.message })
      return null
    }
    await get().refreshPending()
    return result.data
  },
  clearError: () => set({ error: null }),
}))
