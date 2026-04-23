import { Link, useLocation } from "wouter";
import { Home, Activity, BarChart3, MessageCircle, Gem } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Global bottom nav for mobile. Sits fixed above the home-indicator and
 * only renders on <md screens. Authenticated App.tsx mounts this once.
 */
export function MobileBottomNav() {
  const [location] = useLocation();

  const items = [
    { to: "/", label: "Home", icon: <Home className="w-5 h-5" /> },
    { to: "/tracker", label: "Track", icon: <Activity className="w-5 h-5" /> },
    { to: "/history", label: "History", icon: <BarChart3 className="w-5 h-5" /> },
    { to: "/ask-zebby", label: "Zebby", icon: <MessageCircle className="w-5 h-5" /> },
    { to: "/zebby-plus", label: "Zebby+", icon: <Gem className="w-5 h-5" /> },
  ];

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur"
      data-testid="mobile-bottom-nav"
    >
      <ul className="grid grid-cols-5 pb-[env(safe-area-inset-bottom)]">
        {items.map((item) => {
          const active = location === item.to;
          return (
            <li key={item.to}>
              <Link
                href={item.to}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
                data-testid={`mobile-nav-${item.to.replace(/\W/g, "-")}`}
              >
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
