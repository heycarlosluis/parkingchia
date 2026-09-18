import { Printer, RefreshCw, RotateCcw, Ruler } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import type { AppSettings, PrinterInfo } from '@shared/contracts'
import { MIN_PRINT_WIDTH_MM, PRINTABLE_WIDTH_MM } from '@shared/ipc'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
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

const AUTOMATIC_WIDTH = '__auto'

function formatMillimeters(value: number): string {
  return `${String(value).replace('.', ',')} mm`
}

function widthOptions(paperWidth: AppSettings['paperWidth']): number[] {
  const standard = PRINTABLE_WIDTH_MM[paperWidth]
  const nominal = paperWidth === '80mm' ? 80 : 58
  const options: number[] = []
  // Nunca por debajo del mínimo que acepta la validación.
  const from = Math.max(MIN_PRINT_WIDTH_MM, standard - 16)
  for (let width = from; width <= nominal; width += 1) options.push(width)
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

  const saveSettings = async (
    patch: Partial<AppSettings>,
    successMessage = 'Configuración de impresión guardada.',
  ): Promise<void> => {
    setError('')
    setMessage('')
    const result = await window.parkingAPI.updateSettings(patch)
    if (result.ok) {
      setSettings(result.data)
      setMessage(successMessage)
    } else setError(result.error.message)
  }

  const standardWidth = formatMillimeters(PRINTABLE_WIDTH_MM[settings.paperWidth])
  const layoutIsFactory = settings.printWidthMm === null && settings.printOffsetMm === 0

  /**
   * Vuelve al ajuste que funciona con la mayoría de drivers: el ancho que
   * imprime el cabezal para el rollo elegido, centrado y dentro del área que
   * declare la impresora. La impresora y el papel elegidos se conservan.
   */
  const restoreFactoryLayout = (): Promise<void> =>
    saveSettings(
      { printWidthMm: null, printOffsetMm: 0 },
      `Ajuste de fábrica restablecido: ${standardWidth} centrado para papel de ${settings.paperWidth.replace('mm', ' mm')}.`,
    )

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
              onValueChange={(value: '58mm' | '80mm') =>
                void saveSettings(
                  { paperWidth: value },
                  `Papel de ${value.replace('mm', ' mm')} guardado con su ajuste de fábrica.`,
                )
              }
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
            <FieldDescription>
              Al cambiarlo, el ajuste del papel vuelve al de fábrica.
            </FieldDescription>
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
                  <SelectItem value={AUTOMATIC_WIDTH}>Automático ({standardWidth})</SelectItem>
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
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={layoutIsFactory}>
              <RotateCcw data-icon="inline-start" />
              Restablecer de fábrica
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>¿Restablecer el ajuste de fábrica?</AlertDialogTitle>
              <AlertDialogDescription>
                El ancho de impresión vuelve a automático ({standardWidth}) y el contenido queda
                centrado, que es el ajuste recomendado para papel de{' '}
                {settings.paperWidth.replace('mm', ' mm')}. La impresora y el ancho del papel no
                cambian.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => void restoreFactoryLayout()}>
                Restablecer
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
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
