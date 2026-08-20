import { useEffect } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { ChargeSimulatorCard } from '@/features/tariffs/charge-simulator-card'
import { RatePlansCard } from '@/features/tariffs/rate-plans-card'
import { TariffSettingsCard } from '@/features/tariffs/tariff-settings-card'
import { useTariffStore } from '@/store/tariff-store'

export function TariffsSettings(): React.JSX.Element {
  const initialize = useTariffStore((store) => store.initialize)
  const loading = useTariffStore((store) => store.loading)
  const error = useTariffStore((store) => store.error)
  const message = useTariffStore((store) => store.message)

  useEffect(() => {
    void initialize()
  }, [initialize])

  return (
    <>
      <div className="stable-status" role="status" aria-live="polite">
        {message}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {loading ? (
        <p className="field-hint">Cargando la configuración de tarifas…</p>
      ) : (
        <>
          <TariffSettingsCard />
          <RatePlansCard />
          <ChargeSimulatorCard />
        </>
      )}
    </>
  )
}
