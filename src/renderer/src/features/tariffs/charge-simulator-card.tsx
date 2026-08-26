import { Calculator } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatCurrency } from '@shared/format'
import { describeElapsed } from '@shared/parking'
import { describeBilledTime, MINUTES_PER_DAY, type ParkingCharge } from '@shared/tariff'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useTariffStore } from '@/store/tariff-store'

export function ChargeSimulatorCard(): React.JSX.Element {
  const settings = useTariffStore((store) => store.settings)
  const plans = useTariffStore((store) => store.plans)
  const activePlans = plans.filter((plan) => plan.status === 'active')

  const [planId, setPlanId] = useState('')
  const [minutes, setMinutes] = useState(90)
  const [charge, setCharge] = useState<ParkingCharge | null>(null)
  const [error, setError] = useState('')

  const selectedPlanId = activePlans.some((plan) => plan.id === planId)
    ? planId
    : (activePlans[0]?.id ?? '')

  const inputsReady = selectedPlanId !== '' && Number.isInteger(minutes) && minutes >= 0

  useEffect(() => {
    if (!inputsReady) return
    let cancelled = false
    void window.parkingAPI
      .simulateCharge({ ratePlanId: selectedPlanId, minutes })
      .then((result) => {
        if (cancelled) return
        if (result.ok) {
          setCharge(result.data)
          setError('')
        } else {
          setCharge(null)
          setError(result.error.message)
        }
      })
    return () => {
      cancelled = true
    }
  }, [inputsReady, selectedPlanId, minutes, settings])

  const visibleCharge = inputsReady ? charge : null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <Calculator aria-hidden="true" /> Simulador de cobro
        </CardTitle>
        <CardDescription>
          Comprueba cuánto pagaría un vehículo con la configuración guardada.
        </CardDescription>
      </CardHeader>
      <CardContent className="settings-section-content">
        {activePlans.length === 0 ? (
          <p className="field-hint">Activa al menos una tarifa para simular un cobro.</p>
        ) : (
          <>
            <div className="simulator-inputs">
              <Field>
                <FieldLabel htmlFor="simulator-plan">Tarifa</FieldLabel>
                <Select value={selectedPlanId} onValueChange={setPlanId}>
                  <SelectTrigger id="simulator-plan" className="min-h-11">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {activePlans.map((plan) => (
                        <SelectItem key={plan.id} value={plan.id}>
                          {plan.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="simulator-minutes">Permanencia en minutos</FieldLabel>
                <Input
                  id="simulator-minutes"
                  className="min-h-11"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={MINUTES_PER_DAY * 31}
                  step={5}
                  value={Number.isFinite(minutes) ? minutes : ''}
                  onChange={(event) => setMinutes(event.target.valueAsNumber)}
                />
                <FieldDescription>
                  {Number.isFinite(minutes) ? describeElapsed(minutes) : 'Ingresa los minutos'}
                </FieldDescription>
              </Field>
            </div>

            <div className="stable-status" role="status" aria-live="polite">
              {error}
            </div>

            {visibleCharge ? (
              <dl className="charge-breakdown">
                <div>
                  <dt>Tiempo cobrado</dt>
                  <dd>{describeBilledTime(visibleCharge)}</dd>
                </div>
                <div>
                  <dt>Base</dt>
                  <dd className="tabular">{formatCurrency(visibleCharge.baseCop)}</dd>
                </div>
                <div>
                  <dt>Subtotal sin IVA</dt>
                  <dd className="tabular">{formatCurrency(visibleCharge.subtotalCop)}</dd>
                </div>
                <div>
                  <dt>
                    IVA {visibleCharge.taxPercent > 0 ? `(${visibleCharge.taxPercent} %)` : ''}
                  </dt>
                  <dd className="tabular">{formatCurrency(visibleCharge.taxCop)}</dd>
                </div>
                <div>
                  <dt>Redondeo</dt>
                  <dd className="tabular">{formatCurrency(visibleCharge.roundingAdjustmentCop)}</dd>
                </div>
                <div className="charge-total">
                  <dt>Total a cobrar</dt>
                  <dd className="tabular">{formatCurrency(visibleCharge.totalCop)}</dd>
                </div>
              </dl>
            ) : null}

            {visibleCharge?.appliedMinimumCharge ? (
              <p className="field-hint">Se aplicó el cobro mínimo de la tarifa.</p>
            ) : null}
            {visibleCharge && visibleCharge.plenaCount > 0 ? (
              <p className="field-hint">
                Se cobraron {visibleCharge.plenaCount}{' '}
                {visibleCharge.plenaCount === 1 ? 'plena' : 'plenas'} a{' '}
                {formatCurrency(visibleCharge.plenaUnitCop)} cada una.
              </p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
