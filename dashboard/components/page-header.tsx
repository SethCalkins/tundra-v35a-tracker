interface PageHeaderProps {
  eyebrow?: string;
  title: string;
  description?: string;
  italic?: boolean;
}

export function PageHeader({ eyebrow, title, description, italic = true }: PageHeaderProps) {
  return (
    <header className="mb-12 border-b border-zinc-200 pb-8 dark:border-zinc-800">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#EB0A1E]">
          {eyebrow}
        </p>
      )}
      <h1
        className={`mt-3 text-4xl font-bold tracking-tight sm:text-5xl ${
          italic ? "italic" : ""
        }`}
      >
        {title}
      </h1>
      {description && (
        <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      )}
    </header>
  );
}
