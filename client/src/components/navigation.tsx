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

export default function Navigation() {
  const [location] = useLocation();
  const { user } = useAuth();

  const handleLogout = () => {
    window.location.href = "/api/logout";
  };

  const navItems = [
    { path: "/", label: "Dashboard", testId: "nav-dashboard" },
    { path: "/tracker", label: "Tracker", testId: "nav-tracker" },
    { path: "/marketplace", label: "Marketplace", testId: "nav-marketplace" },
    { path: "/settings", label: "Settings", testId: "nav-settings" },
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
    <nav className="bg-card border-b border-border sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3" data-testid="logo-link">
            <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center">
              <span className="text-xl">🦓</span>
            </div>
            <h1 className="text-xl font-bold text-foreground">Zebby</h1>
          </Link>
          
          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-6">
            {navItems.map(({ path, label, testId }) => (
              <Link key={path} href={path}>
                <button 
                  className={`transition-colors ${
                    location === path 
                      ? "text-primary font-medium" 
                      : "text-foreground hover:text-primary"
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
