import { DatabaseBackup, Download, RefreshCw, RotateCcw } from 'lucide-react'
import { useState } from 'react'
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
import { Progress } from '@/components/ui/progress'
import { useSystemStore } from '@/store/system-store'

export function SystemSettings(): React.JSX.Element {
  const updateState = useSystemStore((state) => state.updateState)
  const setUpdateState = useSystemStore((state) => state.setUpdateState)
  const version = useSystemStore((state) => state.status?.version ?? '…')
  const [message, setMessage] = useState<string>('')
  const [error, setError] = useState<string>('')

  const checkUpdates = async (): Promise<void> => {
    setError('')
    const result = await window.parkingAPI.checkForUpdates()
    if (result.ok) setUpdateState(result.data)
    else setError(result.error.message)
  }

  const downloadUpdate = async (): Promise<void> => {
    setError('')
    const result = await window.parkingAPI.downloadUpdate()
    if (result.ok) setUpdateState(result.data)
    else setError(result.error.message)
  }

  const createBackup = async (): Promise<void> => {
    setError('')
    setMessage('')
    const result = await window.parkingAPI.createBackup()
    if (result.ok) setMessage(result.data.message)
    else setError(result.error.message)
  }

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

      <Card>
        <CardHeader>
          <CardTitle className="title-with-icon">
            <RefreshCw aria-hidden="true" /> Actualizaciones
          </CardTitle>
          <CardDescription>
            Versión instalada: <span className="tabular">{version}</span>. Las actualizaciones
            conservan tus datos locales.
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
            La base de datos pertenece al usuario y las actualizaciones no la reemplazan. Guarda una
            copia en una ubicación elegida mediante el diálogo seguro del sistema.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Button variant="outline" onClick={() => void createBackup()}>
            <DatabaseBackup data-icon="inline-start" />
            Crear copia de seguridad
          </Button>
        </CardFooter>
      </Card>
    </>
  )
}
