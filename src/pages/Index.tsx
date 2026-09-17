import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Link } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase"; 
import { 
  PlusCircle, 
  ShoppingCart, 
  BarChart3, 
  Boxes, 
  BookUser, 
  Settings, 
  TrendingUp,
  ShieldAlert,
  Users,
  FlaskConical,
  Sparkles,
  Megaphone,
  Search,
  X
} from "lucide-react";

const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

const Index = () => {
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>("sales");
  const [userName, setUserName] = useState<string>("System");
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState("Good day");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          if (session.user.email === SUPER_ADMIN_EMAIL) {
            setIsSuperAdmin(true);
          }

          const { data } = await supabase
            .from("profiles")
            .select("role, full_name")
            .eq("id", session.user.id)
            .single();

          const profile = data as { role: string | null; full_name: string | null } | null;

          if (profile) {
            setUserRole(profile.role?.toLowerCase() || "sales");
            setUserName(profile.full_name || "System");
          }
        }
      } catch (error) {
        console.error("Error fetching user profile:", error);
      } finally {
        setIsLoading(false);
      }
    };
    
    initializeUser();

    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  const baseMenuOptions = [
    { 
      href: "/billing", 
      label: "POS Register", 
      icon: ShoppingCart, 
      description: "Start billing session",
      allowedRoles: ["admin", "manager", "sales"],
      iconBg: "bg-[#6366f1]" 
    },
    { 
      href: "/mix-masala", 
      label: "Mix Masala", 
      icon: FlaskConical, 
      description: "Varshbharache & blends",
      allowedRoles: ["admin", "manager", "sales"],
      iconBg: "bg-[#d946ef]" 
    },
    { 
      href: "/inventory/add", 
      label: "Add Stock", 
      icon: PlusCircle, 
      description: "Inward new shipments",
      allowedRoles: ["admin", "manager"],
      iconBg: "bg-[#3b82f6]" 
    },
    { 
      href: "/udhaar", 
      label: "Advance / Due", 
      icon: BookUser, 
      description: "Pending ledgers",
      allowedRoles: ["admin", "manager"],
      iconBg: "bg-[#14b8a6]" 
    },
    { 
      href: "/manage", 
      label: "Manage Stock", 
      icon: Boxes, 
      description: "Global stock logic",
      allowedRoles: ["admin", "manager"],
      iconBg: "bg-[#27272a]" 
    },
    { 
      href: "/sales", 
      label: "Revenue", 
      icon: TrendingUp, 
      description: "Sales cashbook",
      allowedRoles: ["admin", "manager"],
      iconBg: "bg-[#10b981]" 
    },
    { 
      href: "/crm", 
      label: "Discovery", 
      icon: Users, 
      description: "Scan & quote",
      allowedRoles: ["admin", "manager"],
      iconBg: "bg-[#f97316]" 
    },
    { 
      href: "/analytics", 
      label: "Analytics", 
      icon: BarChart3, 
      description: "Store reporting",
      allowedRoles: ["admin", "manager"],
      iconBg: "bg-[#a855f7]" 
    },
    { 
      href: "/settings", 
      label: "Master Config", 
      icon: Settings, 
      description: "System settings",
      allowedRoles: ["admin", "manager", "sales"],
      iconBg: "bg-[#57534e]" 
    },
  ];

  let visibleMenu = baseMenuOptions.filter(option => option.allowedRoles.includes(userRole));

  if (searchQuery) {
    visibleMenu = visibleMenu.filter(option => 
      option.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
      option.description.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }

  if (isSuperAdmin) {
    visibleMenu.push({
      href: "/super-admin-secret",
      label: "System Override",
      icon: ShieldAlert,
      description: "Root DB access",
      allowedRoles: ["admin"],
      iconBg: "bg-[#ef4444]" 
    });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-[#fcfcfd]">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-200 border-t-zinc-900" />
            <p className="text-zinc-500 font-bold text-xs uppercase tracking-wider">Initializing OS...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#fcfcfd] font-sans pb-32">
        {/* TIGHTENED TOP PADDING: pt-3 instead of pt-6 */}
        <div className="px-4 sm:px-6 max-w-5xl mx-auto pt-3 sm:pt-5 animate-in fade-in duration-300">
          
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Headquarters</span>
          </div>

          {/* TIGHTENED MARGIN: mb-3 instead of mb-6 */}
          <div className="flex flex-col mb-3">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent mr-1.5">
                {greeting},
              </span>
              <span className="text-zinc-900">{userName.split(' ')[0]}</span>
            </h1>
          </div>

          {/* COMPACT ALERTS: mb-4 instead of mb-6 */}
          {!isSupabaseConfigured ? (
            <Alert variant="destructive" className="mb-4 py-2 px-3 border-rose-200 bg-rose-50 text-rose-900 rounded-xl shadow-sm flex items-center">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              <div className="ml-2.5 text-xs font-medium">
                <strong className="font-bold">Alert:</strong> DB Disconnected. Check Anon Key.
              </div>
            </Alert>
          ) : (
            <div className="mb-4 py-2 px-3 border border-zinc-200/80 bg-white rounded-xl shadow-sm flex items-center justify-between text-xs font-medium text-zinc-600">
              <div className="flex items-center">
                <Megaphone className="h-3.5 w-3.5 text-violet-600 mr-2 shrink-0" />
                <span className="truncate">Systems normal. Workflows active.</span>
              </div>
              <button className="text-zinc-400 hover:text-zinc-600 shrink-0 ml-2"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          {/* COMPACT SEARCH: mb-4 instead of mb-8, h-10 instead of h-12 */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-500" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search modules..." 
              className="h-10 pl-9 pr-4 rounded-xl border-zinc-200 shadow-sm bg-white text-sm font-semibold placeholder:text-zinc-400 focus-visible:ring-1 focus-visible:ring-blue-500 transition-all"
            />
          </div>

          {/* TIGHTENED MARGIN: mb-2.5 instead of mb-3 */}
          <div className="mb-2.5">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Your Workspace</h3>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visibleMenu.map((option, index) => (
              <Link key={index} to={option.href} className="group outline-none block">
                <Card className="h-full flex flex-col items-start justify-between p-3 sm:p-4 transition-all duration-200 rounded-[16px] border-zinc-200/80 bg-white shadow-sm hover:shadow-md hover:border-zinc-300 active:scale-95 cursor-pointer relative overflow-hidden">
                  
                  <div className="absolute -top-6 -right-6 w-20 h-20 bg-zinc-100 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />

                  <div className={`h-9 w-9 rounded-[10px] flex items-center justify-center mb-2.5 shadow-sm ${option.iconBg} text-white shrink-0 relative z-10`}>
                    <option.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  
                  <div className="w-full relative z-10">
                    <h3 className="font-bold text-[12px] sm:text-[13px] tracking-tight text-zinc-900 leading-tight mb-0.5 truncate">
                      {option.label}
                    </h3>
                    <p className="text-[9px] sm:text-[10px] font-semibold text-zinc-500 line-clamp-2 leading-snug">
                      {option.description}
                    </p>
                  </div>
                  
                </Card>
              </Link>
            ))}
            
            {visibleMenu.length === 0 && (
               <div className="col-span-full py-6 text-center text-xs text-zinc-500 font-semibold">
                 No apps found matching "{searchQuery}"
               </div>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
};

export default Index;