import { useEffect } from 'react'
import { Tags, UserRound, UsersRound } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { formatCurrency } from '@shared/format'
import { EXPIRING_SOON_DAYS } from '@shared/monthly'
import { Badge } from '@/components/ui/badge'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PageHeading } from '@/components/page-heading'
import { CustomersCard } from '@/features/monthly/customers-card'
import { MonthlyPlansCard } from '@/features/monthly/monthly-plans-card'
import { SubscriptionsCard } from '@/features/monthly/subscriptions-card'
import { useMonthlyStore } from '@/store/monthly-store'

const MONTHLY_TABS = [
  { value: 'mensualidades', label: 'Mensualidades', icon: UsersRound },
  { value: 'clientes', label: 'Clientes', icon: UserRound },
  { value: 'planes', label: 'Planes', icon: Tags },
] as const

type MonthlyTab = (typeof MONTHLY_TABS)[number]['value']

function resolveTab(value: string | null): MonthlyTab {
  return MONTHLY_TABS.some((tab) => tab.value === value) ? (value as MonthlyTab) : 'mensualidades'
}

export function MonthlyPage(): React.JSX.Element {
  const summary = useMonthlyStore((store) => store.summary)
  const message = useMonthlyStore((store) => store.message)
  const initialize = useMonthlyStore((store) => store.initialize)

  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = resolveTab(searchParams.get('tab'))

  useEffect(() => {
    void initialize()
  }, [initialize])

  const selectTab = (value: string): void => {
    setSearchParams(value === 'mensualidades' ? {} : { tab: value }, { replace: true })
  }

  return (
    <div className="page-stack">
      <PageHeading
        title="Mensualidades"
        description="Clientes con un periodo pagado por adelantado que entran y salen sin cobro por horas."
        action={<Badge variant="secondary">{summary.activeCount} vigentes</Badge>}
      />

      <section aria-labelledby="monthly-summary-title">
        <h2 id="monthly-summary-title" className="sr-only">
          Resumen de mensualidades
        </h2>
        <div className="summary-grid">
          <Card className="active-card">
            <CardHeader>
              <CardDescription>Mensualidades vigentes</CardDescription>
              <CardTitle className="metric-value">{summary.activeCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Por vencer en {EXPIRING_SOON_DAYS} días</CardDescription>
              <CardTitle className="metric-value">{summary.expiringSoonCount}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Saldo por cobrar</CardDescription>
              <CardTitle className="metric-value tabular">
                {formatCurrency(summary.pendingCollectionCop)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader>
              <CardDescription>Cobrado este mes</CardDescription>
              <CardTitle className="metric-value tabular">
                {formatCurrency(summary.collectedThisMonthCop)}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      </section>

      <div className="stable-status" role="status" aria-live="polite">
        {message}
      </div>

      <Tabs value={activeTab} onValueChange={selectTab}>
        <TabsList aria-label="Secciones de mensualidades">
          {MONTHLY_TABS.map(({ value, label, icon: Icon }) => (
            <TabsTrigger key={value} value={value}>
              <Icon aria-hidden="true" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="mensualidades">
          <SubscriptionsCard />
        </TabsContent>
        <TabsContent value="clientes">
          <CustomersCard />
        </TabsContent>
        <TabsContent value="planes">
          <MonthlyPlansCard />
        </TabsContent>
      </Tabs>
    </div>
  )
}
