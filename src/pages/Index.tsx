import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "@/lib/supabase"; 
import { useLanguage } from "@/contexts/LanguageContext";
import { useToast } from "@/hooks/use-toast";
import { 
  PlusCircle, ShoppingCart, BarChart3, Boxes, BookUser, Settings, 
  TrendingUp, ShieldAlert, Users, FlaskConical, 
  Sparkles, Megaphone, Search, X, Nut, Package, Scale, Mic, ChevronRight, Settings2, Gift, Flame, Star, Tag, ShoppingBag, FolderHeart, Trash2
} from "lucide-react";

const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

const AVAILABLE_ICONS: Record<string, any> = { 
  FlaskConical, Package, Nut, Scale, Sparkles, Gift, Flame, Star, Tag, ShoppingBag, FolderHeart 
};

const COLOR_THEMES = {
  emerald: { text: "text-emerald-600", bg: "bg-emerald-100" },
  rose: { text: "text-rose-600", bg: "bg-rose-100" },
  amber: { text: "text-amber-600", bg: "bg-amber-100" },
  blue: { text: "text-blue-600", bg: "bg-blue-100" },
  purple: { text: "text-purple-600", bg: "bg-purple-100" },
  orange: { text: "text-orange-600", bg: "bg-orange-100" },
};

const DEFAULT_TILES = [
  { id: "1", label: "Yearly Masala", icon: "FlaskConical", color: "emerald", path: "/billing?action=yearly_masala" },
  { id: "2", label: "Ready Masala", icon: "Package", color: "rose", path: "/billing?category=JMM%20Spices" },
  { id: "3", label: "Dryfruits", icon: "Nut", color: "amber", path: "/billing?category=Dryfruits" },
  { id: "4", label: "Seeds", icon: "Scale", color: "blue", path: "/billing?category=Seeds" },
];

const DEFAULT_CATEGORIES = [
  "Pickles & Papad", "Tea & Coffee", "Salt & Essentials", "Essences & Colors",
  "Groceries & Ready Mixes", "Savai Masala", "Everest Masala", "Suhana / Pravin"
];

