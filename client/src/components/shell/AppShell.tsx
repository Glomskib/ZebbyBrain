import { ReactNode } from "react";
import Navigation from "@/components/navigation";

/**
 * Uniform page shell: the shared top Navigation, a soft page background, and
 * a centered content column with generous mobile padding so the global
 * MobileBottomNav doesn't overlap. Keeps every authenticated page visually
 * aligned with the older dashboard + tracker pages.
 */
export function AppShell({
  children,
  title,
  subtitle,
  action,
  width = "narrow",
}: {
  children: ReactNode;
  title?: string;
  subtitle?: string;
  action?: ReactNode;
  width?: "narrow" | "wide";
}) {
  const max = width === "wide" ? "max-w-6xl" : "max-w-4xl";
  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      <main className={`${max} mx-auto px-4 sm:px-6 lg:px-8 py-6 md:py-8 pb-24 md:pb-12`}>
        {(title || action) && (
          <header className="mb-5 md:mb-7 flex items-start justify-between gap-4">
            <div className="min-w-0">
              {title && (
                <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">
                  {title}
                </h1>
              )}
              {subtitle && (
                <p className="text-sm md:text-base text-muted-foreground mt-1">
                  {subtitle}
                </p>
              )}
            </div>
            {action && <div className="shrink-0">{action}</div>}
          </header>
        )}
        {children}
      </main>
    </div>
  );
}
