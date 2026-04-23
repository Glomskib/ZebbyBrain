import { ReactNode } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { Gem, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export function useIsPlus() {
  const { user } = useAuth() as { user?: { plan?: string; planStatus?: string } };
  return (user?.plan === "plus") && (user?.planStatus === "active" || user?.planStatus === "trialing");
}

export function PlusOnly({
  children,
  featureName,
  description,
}: {
  children: ReactNode;
  featureName: string;
  description?: string;
}) {
  const isPlus = useIsPlus();
  if (isPlus) return <>{children}</>;
  return (
    <Card className="rounded-2xl overflow-hidden">
      <CardContent className="p-6 flex flex-col items-center text-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200 flex items-center justify-center">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Gem className="w-4 h-4 text-amber-600" /> {featureName} is part of Zebby+
        </h3>
        <p className="text-sm text-muted-foreground max-w-md">
          {description ||
            "This feature is part of our premium support bundle. Zebby+ keeps the lights on and unlocks deeper insights and calming tools."}
        </p>
        <Link href="/zebby-plus">
          <Button className="rounded-full mt-1">See what's in Zebby+</Button>
        </Link>
      </CardContent>
    </Card>
  );
}

export function PlusBadge() {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5 bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
      <Gem className="w-3 h-3" /> Zebby+
    </span>
  );
}
