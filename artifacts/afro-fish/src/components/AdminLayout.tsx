import { Link, useLocation } from "wouter";
import { useAdminAuth } from "@/hooks/use-auth";
import { LayoutDashboard, Users, History, Settings, LogOut, BarChart2, CloudUpload } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const { adminKey, logout } = useAdminAuth();
  const [location] = useLocation();

  if (!adminKey) {
    // Redirect handled by routes, but just in case
    return null;
  }

  const navItems = [
    { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/admin/players", label: "Players", icon: Users },
    { href: "/admin/transactions", label: "Transactions", icon: History },
    { href: "/admin/analytics", label: "Analytics", icon: BarChart2 },
    { href: "/admin/game-config", label: "Game Config", icon: Settings },
    { href: "/admin/backups", label: "Backups", icon: CloudUpload },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-card border-b md:border-b-0 md:border-r border-border flex flex-col shrink-0">
        <div className="p-6 border-b border-border flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-destructive flex items-center justify-center shadow-[0_0_10px_rgba(255,0,0,0.5)]">
            <span className="font-bold text-white leading-none">A</span>
          </div>
          <span className="font-bold text-lg tracking-tight uppercase">Admin Panel</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href}>
                <div
                  className={`flex items-center gap-3 px-4 py-3 rounded-lg cursor-pointer transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary font-medium"
                      : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                  }`}
                >
                  <item.icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border">
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-destructive hover:bg-destructive/10"
            onClick={logout}
          >
            <LogOut className="w-5 h-5 mr-3" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-black/20 p-6 md:p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
