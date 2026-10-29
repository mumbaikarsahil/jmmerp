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

// Modern, soft color themes for quick visual recognition
const COLOR_THEMES = {
  emerald: { bg: "bg-emerald-50/50", border: "border-emerald-200/60", hover: "hover:bg-emerald-50", text: "text-emerald-600", textDark: "text-emerald-900" },
  rose: { bg: "bg-rose-50/50", border: "border-rose-200/60", hover: "hover:bg-rose-50", text: "text-rose-600", textDark: "text-rose-900" },
  amber: { bg: "bg-amber-50/50", border: "border-amber-200/60", hover: "hover:bg-amber-50", text: "text-amber-600", textDark: "text-amber-900" },
  blue: { bg: "bg-blue-50/50", border: "border-blue-200/60", hover: "hover:bg-blue-50", text: "text-blue-600", textDark: "text-blue-900" },
  purple: { bg: "bg-purple-50/50", border: "border-purple-200/60", hover: "hover:bg-purple-50", text: "text-purple-600", textDark: "text-purple-900" },
  orange: { bg: "bg-orange-50/50", border: "border-orange-200/60", hover: "hover:bg-orange-50", text: "text-orange-600", textDark: "text-orange-900" },
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
  
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [isCustomizing, setIsCustomizing] = useState(false);
  const [quickTiles, setQuickTiles] = useState<any[]>([]);
  const [secondaryCategories, setSecondaryCategories] = useState<string[]>([]);
  const [isSavingConfig, setIsSavingConfig] = useState(false);

  const [newTileName, setNewTileName] = useState("");
  const [newTileIcon, setNewTileIcon] = useState("Sparkles");
  const [newTileColor, setNewTileColor] = useState("blue");
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
  }, []);

  const loadTenantDashboardConfig = async (tId: string) => {
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
        toast({ title: t('sync_error') || "Sync Error", description: t('sync_error_desc') || "Failed to sync config.", variant: "destructive" });
      } else {
        toast({ title: t('saved') || "Saved", description: t('layout_updated') || "Layout updated." });
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
        .limit(10);

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
    { href: "/billing", label: t('billing'), icon: ShoppingCart, description: t('desc_billing') || "Fast checkout counter", allowedRoles: ["owner", "admin", "manager", "sales"], iconBg: "bg-indigo-50 text-indigo-600 border border-indigo-100" },
    { href: "/inventory/add", label: t('add_stock') || "Add Stock", icon: PlusCircle, description: t('desc_add_stock') || "Inward shipments", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-blue-50 text-blue-600 border border-blue-100" },
    { href: "/udhaar", label: t('udhaar_book') || "Due / Advance", icon: BookUser, description: t('desc_udhaar_book') || "Pending store balances", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-teal-50 text-teal-600 border border-teal-100" },
    { href: "/manage", label: t('inventory') || "Inventory", icon: Boxes, description: t('desc_inventory') || "Stock and catalog manager", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-zinc-100 text-zinc-700 border border-zinc-200" },
    { href: "/sales", label: t('sales') || "Sales", icon: TrendingUp, description: t('desc_sales') || "Store transactions ledger", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-emerald-50 text-emerald-600 border border-emerald-100" },
    { href: "/crm", label: t('discovery') || "Discovery", icon: Users, description: t('desc_discovery') || "Customer relationships", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-orange-50 text-orange-600 border border-orange-100" },
    { href: "/analytics", label: t('analytics') || "Analytics", icon: BarChart3, description: t('desc_analytics') || "Store performance metrics", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-purple-50 text-purple-600 border border-purple-100" },
    { href: "/settings", label: t('settings') || "Settings", icon: Settings, description: t('desc_settings') || "Hardware and terminal setup", allowedRoles: ["owner", "admin", "manager"], iconBg: "bg-stone-100 text-stone-600 border border-stone-200" },
  ];

  let visibleMenu = baseMenuOptions.filter(option => option.allowedRoles.includes(userRole));

  if (isSuperAdmin) {
    visibleMenu.push({ href: "/super-admin-secret", label: t('system_override') || "System Override", icon: ShieldAlert, description: t('desc_system_override') || "Root DB access", allowedRoles: ["owner", "admin"], iconBg: "bg-rose-50 text-rose-600 border border-rose-100" });
  }

  if (isLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-zinc-50/50">
          <div className="flex items-center gap-2 text-zinc-500">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-zinc-300 border-t-zinc-600" />
            <span className="font-medium text-sm">{t('loading_system') || "Loading System..."}</span>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-zinc-50/50 font-sans p-3 sm:p-6 pb-24">
        <div className="max-w-6xl mx-auto space-y-6">
          
          {/* Header & Status (Modern UI) */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center shrink-0">
                <Boxes className="h-5 w-5" />
              </div>
              <div>
                <h1 className="text-lg font-semibold text-zinc-900 tracking-tight leading-none">
                  {t('store_console') || "Store Console"}
                </h1>
                <p className="text-xs font-medium text-zinc-500 mt-1">{t('logged_in_as') || "Logged in as"} {userName}</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2 text-xs font-medium">
              {!isSupabaseConfigured ? (
                <span className="bg-rose-50 text-rose-700 border border-rose-100 px-3 py-2 rounded-lg flex items-center gap-1.5">
                  <ShieldAlert className="h-4 w-4" /> {t('db_disconnected') || "Database Disconnected"}
                </span>
              ) : (
                <span className="bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-2 rounded-lg flex items-center gap-1.5">
                  <Megaphone className="h-4 w-4" /> {t('system_synced') || "System Synced"}
                </span>
              )}
            </div>
          </div>

          {/* Search Bar - Structural & Clean */}
          <div className="relative z-20 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4.5 w-4.5 text-zinc-400" />
              <Input 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('search_placeholder') || "Search Item, Menu or Page..."}
                className="h-12 pl-10 pr-12 rounded-xl border-zinc-200/80 bg-white text-zinc-800 font-medium text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-900 transition-all"
              />
              <button 
                onClick={startVoiceSearch} 
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-2 rounded-lg transition-colors ${isListening ? 'bg-rose-100 text-rose-600 animate-pulse' : 'text-zinc-400 hover:bg-zinc-50 hover:text-zinc-700'}`}
              >
                <Mic className="h-4.5 w-4.5" />
              </button>
            </div>
            <Button 
              className="h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium shadow-sm px-6 shrink-0 transition-all active:scale-[0.98]"
              onClick={() => {}}
            >
              {t('search') || "Search"}
            </Button>
            
            {/* Search Dropdown */}
            {searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-2 overflow-hidden rounded-xl border border-zinc-200 bg-white max-h-[300px] overflow-y-auto shadow-lg">
                {isSearching ? (
                  <div className="p-4 text-sm text-zinc-500 font-medium border-b border-zinc-100">{t('searching') || "Searching..."}</div>
                ) : searchResults.length > 0 ? (
                  <div className="flex flex-col">
                    {searchResults.map((result, idx) => (
                      <button 
                        key={idx}
                        onClick={() => navigate(result.path)}
                        className="flex items-center gap-3 p-3.5 hover:bg-zinc-50 text-left border-b border-zinc-100 last:border-0 transition-colors"
                      >
                        <div className="h-9 w-9 rounded-lg bg-zinc-100 border border-zinc-200/80 flex items-center justify-center shrink-0">
                          <result.icon className="h-4.5 w-4.5 text-zinc-600" />
                        </div>
                        <div>
                          <p className="font-semibold text-zinc-900 text-sm leading-tight">{result.name}</p>
                          <p className="text-[10px] font-medium text-zinc-500 uppercase tracking-wide mt-0.5">
                            {result.type === 'route' ? (t('system_app') || 'System App') : result.category || (t('product') || 'Product')}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-sm text-zinc-500 font-medium">{t('no_results') || "No results found"}</div>
                )}
              </div>
            )}
          </div>

          {/* QUICK ACTIONS */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('quick_actions') || "Quick Actions"}</h3>
              {isOwner && (
                <button 
                  onClick={() => setIsCustomizing(true)} 
                  className="flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  <Settings2 className="h-4 w-4" /> {t('customize_layout') || "Customize Layout"}
                </button>
              )}
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-5">
              {quickTiles.map((tile) => {
                const IconComponent = AVAILABLE_ICONS[tile.icon] || Package;
                const theme = COLOR_THEMES[tile.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.blue;
                
                return (
                  <button 
                    key={tile.id} 
                    onClick={() => navigate(tile.path)} 
                    className={`flex flex-col items-center justify-center p-3 h-24 border ${theme.border} ${theme.bg} ${theme.hover} rounded-xl transition-all active:scale-[0.98]`}
                  >
                    <IconComponent className={`h-6 w-6 ${theme.text} mb-2.5`} />
                    <span className={`font-semibold text-xs ${theme.textDark} text-center leading-tight line-clamp-2`}>
                      {tile.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap gap-2">
              {secondaryCategories.map((cat, idx) => (
                <button 
                  key={idx} 
                  onClick={() => navigate(`/billing?category=${encodeURIComponent(cat)}`)} 
                  className="flex items-center justify-center px-4 py-2 bg-white border border-zinc-200/80 rounded-lg text-[11px] font-medium text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900 transition-colors shadow-sm active:scale-[0.98]"
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* STORE MODULES */}
          <div className="bg-white border border-zinc-200/80 rounded-2xl shadow-sm p-4 sm:p-5">
            <div className="mb-4">
              <h3 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('system_modules') || "System Modules"}</h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {visibleMenu.map((option, index) => (
                <button 
                  key={index} 
                  onClick={() => navigate(option.href)} 
                  className="flex items-start gap-3.5 p-4 bg-white border border-zinc-100 hover:border-zinc-200/80 hover:bg-zinc-50 hover:shadow-sm rounded-xl text-left transition-all active:scale-[0.98] group h-full"
                >
                  <div className={`h-10 w-10 rounded-lg flex items-center justify-center shrink-0 shadow-sm ${option.iconBg}`}>
                    <option.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm text-zinc-900 leading-tight mb-1 group-hover:text-indigo-600 transition-colors">{option.label}</h3>
                    <p className="text-[11px] font-medium text-zinc-500 leading-snug">{option.description}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* DASHBOARD CUSTOMIZATION ENGINE (OWNER ONLY) */}
      <Dialog open={isCustomizing && isOwner} onOpenChange={setIsCustomizing}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden bg-white border border-zinc-200 shadow-xl max-h-[90dvh]">
          <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4 bg-zinc-50 shrink-0">
            <div>
              <DialogTitle className="text-sm font-semibold text-zinc-900">{t('layout_manager') || "Layout Manager"}</DialogTitle>
              <p className="text-[11px] font-medium text-zinc-500 mt-0.5">{t('edit_shortcuts') || "Edit store shortcuts"}</p>
            </div>
            <button onClick={() => setIsCustomizing(false)} className="h-8 w-8 rounded-lg hover:bg-zinc-200 flex items-center justify-center transition-colors">
              <X className="h-4.5 w-4.5 text-zinc-500"/>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            
            {/* Quick Tiles Manager */}
            <div>
              <div className="flex justify-between items-center border-b border-zinc-100 pb-2 mb-3">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('quick_action_tiles') || "Quick Action Tiles"}</span>
                {isSavingConfig && <span className="text-[10px] text-indigo-600 font-medium">{t('saving') || "Saving..."}</span>}
              </div>

              <div className="space-y-2 max-h-[25vh] overflow-y-auto mb-4 pr-1">
                {quickTiles.map(tile => {
                  const Icon = AVAILABLE_ICONS[tile.icon] || Package;
                  const theme = COLOR_THEMES[tile.color as keyof typeof COLOR_THEMES] || COLOR_THEMES.blue;
                  return (
                    <div key={tile.id} className="flex justify-between items-center p-3 border border-zinc-100 rounded-xl bg-white shadow-sm hover:border-zinc-200 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className={`h-9 w-9 rounded-lg flex items-center justify-center border ${theme.border} ${theme.bg} ${theme.text}`}>
                          <Icon className="h-4.5 w-4.5"/>
                        </div>
                        <span className="font-semibold text-sm text-zinc-800">{tile.label}</span>
                      </div>
                      <button onClick={() => handleRemoveTile(tile.id)} className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors">
                        <Trash2 className="h-4.5 w-4.5"/>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Add New Tile Form */}
              <div className="bg-zinc-50 border border-zinc-100 rounded-xl p-3.5 space-y-3">
                <Input 
                  value={newTileName} 
                  onChange={e => setNewTileName(e.target.value)} 
                  placeholder={t('action_name_placeholder') || "Action Name..."} 
                  className="h-10 text-sm font-medium bg-white rounded-lg border-zinc-200 shadow-sm" 
                />
                <div className="flex gap-2">
                  <select 
                    value={newTileIcon} 
                    onChange={e => setNewTileIcon(e.target.value)} 
                    className="h-10 flex-1 border border-zinc-200 bg-white text-sm font-medium px-2.5 rounded-lg shadow-sm focus:outline-none"
                  >
                    {Object.keys(AVAILABLE_ICONS).map(name => <option key={name} value={name}>{name}</option>)}
                  </select>
                  <select 
                    value={newTileColor} 
                    onChange={e => setNewTileColor(e.target.value)} 
                    className="h-10 flex-1 border border-zinc-200 bg-white text-sm font-medium px-2.5 rounded-lg shadow-sm capitalize focus:outline-none"
                  >
                    {Object.keys(COLOR_THEMES).map(color => <option key={color} value={color}>{color}</option>)}
                  </select>
                  <Button onClick={handleAddTile} disabled={!newTileName} className="h-10 px-5 bg-zinc-900 text-white font-semibold rounded-lg text-sm hover:bg-zinc-800 shadow-sm transition-all active:scale-[0.98]">
                    {t('add') || "Add"}
                  </Button>
                </div>
              </div>
            </div>

            {/* Secondary Categories Manager */}
            <div>
              <div className="border-b border-zinc-100 pb-2 mb-3">
                <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t('category_buttons') || "Category Buttons"}</span>
              </div>
              
              <div className="flex flex-wrap gap-2 max-h-[20vh] overflow-y-auto mb-4">
                {secondaryCategories.map(cat => (
                  <div key={cat} className="flex items-center gap-1.5 pl-3 pr-1.5 py-1.5 bg-white border border-zinc-200/80 rounded-lg shadow-sm">
                    <span className="text-xs font-medium text-zinc-700">{cat}</span>
                    <button onClick={() => handleRemoveCategory(cat)} className="text-zinc-400 hover:bg-rose-50 hover:text-rose-600 p-1 rounded-md transition-colors">
                      <X className="h-3.5 w-3.5"/>
                    </button>
                  </div>
                ))}
              </div>
              
              <div className="flex gap-2">
                <Input 
                  value={newCategoryName} 
                  onChange={e => setNewCategoryName(e.target.value)} 
                  placeholder={t('category_name_placeholder') || "Category Name..."}
                  className="h-10 text-sm font-medium bg-white rounded-lg border-zinc-200 shadow-sm" 
                />
                <Button onClick={handleAddCategory} disabled={!newCategoryName} className="h-10 px-5 bg-zinc-900 text-white font-semibold rounded-lg text-sm hover:bg-zinc-800 shadow-sm transition-all active:scale-[0.98]">
                  {t('add') || "Add"}
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