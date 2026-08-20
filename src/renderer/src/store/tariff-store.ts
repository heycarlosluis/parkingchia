import { create } from 'zustand'
import type { RatePlan, RatePlanDraft, TariffConfiguration } from '@shared/contracts'
import { DEFAULT_TARIFF_SETTINGS, type TariffSettings } from '@shared/tariff'

type TariffStore = {
  settings: TariffSettings
  plans: RatePlan[]
  loading: boolean
  error: string | null
  message: string
  initialize: () => Promise<void>
  updateSettings: (input: Partial<Omit<TariffSettings, 'currency'>>) => Promise<boolean>
  createPlan: (input: RatePlanDraft) => Promise<boolean>
  updatePlan: (input: RatePlanDraft & { id: string }) => Promise<boolean>
  deletePlan: (id: string) => Promise<boolean>
  clearFeedback: () => void
}

export const useTariffStore = create<TariffStore>((set, get) => {
  const apply = (configuration: TariffConfiguration, message: string): void => {
    set({
      settings: configuration.settings,
      plans: configuration.plans,
      loading: false,
      error: null,
      message,
    })
  }

  const run = async (
    operation: () => Promise<
      { ok: true; data: TariffConfiguration } | { ok: false; error: { message: string } }
    >,
    message: string,
  ): Promise<boolean> => {
    set({ error: null, message: '' })
    const result = await operation()
    if (!result.ok) {
      set({ error: result.error.message })
      return false
    }
    apply(result.data, message)
    return true
  }

  return {
    settings: DEFAULT_TARIFF_SETTINGS,
    plans: [],
    loading: true,
    error: null,
    message: '',
    initialize: async () => {
      set({ loading: true, error: null })
      const result = await window.parkingAPI.getTariffConfiguration()
      if (result.ok) apply(result.data, get().message)
      else set({ loading: false, error: result.error.message })
    },
    updateSettings: (input) =>
      run(
        () => window.parkingAPI.updateTariffSettings(input),
        'Configuración de tarifas guardada.',
      ),
    createPlan: (input) => run(() => window.parkingAPI.createRatePlan(input), 'Tarifa creada.'),
    updatePlan: (input) =>
      run(() => window.parkingAPI.updateRatePlan(input), 'Tarifa actualizada.'),
    deletePlan: (id) => run(() => window.parkingAPI.deleteRatePlan({ id }), 'Tarifa eliminada.'),
    clearFeedback: () => set({ error: null, message: '' }),
  }
})
