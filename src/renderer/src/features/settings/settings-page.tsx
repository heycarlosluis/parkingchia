import { DatabaseBackup, Download, Printer, RefreshCw, RotateCcw } from 'lucide-react'
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
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { PageHeading } from '@/components/page-heading'
import { useSystemStore } from '@/store/system-store'

const DEFAULT_SETTINGS: AppSettings = {
  printerName: null,
  paperWidth: '80mm',
  showPrintDialog: true,
}

export function SettingsPage(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS)
  const [printers, setPrinters] = useState<PrinterInfo[]>([])
  const [printing, setPrinting] = useState(false)
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')
  const updateState = useSystemStore((state) => state.updateState)
  const setUpdateState = useSystemStore((state) => state.setUpdateState)
  const version = useSystemStore((state) => state.status?.version ?? '…')

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

  const checkUpdates = async (): Promise<void> => {
    const result = await window.parkingAPI.checkForUpdates()
    if (result.ok) setUpdateState(result.data)
    else setError(result.error.message)
  }

  const downloadUpdate = async (): Promise<void> => {
    const result = await window.parkingAPI.downloadUpdate()
    if (result.ok) setUpdateState(result.data)
    else setError(result.error.message)
  }

  const createBackup = async (): Promise<void> => {
    const result = await window.parkingAPI.createBackup()
    if (result.ok) setMessage(result.data.message)
    else setError(result.error.message)
  }

  return (
    <div className="page-stack settings-page">
      <PageHeading
        title="Configuración"
        description="Administra los dispositivos, datos locales y versión instalada."
      />

      <div className="stable-status" role="status" aria-live="polite">
        {message}
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>La operación no se completó</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="title-with-icon">
            <Printer aria-hidden="true" /> Impresora térmica
          </CardTitle>
          <CardDescription>
            Selecciona una impresora del sistema y el ancho del papel.
          </CardDescription>
        </CardHeader>
        <CardContent className="settings-fields">
          <div className="field-stack">
            <Label htmlFor="printer-select">Impresora</Label>
            <Select
              value={settings.printerName ?? '__none'}
              onValueChange={(value) =>
                void saveSettings({ printerName: value === '__none' ? null : value })
              }
            >
              <SelectTrigger id="printer-select">
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
            <p className="field-hint">
              {printers.length === 0
                ? 'No se encontraron impresoras. Puedes actualizar la lista.'
                : `${printers.length} impresora${printers.length === 1 ? '' : 's'} disponible${printers.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          <div className="field-stack">
            <Label htmlFor="paper-select">Ancho del papel</Label>
            <Select
              value={settings.paperWidth}
              onValueChange={(value: '58mm' | '80mm') => void saveSettings({ paperWidth: value })}
            >
              <SelectTrigger id="paper-select">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="58mm">58 mm</SelectItem>
                  <SelectItem value="80mm">80 mm</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <label className="checkbox-row">
            <input
              type="checkbox"
              checked={settings.showPrintDialog}
              onChange={(event) => void saveSettings({ showPrintDialog: event.target.checked })}
            />
            <span>
              <strong>Mostrar diálogo del sistema</strong>
              <small>Recomendado durante las pruebas de impresión.</small>
            </span>
          </label>
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

      <Card>
        <CardHeader>
          <CardTitle className="title-with-icon">
            <RefreshCw aria-hidden="true" /> Actualizaciones
          </CardTitle>
          <CardDescription>
            Versión instalada: <span className="tabular">{version}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="settings-section-content">
          <div>
            <p className="system-label">Estado actual</p>
            <p>{updateState?.message ?? 'Consultando el estado…'}</p>
          </div>
          {updateState?.status === 'downloading' || updateState?.status === 'downloaded' ? (
            <div className="progress-stack">
              <Progress value={updateState.progress ?? 0} aria-label="Progreso de descarga" />
              <span className="tabular">{updateState.progress ?? 0}%</span>
            </div>
          ) : null}
        </CardContent>
        <CardFooter className="button-row">
          <Button
            variant="outline"
            onClick={() => void checkUpdates()}
            disabled={!updateState?.canCheck || updateState.status === 'checking'}
          >
            <RefreshCw data-icon="inline-start" />
            {updateState?.status === 'checking' ? 'Buscando…' : 'Buscar actualizaciones'}
          </Button>
          {updateState?.status === 'available' ? (
            <Button onClick={() => void downloadUpdate()}>
              <Download data-icon="inline-start" />
              Descargar actualización
            </Button>
          ) : null}
          {updateState?.status === 'downloaded' ? (
            <Button onClick={() => void window.parkingAPI.installUpdate()}>
              <RotateCcw data-icon="inline-start" />
              Reiniciar e instalar
            </Button>
          ) : null}
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="title-with-icon">
            <DatabaseBackup aria-hidden="true" /> Datos y copias de seguridad
          </CardTitle>
          <CardDescription>
            La base de datos pertenece al usuario y las actualizaciones no la reemplazan.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Separator />
          <p className="backup-copy">
            Guarda una copia en una ubicación elegida mediante el diálogo seguro del sistema.
          </p>
        </CardContent>
        <CardFooter>
          <Button variant="outline" onClick={() => void createBackup()}>
            <DatabaseBackup data-icon="inline-start" />
            Crear copia de seguridad
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
