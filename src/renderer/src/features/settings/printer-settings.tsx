import { Printer, RefreshCw, Ruler } from 'lucide-react'
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

/** Ancho que imprime el cabezal en cada rollo; coincide con el del proceso principal. */
const STANDARD_PRINT_WIDTH_MM: Record<AppSettings['paperWidth'], number> = {
  '80mm': 72,
  '58mm': 48,
}
const AUTOMATIC_WIDTH = '__auto'

function formatMillimeters(value: number): string {
  return `${String(value).replace('.', ',')} mm`
}

function widthOptions(paperWidth: AppSettings['paperWidth']): number[] {
  const standard = STANDARD_PRINT_WIDTH_MM[paperWidth]
  const nominal = paperWidth === '80mm' ? 80 : 58
  const options: number[] = []
  for (let width = standard - 16; width <= nominal; width += 1) options.push(width)
  return options
}

const OFFSET_OPTIONS = Array.from({ length: 25 }, (_, index) => (index - 12) / 2)

function describeOffset(offsetMm: number): string {
  if (offsetMm === 0) return 'Centrado'
  const amount = formatMillimeters(Math.abs(offsetMm))
  return offsetMm > 0 ? `${amount} a la derecha` : `${amount} a la izquierda`
}

const DEFAULT_SETTINGS: AppSettings = {
  printerName: null,
  paperWidth: '80mm',
  showPrintDialog: true,
  printWidthMm: null,
  printOffsetMm: 0,
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

  const printCalibration = async (): Promise<void> => {
    setPrinting(true)
    setMessage('')
    setError('')
    const result = await window.parkingAPI.printCalibrationGuide()
    if (result.ok) {
      if (result.data.printed) setMessage(result.data.message)
      else setError(result.data.message)
    } else setError(result.error.message)
    setPrinting(false)
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
          <Field>
            <FieldLabel htmlFor="print-width-select">Ancho de impresión</FieldLabel>
            <Select
              value={
                settings.printWidthMm === null ? AUTOMATIC_WIDTH : String(settings.printWidthMm)
              }
              onValueChange={(value) =>
                void saveSettings({
                  printWidthMm: value === AUTOMATIC_WIDTH ? null : Number(value),
                })
              }
            >
              <SelectTrigger id="print-width-select" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value={AUTOMATIC_WIDTH}>
                    Automático ({formatMillimeters(STANDARD_PRINT_WIDTH_MM[settings.paperWidth])})
                  </SelectItem>
                  {widthOptions(settings.paperWidth).map((width) => (
                    <SelectItem key={width} value={String(width)}>
                      {formatMillimeters(width)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Si el tiquete sale cortado a la derecha, imprime la guía de ajuste y elige el último
              número que se vea completo.
            </FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="print-offset-select">Ajuste horizontal</FieldLabel>
            <Select
              value={String(settings.printOffsetMm)}
              onValueChange={(value) => void saveSettings({ printOffsetMm: Number(value) })}
            >
              <SelectTrigger id="print-offset-select" className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {OFFSET_OPTIONS.map((offset) => (
                    <SelectItem key={offset} value={String(offset)}>
                      {describeOffset(offset)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <FieldDescription>
              Mueve todo el contenido si queda corrido hacia un lado del papel.
            </FieldDescription>
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
        <Button
          variant="outline"
          onClick={() => void printCalibration()}
          disabled={printing || printers.length === 0}
        >
          <Ruler data-icon="inline-start" />
          Imprimir guía de ajuste
        </Button>
        <Button onClick={() => void printTest()} disabled={printing || printers.length === 0}>
          <Printer data-icon="inline-start" />
          {printing ? 'Imprimiendo…' : 'Imprimir ticket de prueba'}
        </Button>
      </CardFooter>
    </Card>
  )
}
