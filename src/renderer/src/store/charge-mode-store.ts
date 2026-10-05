import { create } from 'zustand'

type ChargeModeStore = {
  /** Cobro simplificado: sin efectivo recibido, sin fondo inicial y sin conteo al cerrar. */
  simpleChargeMode: boolean
  initialize: () => Promise<void>
  /** Guarda el modo y devuelve el mensaje de error, o `null` si se guardó. */
  setSimpleChargeMode: (enabled: boolean) => Promise<string | null>
}

export const useChargeModeStore = create<ChargeModeStore>((set) => ({
  simpleChargeMode: false,
  initialize: async () => {
    const result = await window.parkingAPI.getSettings()
    if (result.ok) set({ simpleChargeMode: result.data.simpleChargeMode })
  },
  setSimpleChargeMode: async (enabled) => {
    const result = await window.parkingAPI.updateSettings({ simpleChargeMode: enabled })
    if (!result.ok) return result.error.message
    set({ simpleChargeMode: result.data.simpleChargeMode })
    return null
  },
}))
