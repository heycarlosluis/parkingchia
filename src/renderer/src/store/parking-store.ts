import { create } from 'zustand'
import type { ActiveSession, EntryRegistration, ExitRegistration } from '@shared/contracts'
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

type ParkingStore = {
  sessions: ActiveSession[]
  search: string
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
  setSearch: (search: string) => Promise<void>
  registerEntry: (input: EntryInput) => Promise<EntryRegistration | null>
  closeSession: (input: CloseInput) => Promise<ExitRegistration | null>
  cancelSession: (sessionId: string, reason: string) => Promise<boolean>
  clearError: () => void
}

export const useParkingStore = create<ParkingStore>((set, get) => ({
  sessions: [],
  search: '',
  loading: true,
  error: null,
  refresh: async () => {
    const result = await window.parkingAPI.listActiveSessions({ search: get().search })
    if (result.ok) set({ sessions: result.data, loading: false, error: null })
    else set({ loading: false, error: result.error.message })
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
  clearError: () => set({ error: null }),
}))
