type PageHeadingProps = {
  title: string
  description: string
  action?: React.ReactNode
}

export function PageHeading({ title, description, action }: PageHeadingProps): React.JSX.Element {
  return (
    <header className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action ? <div className="page-heading-action">{action}</div> : null}
    </header>
  )
}
