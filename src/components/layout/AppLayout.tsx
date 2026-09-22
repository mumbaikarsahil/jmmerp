import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { 
  LayoutDashboard, ShoppingCart, Package, Users, Settings, LogOut, 
  Menu, X, TrendingUp, FlaskConical, Bell, Globe, ShieldAlert, ShieldCheck,
  PanelLeftClose, PanelLeft, Printer
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { language, setLanguage, t } = useLanguage();
  const { toast } = useToast();

  const [userRole, setUserRole] = useState("sales");
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState("Loading...");

  // 2FA Owner Approval State
  const [activeLoginRequest, setActiveLoginRequest] = useState<any>(null);
  const [verificationOptions, setVerificationOptions] = useState<number[]>([]);

  useEffect(() => {
    const fetchUserAndTenant = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await (supabase as any).from('profiles').select('role, tenant_id').eq('id', session.user.id).single();
        if (profile) {
          setUserRole(profile.role || 'sales');
          setTenantId(profile.tenant_id);
          
          if (profile.tenant_id) {
            const { data: tenant } = await (supabase as any).from('tenants').select('*').eq('id', profile.tenant_id).single();
            setTenantName(tenant?.tenant_name || tenant?.name || "JMM Store");
          }
        }
      }
    };
    fetchUserAndTenant();
  }, []);

  // Listen for Employee Login Attempts (Admin Only)
  useEffect(() => {
    if (userRole !== 'admin' || !tenantId) return;

    const channel = supabase.channel('owner-approval-listener')
      .on('postgres_changes', { 
        event: 'INSERT', 
        schema: 'public', 
        table: 'login_requests',
        filter: `tenant_id=eq.${tenantId}`
      }, (payload) => {
        if (payload.new.status === 'PENDING') {
          setActiveLoginRequest(payload.new);
          
          const options = [payload.new.auth_code];
          while (options.length < 3) {
            const rand = Math.floor(10 + Math.random() * 90);
            if (!options.includes(rand)) options.push(rand);
          }
          setVerificationOptions(options.sort(() => Math.random() - 0.5));
          
          toast({ title: "New Login Attempt", description: `${payload.new.email} is requesting access.` });
        }
      }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userRole, tenantId, toast]);

  const handleApprovalDecision = async (selectedCode: number) => {
    if (!activeLoginRequest) return;
    
    const isApproved = selectedCode === activeLoginRequest.auth_code;
    
    await (supabase as any).from('login_requests').update({ 
      status: isApproved ? 'APPROVED' : 'DENIED' 
    }).eq('id', activeLoginRequest.id);

    setActiveLoginRequest(null);

    if (isApproved) {
      toast({ title: "Device Approved", description: "Employee session unlocked." });
    } else {
      toast({ title: "Device Denied", description: "Incorrect code. Employee disconnected.", variant: "destructive" });
    }
  };

  const allNavigation = [
    { name: t('dashboard'), href: "/dashboard", icon: LayoutDashboard, roles: ['admin', 'manager'] },
    { name: t('billing'), href: "/billing", icon: ShoppingCart, roles: ['admin', 'manager', 'sales'] },
    { name: t('inventory'), href: "/manage", icon: Package, roles: ['admin', 'manager'] },
    { name: 'Production', href: "/production", icon: FlaskConical, roles: ['admin', 'manager'] },
    { name: t('sales'), href: "/sales", icon: TrendingUp, roles: ['admin', 'manager'] },
    { name: 'Udhaar Book', href: "/udhaar", icon: Users, roles: ['admin', 'manager', 'sales'] },
    { name: t('settings'), href: "/settings", icon: Settings, roles: ['admin', 'manager'] },
    { name: 'Print Settings', href: "/receipt-settings", icon: Printer, roles: ['admin', 'manager'] },
    { name: 'Staff Access', href: "/manage-users", icon: ShieldCheck, roles: ['admin'] },
  ];

  const navigation = allNavigation.filter(item => item.roles.includes(userRole));

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      
      {/* 2FA OWNER APPROVAL MODAL */}
      <Dialog open={!!activeLoginRequest} onOpenChange={() => {}}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md rounded-3xl p-6 text-center shadow-2xl [&>button]:hidden">
          <DialogHeader>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 border border-amber-200 mb-4">
              <ShieldAlert className="h-8 w-8 text-amber-500" />
            </div>
            <DialogTitle className="text-xl font-bold text-zinc-900">Approve Device</DialogTitle>
            <p className="text-sm font-medium text-zinc-500 mt-2">
              <strong className="text-zinc-900">{activeLoginRequest?.email}</strong> is attempting to log in. Select the number shown on their screen to authorize.
            </p>
          </DialogHeader>

          <div className="grid grid-cols-3 gap-3 mt-6">
            {verificationOptions.map(code => (
              <button 
                key={code}
                onClick={() => handleApprovalDecision(code)}
                className="h-16 rounded-2xl bg-zinc-50 border border-zinc-200 text-2xl font-black text-zinc-900 hover:bg-zinc-900 hover:text-white hover:border-zinc-900 transition-all shadow-sm active:scale-95"
              >
                {code}
              </button>
            ))}
          </div>
          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-6">Selecting the wrong number denies access</p>
        </DialogContent>
      </Dialog>

      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-zinc-900/50 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar - Made More Compact (w-60 instead of w-64) */}
      <div 
        className={`fixed inset-y-0 left-0 z-50 bg-[#0a0a0a] text-zinc-300 transform transition-all duration-300 ease-in-out lg:relative lg:translate-x-0 flex flex-col shadow-2xl
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} 
        ${isCollapsed ? "lg:w-20" : "lg:w-60"} w-60`}
      >
        <div className="flex h-16 items-center justify-between px-4 bg-[#0a0a0a] border-b border-zinc-800/60 shrink-0">
          
          <div className={`flex flex-col min-w-0 overflow-hidden transition-all duration-300 ${isCollapsed ? 'opacity-0 w-0 hidden lg:block' : 'opacity-100 w-auto'}`}>
            <span className="text-[15px] font-bold text-zinc-100 tracking-tight truncate">
              {tenantName}
            </span>
            <span className="text-[9px] font-semibold text-zinc-500 truncate uppercase tracking-widest mt-0.5">Powered by Biillo OS</span>
          </div>
          
          {/* Desktop Collapse Toggle */}
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)} 
            className={`hidden lg:flex items-center justify-center p-2 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/50 transition-colors ${isCollapsed ? 'w-full' : ''}`}
          >
            {isCollapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
          </button>

          {/* Mobile Close Button */}
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden p-2 rounded-lg text-zinc-400 hover:text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-5 overflow-y-auto scrollbar-none">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href || (location.pathname === '/' && item.href === '/dashboard');
            return (
              <Link 
                key={item.name} 
                to={item.href} 
                title={isCollapsed ? item.name : undefined}
                className={`flex items-center ${isCollapsed ? 'justify-center px-0' : 'px-3.5'} py-2.5 rounded-xl text-[13px] font-semibold transition-all duration-300 ${
                  isActive 
                    ? "bg-gradient-to-r from-emerald-500/20 via-emerald-500/5 to-transparent border border-emerald-500/30 text-emerald-400 shadow-[0_4px_20px_rgba(16,185,129,0.08)] backdrop-blur-md" 
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40 border border-transparent"
                }`}
              >
                <item.icon className={`shrink-0 ${isCollapsed ? 'h-5 w-5' : 'h-4 w-4'} ${isActive ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "text-zinc-500"}`} />
                {!isCollapsed && <span className="ml-3 truncate">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-zinc-800/60">
          <button 
            onClick={handleLogout} 
            title={isCollapsed ? "Logout" : undefined}
            className={`flex w-full items-center ${isCollapsed ? 'justify-center px-0' : 'px-3.5'} py-2.5 rounded-xl text-[13px] font-semibold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all`}
          >
            <LogOut className={`shrink-0 ${isCollapsed ? 'h-5 w-5' : 'h-4 w-4'}`} /> 
            {!isCollapsed && <span className="ml-3 truncate">Logout</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-zinc-200 shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)] z-10">
          <button onClick={() => setSidebarOpen(true)} className="lg:hidden text-zinc-500 hover:text-zinc-900">
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex items-center gap-4 ml-auto">
            {/* Language Switcher */}
            <div className="flex items-center bg-zinc-50 border border-zinc-200 p-1 rounded-lg shadow-inner">
              <Globe className="h-3.5 w-3.5 text-zinc-400 ml-2 mr-1" />
              {['MR', 'HI', 'EN'].map(lang => (
                <button 
                  key={lang} 
                  onClick={() => setLanguage(lang as any)}
                  className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${language === lang ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200/80' : 'text-zinc-500 hover:text-zinc-700'}`}
                >
                  {lang}
                </button>
              ))}
            </div>

            <Button variant="outline" size="icon" className="rounded-full h-10 w-10 border-zinc-200 shadow-sm">
              <Bell className="h-4 w-4 text-zinc-500" />
            </Button>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto relative">
          {children}
        </div>
      </div>
    </div>
  );
}