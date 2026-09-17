import { Link, useLocation } from "react-router-dom";
import { 
  LayoutDashboard, 
  ShoppingCart, 
  BookUser, 
  Package, 
  Menu 
} from "lucide-react";

export function MobileNav({ userRole }: { userRole?: string | null }) {
  const location = useLocation();
  const isSales = userRole === "sales";

  // Hide nav specifically on billing page to give cashiers max screen space
  if (location.pathname === "/billing") {
    return null;
  }

  // Helper to check if a tab is active
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-[0_-1px_10px_rgba(0,0,0,0.05)] pb-safe md:hidden">
      <div className="flex justify-around items-end h-16 w-full max-w-md mx-auto relative">
        
        {/* 1. Dashboard (Allowed for everyone) */}
        <NavItem 
          href="/dashboard" 
          icon={LayoutDashboard} 
          label="Home" 
          active={isActive("/") || isActive("/dashboard")} 
        />

        {/* 2. Udhaar (HIDDEN FOR SALES ROLE) */}
        {!isSales && (
          <NavItem 
            href="/udhaar" 
            icon={BookUser} 
            label="Udhaar" 
            active={isActive("/udhaar")} 
          />
        )}

        {/* 3. CENTRAL BILLING BUTTON (Floating - Allowed for everyone) */}
        <div className="relative -top-5">
           <Link to="/billing">
             <div className={`
                flex items-center justify-center h-14 w-14 rounded-full shadow-lg border-4 border-background transition-transform active:scale-95
                ${isActive("/billing") ? 'bg-primary text-primary-foreground' : 'bg-primary text-white'}
             `}>
                <ShoppingCart className="h-6 w-6" />
             </div>
           </Link>
           <span className="text-[10px] font-medium text-center block w-full mt-1 text-primary">Bill</span>
        </div>

        {/* 4. Inventory (HIDDEN FOR SALES ROLE) */}
        {!isSales && (
          <NavItem 
            href="/inventory/add" 
            icon={Package} 
            label="Stock" 
            active={isActive("/inventory/add")} 
          />
        )}

        {/* 5. Menu / Settings (Allowed for everyone) */}
        <NavItem 
          href="/settings" 
          icon={Menu} 
          label="Menu" 
          active={isActive("/settings")} 
        />

      </div>
    </div>
  );
}

// Small helper component for standard tabs
function NavItem({ href, icon: Icon, label, active }: any) {
  return (
    <Link to={href} className="flex-1 flex flex-col items-center justify-center h-full pb-2">
      <div className={`p-1 rounded-full transition-colors ${active ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
        <Icon className={`h-5 w-5 ${active ? 'fill-current' : ''}`} />
      </div>
      <span className={`text-[10px] font-medium mt-0.5 ${active ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
        {label}
      </span>
    </Link>
  );
}