interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export function PageHeader({ eyebrow, title, description }: PageHeaderProps) {
  return (
    <header className="mb-10">
      {eyebrow && (
        <p className="text-xs font-medium uppercase tracking-wider text-amber-600 dark:text-amber-400">
          {eyebrow}
        </p>
      )}
      <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
        <span className="bg-gradient-to-r from-zinc-900 to-zinc-700 bg-clip-text text-transparent dark:from-zinc-50 dark:to-zinc-300">
          {title}
        </span>
      </h1>
      {description && (
        <p className="mt-4 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      )}
    </header>
  );
}
