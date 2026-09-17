import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  Package, 
  ShoppingCart, 
  BarChart3, 
  Plus, 
  BookUser, 
  Settings, 
  FileText,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Users,
  FlaskConical,
  Boxes
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";
import { MobileNav } from "./MobileNav"; 

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: BarChart3 },
  { href: "/billing", label: "POS Register", icon: ShoppingCart },
  { href: "/mixmasala", label: "Mix Masala", icon: FlaskConical },
  { href: "/inventory/add", label: "Add Stock", icon: Plus },
  { href: "/manage", label: "Master Topology", icon: Boxes },
  { href: "/udhaar", label: "Advance / Due", icon: BookUser }, 
  { href: "/sales", label: "Revenue", icon: FileText },   
  { href: "/crm", label: "Discovery", icon: Users }, 
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/settings", label: "Master Config", icon: Settings }, 
];

export function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);

  // 1. Fetch user role from Supabase with strict TS assertions
  useEffect(() => {
    const getUserRole = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        
        // Explicitly cast to bypass 'never' and 'possibly null' errors
        const { data: profileData } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", session.user.id)
          .single();

        const profile = profileData as { role: string | null } | null;

        if (profile?.role) {
          setUserRole(profile.role.toLowerCase());
        }
      }
    };
    getUserRole();
  }, []);

  // 2. Filter navigation links based on role
  const filteredNavItems = navItems.filter((item) => {
    if (userRole === "sales") {
      return item.href === "/" || 
             item.href === "/dashboard" || 
             item.href === "/billing" || 
             item.href === "/mixmasala" || 
             item.href === "/settings";
    }
    return true; // Admins and Managers see everything
  });

  const isRootPage = location.pathname === "/" || location.pathname === "/dashboard";

  return (
    <div className="min-h-screen bg-[#fcfcfd]">
      
      {/* --- BIILLO OS DESKTOP SIDEBAR (DARK THEME) --- */}
      <aside 
        className={cn(
          "hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:flex-col transition-all duration-300 ease-in-out bg-[#0a0a0a] border-r border-white/5",
          isCollapsed ? "lg:w-20" : "lg:w-[260px]"
        )}
      >
        <div className="flex grow flex-col gap-y-6 overflow-y-auto px-4 pb-4 custom-scrollbar">
          
          {/* Header / Logo */}
          <div className={cn(
            "flex h-20 shrink-0 items-center transition-all duration-300",
            isCollapsed ? "justify-center" : "gap-3 px-2 pt-2"
          )}>
            <div className="bg-white p-1.5 rounded-xl border border-white/10 flex items-center justify-center shrink-0">
              <img src="/logo.png" alt="Logo" className="h-6 w-6 object-contain" />
            </div>
            {!isCollapsed && (
              <span className="text-xl font-semibold text-white tracking-tight whitespace-nowrap overflow-hidden">
                Biillo <span className="text-white/60 font-medium">OS</span>
              </span>
            )}
          </div>

          {/* Navigation Links */}
          <nav className="flex flex-1 flex-col">
            
            {!isCollapsed && (
              <div className="px-3 mb-2">
                <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Main Menu</span>
              </div>
            )}

            <ul className="flex flex-1 flex-col gap-y-1">
              {filteredNavItems.map((item) => {
                const isActive = location.pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      to={item.href}
                      title={isCollapsed ? item.label : undefined}
                      className={cn(
                        "group flex items-center rounded-xl transition-all duration-200 font-medium",
                        isCollapsed ? "justify-center p-3 mx-1" : "gap-x-3.5 px-3 py-3",
                        isActive
                          ? "bg-white/10 text-white shadow-sm"
                          : "text-zinc-400 hover:bg-white/5 hover:text-zinc-200"
                      )}
                    >
                      <item.icon className={cn(
                        "shrink-0 transition-all duration-200", 
                        isCollapsed ? "h-5 w-5 group-hover:scale-110" : "h-[18px] w-[18px]",
                        isActive ? "text-blue-500" : "text-zinc-500 group-hover:text-zinc-300"
                      )} />
                      
                      {!isCollapsed && (
                        <span className="text-[13px] font-semibold whitespace-nowrap tracking-wide">
                          {item.label}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* Collapse Toggle Button anchored to bottom */}
            <div className="mt-auto pt-4 border-t border-white/5">
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                className={cn(
                  "flex h-10 w-full items-center rounded-xl text-zinc-500 hover:bg-white/5 hover:text-zinc-300 transition-colors",
                  isCollapsed ? "justify-center" : "justify-end px-4"
                )}
              >
                {isCollapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
              </button>
            </div>
          </nav>
        </div>
      </aside>

      {/* --- MAIN CONTENT --- */}
      <main 
        className={cn(
          "pb-24 lg:pb-0 transition-all duration-300 ease-in-out min-h-screen flex flex-col",
          isCollapsed ? "lg:pl-20" : "lg:pl-[260px]"
        )}
      >
        {/* NATIVE ANDROID APP STYLE HEADER (DARK THEME TO MATCH) */}
        <div className="lg:hidden flex items-center h-14 px-4 bg-[#0a0a0a] sticky top-0 z-40 shadow-sm border-b border-white/5">
           {!isRootPage && (
             <button 
               onClick={() => navigate(-1)} 
               className="mr-2 p-2 -ml-2 rounded-full active:bg-white/10 transition-colors text-zinc-400 hover:text-white outline-none tap-highlight-transparent"
               aria-label="Go back"
             >
               <ArrowLeft className="h-5 w-5" />
             </button>
           )}
           <div className="bg-white p-1 rounded-lg flex items-center justify-center shrink-0 mr-3 ml-1">
             <img src="/logo.png" alt="Logo" className="h-4 w-4 object-contain" />
           </div>
           <span className="font-semibold text-base tracking-tight text-white">
             Biillo <span className="text-white/60 font-medium">OS</span>
           </span>
        </div>

        {/* Workspace Area */}
        <div className="flex-1 w-full flex flex-col relative z-0">
          {children}
        </div>
      </main>

      {/* --- MOBILE BOTTOM NAV --- */}
      <MobileNav userRole={userRole} />

    </div>
  );
}