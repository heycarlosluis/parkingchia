import { create } from 'zustand'
import type { AppStatus, UpdateState } from '@shared/contracts'

type SystemStore = {
  status: AppStatus | null
  updateState: UpdateState | null
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  refreshStatus: () => Promise<void>
  setUpdateState: (state: UpdateState) => void
}

export const useSystemStore = create<SystemStore>((set) => ({
  status: null,
  updateState: null,
  loading: true,
  error: null,
  initialize: async () => {
    set({ loading: true, error: null })
    const [statusResult, updateResult] = await Promise.all([
      window.parkingAPI.getAppStatus(),
      window.parkingAPI.getUpdateState(),
    ])
    set({
      status: statusResult.ok ? statusResult.data : null,
      updateState: updateResult.ok ? updateResult.data : null,
      loading: false,
      error: statusResult.ok ? null : statusResult.error.message,
    })
  },
  refreshStatus: async () => {
    const result = await window.parkingAPI.getAppStatus()
    if (result.ok) set({ status: result.data, error: null })
    else set({ error: result.error.message })
  },
  setUpdateState: (updateState) => set({ updateState }),
}))