const Index = () => {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { toast } = useToast();
  
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

  // Customization State
  const [isCustomizing, setIsCustomizing] = useState(false);
  const [quickTiles, setQuickTiles] = useState<any[]>([]);
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  // Forms for new custom additions
  const [newTileName, setNewTileName] = useState("");
  const [newTileIcon, setNewTileIcon] = useState("Sparkles");
  const [newTileColor, setNewTileColor] = useState("orange");
  const [newCategoryName, setNewCategoryName] = useState("");

  const isOwner = userRole === "owner" || isSuperAdmin;

  useEffect(() => {
    const initializeUser = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (session.user.email === SUPER_ADMIN_EMAIL) setIsSuperAdmin(true);
          const { data } = await (supabase as any)
            .from("profiles")
            .select("role, full_name, tenant_id")
            .eq("id", session.user.id)
            .single();

          if (data) {
            const role = data.role?.toLowerCase() || "sales";
            setUserRole(role);
            setUserName(data.full_name || "System");
            setTenantId(data.tenant_id);
            await loadTenantDashboardConfig(data.tenant_id);
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

  const loadTenantDashboardConfig = async (tId: string) => {
    // 1. Instant optimistic load from localStorage
    const cached = localStorage.getItem(`jmm_dashboard_${tId}`);
    if (cached) {
      try {
        const parsed = JSON.parse(cached);
        setQuickTiles(parsed.tiles || DEFAULT_TILES);
        setSecondaryCategories(parsed.categories || DEFAULT_CATEGORIES);
      } catch (e) {}
    } else {
      setQuickTiles(DEFAULT_TILES);
      setSecondaryCategories(DEFAULT_CATEGORIES);
    }

    // 2. Fetch fresh global configuration from Supabase
    try {
      const { data: tenantData } = await (supabase as any)
        .from("tenants")
        .select("dashboard_config")
        .eq("id", tId)
        .single();

      if (tenantData?.dashboard_config) {
        const remoteTiles = tenantData.dashboard_config.tiles || DEFAULT_TILES;
        const remoteCategories = tenantData.dashboard_config.categories || DEFAULT_CATEGORIES;
        setQuickTiles(remoteTiles);
        setSecondaryCategories(remoteCategories);
        localStorage.setItem(
          `jmm_dashboard_${tId}`,
          JSON.stringify({ tiles: remoteTiles, categories: remoteCategories })
        );
      }
    } catch (err) {
      console.error("Failed to load cloud dashboard config:", err);
    }
  };

  const persistConfig = async (newTiles: any[], newCats: string[]) => {
    setQuickTiles(newTiles);
    setSecondaryCategories(newCats);

    if (tenantId) {
      localStorage.setItem(`jmm_dashboard_${tenantId}`, JSON.stringify({ tiles: newTiles, categories: newCats }));
      
      setIsSavingConfig(true);
      const { error } = await (supabase as any)
        .from("tenants")
        .update({ dashboard_config: { tiles: newTiles, categories: newCats } })
        .eq("id", tenantId);

      setIsSavingConfig(false);
      if (error) {
        toast({ title: "Sync Error", description: "Failed to sync config across store devices.", variant: "destructive" });
      } else {
        toast({ title: "Dashboard Saved", description: "Updated across all staff devices." });
      }
    }
  };

  const handleAddTile = () => {
    if (!newTileName.trim()) return;
    const newTile = {
      id: crypto.randomUUID(),
      label: newTileName.trim(),
      icon: newTileIcon,
      color: newTileColor,
      path: `/billing?category=${encodeURIComponent(newTileName.trim())}`
    };
    persistConfig([...quickTiles, newTile], secondaryCategories);
    setNewTileName("");
  };

  const handleRemoveTile = (id: string) => {
    persistConfig(quickTiles.filter(t => t.id !== id), secondaryCategories);
  };

  const handleAddCategory = () => {
    if (!newCategoryName.trim()) return;
    persistConfig(quickTiles, [...secondaryCategories, newCategoryName.trim()]);
    setNewCategoryName("");
  };

  const handleRemoveCategory = (cat: string) => {
    persistConfig(quickTiles, secondaryCategories.filter(c => c !== cat));
  };

  const startVoiceSearch = () => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return alert("Voice search is not supported in this browser.");
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'mr-IN'; 
    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onresult = (e: any) => setSearchQuery(e.results[0][0].transcript);
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

      let orQueryString = `item_name.ilike.%${searchQuery}%,english_name.ilike.%${searchQuery}%`;
      
      if (searchQuery.length > 1 && searchQuery.length <= 6 && !searchQuery.includes(' ')) {
        const strictAcronymPattern = '%' + searchQuery.split('').join('%') + '%';       
        const spacedAcronymPattern = '%' + searchQuery.split('').join('% %') + '%';     
        orQueryString += `,item_name.ilike.${strictAcronymPattern},english_name.ilike.${strictAcronymPattern}`;
        orQueryString += `,item_name.ilike.${spacedAcronymPattern},english_name.ilike.${spacedAcronymPattern}`;
      }

      const { data: items } = await (supabase as any)
        .from('items')
        .select('id, item_name, category')
        .eq('tenant_id', tenantId)
        .or(orQueryString)
        .limit(6);

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

  const baseMenuOptions = [
    { href: "/billing", label: t('billing'), icon: ShoppingCart, description: "Fast checkout counter", allowedRoles: ["owner", "admin", "manager", "sales"], iconBg: "bg-[#6366f1]" },
    { href: "/inventory/add", label: "Add Stock", icon: PlusCircle, description: "Inward shipments", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#3b82f6]" },
    { href: "/udhaar", label: "Due / Advance", icon: BookUser, description: "Pending store balances", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#14b8a6]" },
    { href: "/manage", label: t('inventory'), icon: Boxes, description: "Stock and catalog manager", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#27272a]" },
    { href: "/sales", label: t('sales'), icon: TrendingUp, description: "Store transactions ledger", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#10b981]" },
    { href: "/crm", label: "Discovery", icon: Users, description: "Customer relationships", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#f97316]" },
    { href: "/analytics", label: "Analytics", icon: BarChart3, description: "Store performance metrics", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#a855f7]" },
    { href: "/settings", label: t('settings'), icon: Settings, description: "Hardware and terminal setup", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-[#57534e]" },
  ];

  let visibleMenu = baseMenuOptions.filter(option => option.allowedRoles.includes(userRole));

  if (isSuperAdmin) {
    visibleMenu.push({ href: "/super-admin-secret", label: "System Override", icon: ShieldAlert, description: "Root DB access", allowedRoles: ["owner", "admin"], iconBg: "bg-[#ef4444]" });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-[#fcfcfd]">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-200 border-t-zinc-900" />
            <p className="text-zinc-500 font-bold text-xs uppercase tracking-wider">Loading Console...</p>
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
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Store Console</span>
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
                <span className="truncate">Store terminal active. Synced with cloud.</span>
              </div>
              <button className="text-zinc-400 hover:text-zinc-600 shrink-0 ml-2"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}

          <div className="relative mb-6 z-20">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-5 w-5 text-blue-500" />
            <Input 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('search_placeholder')}
              className="h-14 pl-11 pr-12 rounded-2xl border-zinc-200 shadow-sm bg-white text-base font-semibold placeholder:text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500 transition-all"
            />
            
            <button onClick={startVoiceSearch} className={`absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-xl transition-all ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-700'}`}>
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

          {/* QUICK ACTIONS & SEASONAL FOLDERS */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">{t('quick_actions')}</h3>
              
              {/* RESTRICTED: OWNER-ONLY ACCESS */}
              {isOwner && (
                <button 
                  onClick={() => setIsCustomizing(true)} 
                  className="flex items-center gap-1.5 text-[11px] font-bold text-blue-600 bg-blue-50 px-2.5 py-1.5 rounded-xl border border-blue-200/80 hover:bg-blue-100 transition-colors shadow-sm"
                >
                  <Settings2 className="h-3.5 w-3.5" /> Customize Layout
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3 mb-3">
              {quickTiles.map((tile) => {
                const IconComponent = AVAILABLE_ICONS[tile.icon] || Package;
                const colors = COLOR_THEMES[tile.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.blue;
                return (
                  <button key={tile.id} onClick={() => navigate(tile.path)} className="group relative overflow-hidden flex flex-col items-center justify-center p-4 rounded-[20px] bg-white border border-zinc-200/80 transition-all active:scale-95 shadow-sm hover:shadow-md hover:border-zinc-300">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center mb-2.5 ${colors.bg} ${colors.text} group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className="h-6 w-6" />
                    </div>
                    <span className="font-bold text-[11px] text-zinc-800 text-center uppercase tracking-wide leading-tight">{tile.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {secondaryCategories.map((cat, idx) => (
                <button key={idx} onClick={() => navigate(`/billing?category=${encodeURIComponent(cat)}`)} className="flex items-center px-3 py-2 bg-white border border-zinc-200/80 rounded-[14px] text-xs font-bold text-zinc-600 shadow-sm hover:border-zinc-300 hover:shadow-md hover:text-zinc-900 active:scale-95 transition-all">
                  {cat} <ChevronRight className="h-3.5 w-3.5 ml-1 text-zinc-400" />
                </button>
              ))}
            </div>
          </div>

          <div className="mb-2.5"><h3 className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.15em]">Store Modules</h3></div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {visibleMenu.map((option, index) => (
              <button key={index} onClick={() => navigate(option.href)} className="group outline-none text-left block h-full">
                <Card className="h-full flex flex-col items-start justify-between p-3 sm:p-4 transition-all duration-200 rounded-[16px] border-zinc-200/80 bg-white shadow-sm hover:shadow-md hover:border-zinc-300 active:scale-95 cursor-pointer relative overflow-hidden">
                  <div className="absolute -top-6 -right-6 w-20 h-20 bg-zinc-100 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
                  <div className={`h-9 w-9 rounded-[10px] flex items-center justify-center mb-2.5 shadow-sm ${option.iconBg} text-white shrink-0 relative z-10`}>
                    <option.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                  </div>
                  <div className="w-full relative z-10">
                    <h3 className="font-bold text-[12px] sm:text-[13px] tracking-tight text-zinc-900 leading-tight mb-0.5 truncate">{option.label}</h3>
                    <p className="text-[9px] sm:text-[10px] font-semibold text-zinc-500 line-clamp-2 leading-snug">{option.description}</p>
                  </div>
                </Card>
              </button>
            ))}
          </div>

        </div>
      </div>

      {/* DASHBOARD CUSTOMIZATION ENGINE (OWNER ONLY) */}
      <Dialog open={isCustomizing && isOwner} onOpenChange={setIsCustomizing}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-[32px] p-0 overflow-hidden bg-white shadow-2xl border-zinc-200 flex flex-col max-h-[90dvh]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50/50 shrink-0">
            <div>
              <DialogTitle className="text-lg font-bold text-zinc-900">Dashboard Layout Manager</DialogTitle>
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">Owner Access Only • Cloud Synced</p>
            </div>
            <button onClick={() => setIsCustomizing(false)} className="h-8 w-8 rounded-full hover:bg-zinc-200 flex items-center justify-center">
              <X className="h-4 w-4 text-zinc-500"/>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Quick Tiles Manager */}
            <div className="space-y-3">
              <div className="flex justify-between items-center border-b border-zinc-100 pb-2">
                <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-blue-500"/> Seasonal & Quick Action Tiles
                </span>
                {isSavingConfig && <span className="text-[10px] text-zinc-400 font-bold animate-pulse">Syncing...</span>}
              </div>

              <div className="space-y-2 max-h-[28vh] overflow-y-auto pr-1">
                {quickTiles.map(tile => {
                  const Icon = AVAILABLE_ICONS[tile.icon] || Package;
                  const theme = COLOR_THEMES[tile.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.blue;
                  return (
                    <div key={tile.id} className="flex justify-between items-center p-3 rounded-xl border border-zinc-200 bg-white shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center ${theme.bg} ${theme.text}`}>
                          <Icon className="h-4 w-4"/>
                        </div>
                        <div>
                          <span className="font-bold text-sm text-zinc-800 leading-none block">{tile.label}</span>
                          <span className="text-[10px] text-zinc-400 font-medium">{tile.path}</span>
                        </div>
                      </div>
                      <button onClick={() => handleRemoveTile(tile.id)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="h-4 w-4"/>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add New Tile Form */}
              <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-3.5 space-y-3 mt-2 shadow-inner">
                <Input 
                  value={newTileName} 
                  onChange={e => setNewTileName(e.target.value)} 
                  placeholder="Folder/Action Name (e.g. Diwali Offers)" 
                  className="h-11 text-sm font-bold bg-white rounded-xl" 
                />
                <div className="flex gap-2">
                  <select 
                    value={newTileIcon} 
                    onChange={e => setNewTileIcon(e.target.value)} 
                    className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold px-2 shadow-sm"
                  >
                    {Object.keys(AVAILABLE_ICONS).map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <select 
                    value={newTileColor} 
                    onChange={e => setNewTileColor(e.target.value)} 
                    className="h-11 flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold px-2 shadow-sm capitalize"
                  >
                    {Object.keys(COLOR_THEMES).map(color => <option key={color} value={color}>{color}</option>)}
                  </select>
                  <Button onClick={handleAddTile} disabled={!newTileName} className="h-11 px-5 bg-zinc-900 text-white font-bold rounded-xl active:scale-95">
                    Add
                  </Button>
                </div>
              </div>
            </div>

            {/* Secondary Categories Manager */}
            <div className="space-y-3">
              <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5 border-b border-zinc-100 pb-2">
                <Tag className="h-3.5 w-3.5 text-blue-500"/> Secondary Category Filter Pills
              </span>
              
              <div className="flex flex-wrap gap-2 max-h-[20vh] overflow-y-auto">
                {secondaryCategories.map(cat => (
                  <div key={cat} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-white border border-zinc-200 rounded-xl shadow-sm">
                    <span className="text-xs font-bold text-zinc-700">{cat}</span>
                    <button onClick={() => handleRemoveCategory(cat)} className="p-1 hover:bg-rose-50 text-zinc-400 hover:text-rose-500 rounded-lg">
                      <X className="h-3 w-3"/>
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2 pt-1">
                <Input 
                  value={newCategoryName} 
                  onChange={e => setNewCategoryName(e.target.value)} 
                  placeholder="Category Name (e.g. Dryfruits Gift Packs)..." 
                  className="h-11 text-sm font-bold bg-white rounded-xl" 
                />
                <Button onClick={handleAddCategory} disabled={!newCategoryName} className="h-11 px-5 bg-zinc-900 text-white font-bold rounded-xl active:scale-95">
                  Add
                </Button>
              </div>
            </div>

          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
};

export default Index;