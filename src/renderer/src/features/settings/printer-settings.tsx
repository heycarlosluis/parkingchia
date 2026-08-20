import { Printer, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, PrinterInfo } from '@shared/contracts'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const DEFAULT_SETTINGS: AppSettings = {
  printerName: null,
  paperWidth: '80mm',
  showPrintDialog: true,
}

export function PrinterSettings(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printing, setPrinting] = useState(false)
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')

  const loadPrinters = useCallback(async () => {
    setLoadingPrinters(true)
    setError('')
    const result = await window.parkingAPI.listPrinters()
    if (result.ok) setPrinters(result.data)
    else setError(result.error.message)
    setLoadingPrinters(false)
  }, [])

  useEffect(() => {
    void Promise.all([window.parkingAPI.getSettings(), window.parkingAPI.listPrinters()]).then(
      ([settingsResult, printersResult]) => {
        if (settingsResult.ok) setSettings(settingsResult.data)
        else setError(settingsResult.error.message)
        if (printersResult.ok) setPrinters(printersResult.data)
      },
    )
  }, [])

  const saveSettings = async (patch: Partial<AppSettings>): Promise<void> => {
    setError('')
    setMessage('')
    const result = await window.parkingAPI.updateSettings(patch)
    if (result.ok) {
      setSettings(result.data)
      setMessage('Configuración de impresión guardada.')
    } else setError(result.error.message)
  }

  const printTest = async (): Promise<void> => {
    setPrinting(true)
    setMessage('')
    setError('')
    const result = await window.parkingAPI.printTestTicket()
    if (result.ok) {
      if (result.data.printed) setMessage(result.data.message)
      else setError(result.data.message)
    } else setError(result.error.message)
    setPrinting(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="title-with-icon">
          <Printer aria-hidden="true" /> Impresora térmica
        </CardTitle>
        <CardDescription>
          Selecciona una impresora del sistema y el ancho del papel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertTitle>La operación no se completó</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="printer-select">Impresora</FieldLabel>
            <Select
              value={settings.printerName ?? '__none'}
              onValueChange={(value) =>
                void saveSettings({ printerName: value === '__none' ? null : value })
              }
            >
              <SelectTrigger id="printer-select" className="min-h-11">
                <SelectValue placeholder="Selecciona una impresora" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="__none">Sin impresora seleccionada</SelectItem>
                  {printers.map((printer) => (
                    <SelectItem key={printer.name} value={printer.name}>
                      {printer.displayName}
                      {printer.isDefault ? ' (predeterminada)' : ''}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              {printers.length === 0
                ? 'No se encontraron impresoras. Puedes actualizar la lista.'
                : `${printers.length} impresora${printers.length === 1 ? '' : 's'} disponible${printers.length === 1 ? '' : 's'}.`}
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="paper-select">Ancho del papel</FieldLabel>
            <Select
              value={settings.paperWidth}
              onValueChange={(value: '58mm' | '80mm') => void saveSettings({ paperWidth: value })}
            >
              <SelectTrigger id="paper-select" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="58mm">58 mm</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </Field>
          <Field orientation="horizontal">
            <Checkbox
              id="printer-show-dialog"
              checked={settings.showPrintDialog}
              onCheckedChange={(checked) =>
                void saveSettings({ showPrintDialog: checked === true })
              }
            />
            <FieldContent>
              <FieldLabel htmlFor="printer-show-dialog">Mostrar diálogo del sistema</FieldLabel>
              <FieldDescription>Recomendado durante las pruebas de impresión.</FieldDescription>
            </FieldContent>
          </Field>
        </FieldGroup>
        <div className="stable-status" role="status" aria-live="polite">
          {message}
        </div>
      </CardContent>
      <CardFooter className="button-row">
        <Button variant="outline" onClick={() => void loadPrinters()} disabled={loadingPrinters}>
          <RefreshCw data-icon="inline-start" />
          {loadingPrinters ? 'Actualizando…' : 'Actualizar impresoras'}
        </Button>
        <Button onClick={() => void printTest()} disabled={printing || printers.length === 0}>
          <Printer data-icon="inline-start" />
          {printing ? 'Imprimiendo…' : 'Imprimir ticket de prueba'}
        </Button>
      </CardFooter>
    </Card>
  )
}
