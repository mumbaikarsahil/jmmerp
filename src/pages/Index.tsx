import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Link, useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase"; 
import { useLanguage } from "@/contexts/LanguageContext";
import { 
  PlusCircle, ShoppingCart, BarChart3, Boxes, BookUser, Settings, 
  TrendingUp, ShieldAlert, ShieldCheck, Users, FlaskConical, 
  Sparkles, Megaphone, Search, X, Nut, Package, Scale, Droplet, Mic, ChevronRight
} from "lucide-react";

const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

const Index = () => {
  const navigate = useNavigate();
  const { t, language } = useLanguage();
  
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [userRole, setUserRole] = useState<string>("sales");
  const [userName, setUserName] = useState<string>("System");
  const [tenantId, setTenantId] = useState<string | null>(null);
  
  const [isLoading, setIsLoading] = useState(true);
  const [greeting, setGreeting] = useState("");
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (session) {
          if (session.user.email === SUPER_ADMIN_EMAIL) {
            setIsSuperAdmin(true);
          }

          const { data } = await (supabase as any)
            .from("profiles")
            .select("role, full_name, tenant_id")
            .eq("id", session.user.id)
            .single();

          if (data) {
            setUserRole(data.role?.toLowerCase() || "sales");
            setUserName(data.full_name || "System");
            setTenantId(data.tenant_id);
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
    if (hour < 12) setGreeting(t('good_morning'));
    else if (hour < 17) setGreeting(t('good_afternoon'));
    else setGreeting(t('good_evening'));
  }, [t]);

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice search is not supported in this browser.");
    
    const recognition = new SpeechRecognition();
    recognition.lang = language === 'MR' ? 'mr-IN' : language === 'HI' ? 'hi-IN' : 'en-IN'; 
    
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => {
      setSearchQuery(e.results[0][0].transcript);
    };
    recognition.start();
  };

  useEffect(() => {
    const searchDB = async () => {
      if (!searchQuery.trim() || !tenantId) {
        setSearchResults([]);
        return;
      }
      setIsSearching(true);
      
      const routes = baseMenuOptions.filter(option => 
        option.allowedRoles.includes(userRole) && 
        (option.label.toLowerCase().includes(searchQuery.toLowerCase()) || 
         option.description.toLowerCase().includes(searchQuery.toLowerCase()))
      ).map(r => ({ name: r.label, path: r.href, icon: r.icon, type: 'route' }));

      const { data: items } = await (supabase as any)
        .from('items')
        .select('id, item_name, category')
        .eq('tenant_id', tenantId)
        .or(`item_name.ilike.%${searchQuery}%,english_name.ilike.%${searchQuery}%`)
        .limit(5);

      setSearchResults([
        ...routes,
        ...(items || []).map((item: any) => ({
          name: item.item_name,
          category: item.category,
          path: `/billing?search=${encodeURIComponent(item.item_name)}`,
          icon: ShoppingCart,
          type: 'product'
        }))
      ]);
      setIsSearching(false);
    };

    const delayDebounceFn = setTimeout(() => searchDB(), 300);
    return () => clearTimeout(delayDebounceFn);
  }, [searchQuery, userRole, tenantId]);

  // Premium Minimalist Quick Tiles (Primary Categories)
  const QUICK_TILES = [
    { label: t('yearly_masala'), icon: FlaskConical, text: "text-emerald-600", bg: "bg-emerald-100", path: "/billing?action=yearly_masala" },
    { label: t('dryfruits'), icon: Nut, text: "text-amber-600", bg: "bg-amber-100", path: `/billing?category=${encodeURIComponent("Dryfruits")}` },
    { label: t('ready_masala'), icon: Package, text: "text-rose-600", bg: "bg-rose-100", path: `/billing?category=${encodeURIComponent("JMM Spices")}` },
    { label: t('seeds'), icon: Scale, text: "text-blue-600", bg: "bg-blue-100", path: `/billing?category=${encodeURIComponent("Seeds")}` },
    { label: t('oils'), icon: Droplet, text: "text-purple-600", bg: "bg-purple-100", path: `/billing?category=${encodeURIComponent("Oils & Ghee")}` },
  ];

  // Space-saving Pills (Secondary Categories)
  const SECONDARY_CATEGORIES = [
    "Pickles & Papad",
    "Tea & Coffee",
    "Salt & Essentials",
    "Essences & Colors",
    "Groceries & Ready Mixes",
    "Savai Masala",
    "Everest Masala",
    "Suhana / Pravin"
  ];

  const baseMenuOptions = [
    { href: "/billing", label: t('billing'), icon: ShoppingCart, description: "Start billing session", allowedRoles: ["admin", "manager", "sales"], iconBg: "bg-[#6366f1]" },
    { href: "/inventory/add", label: "Add Stock", icon: PlusCircle, description: "Inward new shipments", allowedRoles: ["admin", "manager"], iconBg: "bg-[#3b82f6]" },
    { href: "/udhaar", label: "Advance / Due", icon: BookUser, description: "Pending ledgers", allowedRoles: ["admin", "manager"], iconBg: "bg-[#14b8a6]" },
    { href: "/manage", label: t('inventory'), icon: Boxes, description: "Global stock logic", allowedRoles: ["admin", "manager"], iconBg: "bg-[#27272a]" },
    { href: "/sales", label: t('sales'), icon: TrendingUp, description: "Sales cashbook", allowedRoles: ["admin", "manager"], iconBg: "bg-[#10b981]" },
    { href: "/crm", label: "Discovery", icon: Users, description: "Scan & quote", allowedRoles: ["admin", "manager"], iconBg: "bg-[#f97316]" },
    { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Store reporting", allowedRoles: ["admin", "manager"], iconBg: "bg-[#a855f7]" },
    { href: "/settings", label: t('settings'), icon: Settings, description: "System settings", allowedRoles: ["admin", "manager", "sales"], iconBg: "bg-[#57534e]" },
    { href: "/manage-users", label: "Staff Access", icon: ShieldCheck, description: "Manage employee sessions", allowedRoles: ["admin"], iconBg: "bg-[#0ea5e9]" },
  ];

  let visibleMenu = baseMenuOptions.filter(option => option.allowedRoles.includes(userRole));

  if (isSuperAdmin) {
    visibleMenu.push({ href: "/super-admin-secret", label: "System Override", icon: ShieldAlert, description: "Root DB access", allowedRoles: ["admin"], iconBg: "bg-[#ef4444]" });
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
        <div className="px-4 sm:px-6 max-w-5xl mx-auto pt-3 sm:pt-5 animate-in fade-in duration-300">
          
          <div className="flex items-center gap-1.5 mb-1.5">
            <Sparkles className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Headquarters</span>
          </div>

          <div className="flex flex-col mb-3">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight">
              <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 bg-clip-text text-transparent mr-1.5">
                {greeting},
              </span>
              <span className="text-zinc-900">{userName.split(' ')[0]}</span>
            </h1>
          </div>

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

          {/* OMNIBAR SEARCH WITH MIC */}
          <div className="relative mb-6 z-20">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_placeholder')}
              className="h-14 pl-10 pr-12 rounded-2xl border-zinc-200 shadow-sm bg-white text-base font-semibold placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500 transition-all"
            />
            
            <button 
              onClick={startVoiceSearch} 
              className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'}`}
            >
              <Mic className="h-4 w-4" />
            </button>
            
            {searchQuery && (
              <Card className="absolute top-full left-0 right-0 mt-2 overflow-hidden shadow-2xl border-zinc-200 rounded-2xl bg-white max-h-[300px] overflow-y-auto">
                {isSearching ? (
                  <div className="p-4 text-center text-sm text-zinc-500 font-bold">Searching...</div>
                ) : searchResults.length > 0 ? (
                  <div className="flex flex-col">
                    {searchResults.map((result, idx) => (
                      <button 
                        key={idx}
                        onClick={() => navigate(result.path)}
                        className="flex items-center gap-3 p-4 hover:bg-zinc-50 text-left border-b border-zinc-100 last:border-0"
                      >
                        <div className="h-10 w-10 rounded-xl bg-zinc-100 flex items-center justify-center shrink-0">
                          <result.icon className="h-5 w-5 text-zinc-600" />
                        </div>
                        <div>
                          <p className="font-bold text-zinc-900 text-sm">{result.name}</p>
                          <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mt-0.5">
                            {result.type === 'route' ? 'System App' : result.category || 'Product Catalog'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center text-sm text-zinc-500 font-bold">No results found</div>
                )}
              </Card>
            )}
          </div>

          {/* UPGRADED QUICK ACTIONS & CATEGORIES */}
          <div className="mb-8">
            <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em] mb-3">{t('quick_actions')}</h3>
            
            {/* Primary Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-3">
              {QUICK_TILES.map((tile, idx) => (
                <button 
                  key={idx} 
                  onClick={() => navigate(tile.path)}
                  className="group relative overflow-hidden flex flex-col items-center justify-center p-4 rounded-[20px] bg-white border border-zinc-200/80 transition-all active:scale-95 shadow-sm hover:shadow-md hover:border-zinc-300"
                >
                  <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-2.5 ${tile.bg} ${tile.text} group-hover:scale-110 transition-transform duration-300`}>
                    <tile.icon className="h-6 w-6" />
                  </div>
                  <span className="font-bold text-[11px] text-zinc-800 text-center uppercase tracking-wide leading-tight">{tile.label}</span>
                </button>
              ))}
            </div>

            {/* Secondary Space-Saving Category Pills */}
            <div className="flex flex-wrap gap-2">
              {SECONDARY_CATEGORIES.map((cat, idx) => (
                <button 
                  key={idx}
                  onClick={() => navigate(`/billing?category=${encodeURIComponent(cat)}`)}
                  className="flex items-center px-3 py-2 bg-white border border-zinc-200/80 rounded-[14px] text-xs font-bold text-zinc-600 shadow-sm hover:border-zinc-300 hover:shadow-md hover:text-zinc-900 active:scale-95 transition-all"
                >
                  {cat}
                  <ChevronRight className="h-3.5 w-3.5 ml-1 text-zinc-400" />
                </button>
              ))}
            </div>
          </div>

          {/* MAIN MODULES */}
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
          </div>

        </div>
      </div>
    </AppLayout>
  );
};

export default Index;