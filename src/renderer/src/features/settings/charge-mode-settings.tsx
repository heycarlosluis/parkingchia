import { HandCoins } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldContent, FieldDescription, FieldLabel } from '@/components/ui/field'
import { useChargeModeStore } from '@/store/charge-mode-store'

export function ChargeModeSettings(): React.JSX.Element {
  const simpleChargeMode = useChargeModeStore((store) => store.simpleChargeMode)
  const initialize = useChargeModeStore((store) => store.initialize)
  const setSimpleChargeMode = useChargeModeStore((store) => store.setSimpleChargeMode)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    void initialize()
  }, [initialize])

  const save = async (enabled: boolean): Promise<void> => {
    setError('')
    setMessage('')
    const failure = await setSimpleChargeMode(enabled)
    if (failure) setError(failure)
    else setMessage(enabled ? 'Cobro simplificado activado.' : 'Cobro simplificado desactivado.')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <HandCoins aria-hidden="true" /> Modo de cobro
        </CardTitle>
        <CardDescription>
          Define cuánto detalle se registra al cobrar y al cuadrar la caja.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>No fue posible cambiar el modo de cobro</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <Field orientation="horizontal">
          <Checkbox
            id="simple-charge-mode"
            checked={simpleChargeMode}
            onCheckedChange={(checked) => void save(checked === true)}
          />
          <FieldContent>
            <FieldLabel htmlFor="simple-charge-mode">Cobro simplificado</FieldLabel>
            <FieldDescription>
              Cada salida se cobra por su total, sin registrar el efectivo recibido ni calcular el
              cambio. La caja solo acumula lo cobrado: no pide fondo inicial ni conteo al cerrar, y
              lo único que descuenta son las anulaciones.
            </FieldDescription>
          </FieldContent>
        </Field>
        <div className="stable-status" role="status" aria-live="polite">
          {message}
        </div>
      </CardContent>
    </Card>
  )
}
