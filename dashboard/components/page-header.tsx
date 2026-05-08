interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-10">
      {eyebrow && (
        <p className="text-xs uppercase tracking-wider text-zinc-500">{eyebrow}</p>
      )}
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">{title}</h1>
      {description && (
        <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      )}
    </header>
  );
}
