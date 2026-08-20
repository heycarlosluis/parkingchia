import { Building2, HardDrive, Printer, ShieldCheck, Tags, UserRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { PageHeading } from '@/components/page-heading'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmployeesSettings } from '@/features/settings/employees-settings'
import { ParkingProfileSettings } from '@/features/settings/parking-profile-settings'
import { PrinterSettings } from '@/features/settings/printer-settings'
import { SecuritySettings } from '@/features/settings/security-settings'
import { SystemSettings } from '@/features/settings/system-settings'
import { TariffsSettings } from '@/features/tariffs/tariffs-settings'

const SETTINGS_TABS = [
  { value: 'general', label: 'General', icon: Building2 },
  { value: 'tarifas', label: 'Tarifas', icon: Tags },
  { value: 'empleados', label: 'Empleados', icon: UserRound },
  { value: 'impresion', label: 'Impresión', icon: Printer },
  { value: 'seguridad', label: 'Seguridad', icon: ShieldCheck },
  { value: 'sistema', label: 'Sistema', icon: HardDrive },
] as const

type SettingsTab = (typeof SETTINGS_TABS)[number]['value']

function resolveTab(value: string | null): SettingsTab {
  return SETTINGS_TABS.some((tab) => tab.value === value) ? (value as SettingsTab) : 'general'
}

export function SettingsPage(): React.JSX.Element {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = resolveTab(searchParams.get('tab'))

  const selectTab = (value: string): void => {
    setSearchParams(value === 'general' ? {} : { tab: value }, { replace: true })
  }

  return (
    <div className="page-stack settings-page">
      <PageHeading
        title="Configuración"
        description="Administra los datos del parqueadero, las tarifas, la impresión, el acceso local y las copias de seguridad."
      />

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList aria-label="Secciones de configuración">
          {SETTINGS_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden="true" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="general">
          <ParkingProfileSettings />
        </TabsContent>
        <TabsContent value="tarifas">
          <TariffsSettings />
        </TabsContent>
        <TabsContent value="empleados">
          <EmployeesSettings />
        </TabsContent>
        <TabsContent value="impresion">
          <PrinterSettings />
        </TabsContent>
        <TabsContent value="seguridad">
          <SecuritySettings />
        </TabsContent>
        <TabsContent value="sistema">
          <SystemSettings />
        </TabsContent>
      </Tabs>
    </div>
  )
}
