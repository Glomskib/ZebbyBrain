import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuSeparator 
} from "@/components/ui/dropdown-menu";
import { Bell, Menu } from "lucide-react";
import { ShoppingCart } from "@/components/ShoppingCart";
import ZebbyAvatar from "@/components/zebby-avatar";
import { L } from "@/i18n/labels";

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    } catch {}
    window.location.href = "/login";
  };

  const navItems = [
    { path: "/", label: L.dashboard, testId: "nav-dashboard" },
    { path: "/tracker", label: L.tracker, testId: "nav-tracker" },
    { path: "/history", label: "History", testId: "nav-history" },
    { path: "/ask-zebby", label: L.askZebby, testId: "nav-ask-zebby" },
    { path: "/calm-corner", label: "Calm Corner", testId: "nav-calm-corner" },
    { path: "/pastures", label: L.pastures, testId: "nav-pastures" },
    { path: "/spoonies", label: L.spoonies, testId: "nav-spoonies" },
    { path: "/zebbys-pouch", label: L.pouch, testId: "nav-zebbys-pouch" },
    { path: "/zebby-plus", label: "Zebby+", testId: "nav-zebby-plus" },
    { path: "/settings", label: L.settings, testId: "nav-settings" },
  ];

  const getInitials = () => {
    const userTyped = user as any;
    if (userTyped?.firstName && userTyped?.lastName) {
      return `${userTyped.firstName[0]}${userTyped.lastName[0]}`;
    }
    if (userTyped?.firstName) {
      return userTyped.firstName[0];
    }
    if (userTyped?.email) {
      return userTyped.email[0].toUpperCase();
    }
    return "U";
  };

  return (
    <nav className="nav-frosted sticky top-0 z-40 border-b border-border/50 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2" data-testid="logo-link">
            <ZebbyAvatar size="small" showBadge />
            <h1 className="text-xl font-bold text-foreground">Zebby's World</h1>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-2">
            {navItems.map(({ path, label, testId }) => (
              <Link key={path} href={path}>
                <button 
                  className={`px-4 py-2 font-medium transition-all ${
                    location === path 
                      ? "bg-[#1e293b] text-white rounded-xl" 
                      : "text-foreground/70 hover:text-foreground hover:bg-muted rounded-xl"
                  }`}
                  data-testid={testId}
                >
                  {label}
                </button>
              </Link>
            ))}
          </div>
          
          {/* Right side actions */}
          <div className="flex items-center gap-3">
            {/* Shopping Cart */}
            <ShoppingCart />
            
            {/* Notifications */}
            <Button 
              variant="ghost" 
              size="icon"
              className="text-muted-foreground hover:text-foreground"
              data-testid="button-notifications"
            >
              <Bell className="w-5 h-5" />
            </Button>
            
            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="relative"
                  data-testid="button-user-menu"
                >
                  <Avatar className="w-8 h-8">
                    <AvatarImage 
                      src={(user as any)?.profileImageUrl || undefined} 
                      alt="Profile"
                    />
                    <AvatarFallback className="bg-secondary text-secondary-foreground text-sm font-medium">
                      {getInitials()}
                    </AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium" data-testid="text-user-name">
                    {(user as any)?.firstName && (user as any)?.lastName 
                      ? `${(user as any).firstName} ${(user as any).lastName}`
                      : (user as any)?.email || "User"
                    }
                  </p>
                  {(user as any)?.email && (
                    <p className="text-xs text-muted-foreground" data-testid="text-user-email">
                      {(user as any).email}
                    </p>
                  )}
                </div>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem data-testid="menu-profile">
                  Profile Settings
                </DropdownMenuItem>
                
                <DropdownMenuItem data-testid="menu-preferences">
                  Preferences
                </DropdownMenuItem>
                
                <DropdownMenuItem data-testid="menu-help">
                  Help & Support
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={handleLogout}
                  className="text-destructive focus:text-destructive"
                  data-testid="menu-logout"
                >
                  Log Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mobile Menu */}
            <div className="md:hidden">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    data-testid="button-mobile-menu"
                  >
                    <Menu className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                
                <DropdownMenuContent align="end" className="w-48">
                  {navItems.map(({ path, label, testId }) => (
                    <DropdownMenuItem key={path} asChild>
                      <Link href={path}>
                        <button 
                          className={`w-full text-left ${
                            location === path ? "text-primary font-medium" : ""
                          }`}
                          data-testid={`${testId}-mobile`}
                        >
                          {label}
                        </button>
                      </Link>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
