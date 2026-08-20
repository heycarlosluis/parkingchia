import { create } from 'zustand'
import type { AccessState } from '@shared/contracts'

const ACCESS_TIMEOUT_MILLISECONDS = 8_000

async function loadAccessState(): ReturnType<Window['parkingAPI']['getAccessState']> {
  if (!window.parkingAPI) throw new Error('La API segura de Electron no está disponible')

  let timeoutId: number | undefined
  try {
    return await Promise.race([
      window.parkingAPI.getAccessState(),
      new Promise<never>((_resolve, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('La configuración local tardó demasiado en responder')),
          ACCESS_TIMEOUT_MILLISECONDS,
        )
      }),
    ])
  } finally {
    if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  }
}

type AccessStore = {
  state: AccessState | null
  loading: boolean
  error: string | null
  initialize: () => Promise<void>
  setAccessState: (state: AccessState) => void
}

export const useAccessStore = create<AccessStore>((set) => ({
  state: null,
  loading: true,
  error: null,
  initialize: async () => {
    set({ loading: true, error: null })
    try {
      const result = await loadAccessState()
      if (result.ok) set({ state: result.data, loading: false, error: null })
      else set({ state: null, loading: false, error: result.error.message })
    } catch {
      set({
        state: null,
        loading: false,
        error: 'No fue posible conectar la interfaz con los datos locales. Reinicia la aplicación.',
      })
    }
  },
  setAccessState: (state) => set({ state, loading: false, error: null }),
}))
