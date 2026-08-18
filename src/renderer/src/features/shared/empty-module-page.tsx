import type { LucideIcon } from 'lucide-react'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { PageHeading } from '@/components/page-heading'

type EmptyModulePageProps = {
  title: string
  description: string
  emptyTitle: string
  emptyDescription: string
  icon: LucideIcon
}

export function EmptyModulePage({
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon: Icon,
}: EmptyModulePageProps): React.JSX.Element {
  return (
    <div className="page-stack">
      <PageHeading title={title} description={description} />
      <Empty className="module-empty border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>{emptyTitle}</EmptyTitle>
          <EmptyDescription>{emptyDescription}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
