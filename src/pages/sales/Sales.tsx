import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Calendar as CalendarIcon, Banknote, ShoppingBag, ArrowUpRight, ArrowDownLeft, Filter, 
  MessageCircle, WalletCards, Eye, Trash2, ChevronDown, ChevronUp, Printer, X, CreditCard,
  Search
} from "lucide-react";
import { format } from "date-fns";
import { ThermalReceipt } from "@/components/receipts/ThermalReceipt";
import { Input } from "@/components/ui/input";
import { useNavigate } from "react-router-dom";

type OrderWithDetails = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  status: string;
  source: string;
  customers?: { full_name: string | null; phone_number: string | null } | null;
  order_items: {
    id: string;
    quantity: number;
    price_at_order: number;
    items: { item_name: string; base_unit?: string; item_type?: string; selling_price?: number } | null;
  }[];
  order_item_ingredients?: {
    custom_quantity: number;
    unit: string;
    items: { item_name: string; base_unit: string; selling_price?: number } | null;
  }[];
  payments: {
    amount: number;
    payment_method: string;
  }[];
  items_count: number;
  amount_paid: number;
  balance_due: number;
  totalMixWeightKg?: number;
};

const MASALA_SEQUENCE = [
  "बेडगी", "लवंगी", "गावठी", "काश्मिरी", "संकेश्वरी", "निप्पाणी", "मिरची", 
  "धने", "धणे", "हळकुंड", "मिरी", "बडिशेप", "बडीशेप", "जिरा", "तिळ", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी", 
  "पिंपरी", "पिंपळी", "हिंग", "मेथी", "राई", "सुंठ", "हिरवी वेलची", 
  "गुलाब पाकळी", "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
];

const normalizeUnitStr = (str: string) => String(str || "").toLowerCase().trim();

const getItemObj = (itemsField: any) => {
  if (!itemsField) return null;
  return Array.isArray(itemsField) ? itemsField[0] : itemsField;
};

const getNormalizedQtyForCost = (qty: number, displayUnit: string, dbBaseUnit: string) => {
  const u = normalizeUnitStr(displayUnit); 
  const bu = normalizeUnitStr(dbBaseUnit);
  if (['g', 'gm', 'gram', 'grams', 'ग्रॅम', 'ग्राम'].includes(u)) return qty / 1000;
  if (u === 'piece' || u === 'nug' || u === 'pcs' || bu === 'piece') return qty;
  if (qty >= 10 && (bu.includes('kg') || !bu)) return qty / 1000;
  return qty;
};

export default function Sales() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("Our Store");
  
  // DEFAULT TO CURRENT MONTH
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: firstDay, to: now };
  });
  
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  
  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;

  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [voidingOrder, setVoidingOrder] = useState<OrderWithDetails | null>(null);
  const [previewOrder, setPreviewOrder] = useState<OrderWithDetails | null>(null);

  // Reset page to 1 when filters change
  useEffect(() => { setCurrentPage(1); }, [statusFilter, sourceFilter, searchQuery, dateRange]);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data: profile } = await supabase.from("profiles").select("tenant_id").eq("id", session.user.id).single();
      if ((profile as any)?.tenant_id) {
        setCurrentTenantId((profile as any).tenant_id);
        const { data: tenant } = await supabase.from("tenants").select("tenant_name").eq("id", (profile as any).tenant_id).single();
        if (tenant) setTenantName((tenant as any).tenant_name);
      }
    };
    init();
  }, []);

  useEffect(() => { if (currentTenantId && dateRange.from) fetchSalesData(currentTenantId); }, [dateRange.from, dateRange.to, currentTenantId]);

  const fetchSalesData = async (tenantId: string) => {
    setLoading(true);
    try {
      const start = new Date(dateRange.from); start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.to || dateRange.from); end.setHours(23, 59, 59, 999);

      // 1. Fetch ALL orders bypassing the 1000 limit via chunking
      let allOrders: any[] = [];
      let isFetchingOrders = true;
      let pageIndex = 0;
      const CHUNK_SIZE = 1000;

      while (isFetchingOrders) {
        const { data, error } = await (supabase as any)
          .from('orders')
          .select(`
            id, order_number, created_at, total_amount, payment_status, status, source,
            customers ( full_name, phone_number ),
            order_items ( id, quantity, price_at_order, items ( item_name, base_unit, item_type, selling_price ) ),
            payments ( amount, payment_method )
          `)
          .eq("tenant_id", tenantId) 
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order('created_at', { ascending: false })
          .range(pageIndex * CHUNK_SIZE, (pageIndex + 1) * CHUNK_SIZE - 1);

        if (error) throw error;

        if (data && data.length > 0) {
          allOrders = [...allOrders, ...data];
          if (data.length < CHUNK_SIZE) isFetchingOrders = false;
          else pageIndex++;
        } else {
          isFetchingOrders = false;
        }
      }

      // 2. Fetch ALL ingredients safely bypassing the PostgreSQL "IN" clause limits
      let allIngredients: any[] = [];
      const allOrderItemIds = allOrders.flatMap(o => o.order_items.map((oi: any) => oi.id));
      
      for (let i = 0; i < allOrderItemIds.length; i += 500) {
        const chunkIds = allOrderItemIds.slice(i, i + 500);
        const { data: ingData } = await (supabase as any)
          .from('order_item_ingredients')
          .select('order_item_id, custom_quantity, unit, items (item_name, base_unit, selling_price)')
          .in('order_item_id', chunkIds);
        
        if (ingData) allIngredients = [...allIngredients, ...ingData];
      }

      // 3. Format complete dataset
      const formattedOrders: OrderWithDetails[] = allOrders.map((order: any) => {
        const amountPaid = order.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
        
        let totalMixWeight = 0;
        const mappedItems = order.order_items.map((oi: any) => {
           const ings = allIngredients.filter((ing: any) => ing.order_item_id === oi.id);
           totalMixWeight += ings.reduce((s: number, i: any) => s + (['piece','nug','pcs'].includes(normalizeUnitStr(i.unit)) ? 0 : (['g','gm'].includes(normalizeUnitStr(i.unit)) ? i.custom_quantity / 1000 : i.custom_quantity)), 0);
           return { ...oi, order_item_ingredients: ings };
        });

        return {
          ...order,
          order_items: mappedItems,
          items_count: order.order_items?.reduce((sum: number, item: any) => sum + Math.abs(item.quantity), 0) || 0,
          amount_paid: amountPaid,
          balance_due: Math.max(0, order.total_amount - amountPaid),
          totalMixWeightKg: totalMixWeight
        };
      });

      setOrders(formattedOrders);
    } catch (error) { console.error("Error fetching sales:", error); } finally { setLoading(false); }
  };

  const shareOnWhatsApp = (order: OrderWithDetails) => {
    const phone = order.customers?.phone_number;
    if (!phone) return toast({ title: t('no_phone_found') || "No Phone Found", variant: "destructive" });
    const invoiceLink = `https://retail.biillo.com/#/invoice/${order.id}`;
    const message = encodeURIComponent(`🙏 ${t('thank_you_shopping') || "Thank you for shopping at"} *${tenantName}*!\n\n🧾 ${t('order_no') || "Order No"}: ${order.order_number}\n💰 ${t('total_amount') || "Total Amount"}: ₹${Math.abs(order.total_amount)}\n\nView your E-Receipt here:\n${invoiceLink}`);
    window.open(`https://wa.me/91${phone.replace(/\D/g, '')}?text=${message}`, "_blank");
  };

  const handleVoidOrder = async () => {
    if (!voidingOrder || !currentTenantId) return;
    setLoading(true);
    try {
      const { error } = await (supabase as any).from('orders').delete().eq('id', voidingOrder.id).eq('tenant_id', currentTenantId);
      if (error) throw error;
      toast({ title: t('bill_voided') || "Bill Voided", description: `Order ${voidingOrder.order_number} has been removed.` });
      setVoidingOrder(null); fetchSalesData(currentTenantId);
    } catch (error: any) { toast({ title: t('failed_to_void') || "Failed to void bill", description: error.message, variant: "destructive" }); } finally { setLoading(false); }
  };

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (statusFilter !== "ALL" && o.payment_status !== statusFilter) return false;
      if (sourceFilter !== "ALL" && o.source !== sourceFilter) return false;
      
      if (searchQuery.trim() !== "") {
        const query = searchQuery.toLowerCase();
        const matchesName = o.customers?.full_name?.toLowerCase().includes(query) || false;
        const matchesPhone = o.customers?.phone_number?.includes(query) || false;
        const matchesOrderNo = o.order_number.toLowerCase().includes(query) || false;
        
        if (!matchesName && !matchesPhone && !matchesOrderNo) return false;
      }
      return true;
    });
  }, [orders, statusFilter, sourceFilter, searchQuery]);

  // Derive Paginated Orders for UI performance
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

  // Stats calculate correctly across ALL filtered orders, regardless of current pagination page
  const stats = useMemo(() => filteredOrders.reduce((acc, order) => {
    const isReturn = order.total_amount < 0;
    acc.grossRevenue += order.total_amount; 
    acc.pendingUdhaar += (isReturn ? -order.balance_due : order.balance_due);
    order.payments?.forEach(p => {
      const amt = isReturn ? -p.amount : p.amount;
      acc.totalCollected += amt;
      if (p.payment_method === 'CASH') acc.cashCollected += amt; else acc.onlineCollected += amt;
    });
    return acc;
  }, { grossRevenue: 0, totalCollected: 0, cashCollected: 0, onlineCollected: 0, pendingUdhaar: 0 }), [filteredOrders]);

  const formatCurrency = (amount: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);

  return (
    <AppLayout>
      <div className="w-full bg-zinc-50/50 min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-fade-in pb-24 md:pb-12 font-sans print:hidden">
          
          <div className="flex flex-col lg:flex-row justify-between gap-4 pb-4 border-b border-zinc-200/80">
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 leading-none truncate">{t('revenue_ledger') || "Revenue Ledger"}</h1>
              <p className="text-xs font-medium text-zinc-500 mt-1.5 hidden sm:block truncate">{t('sales_desc') || "Analyze sales performance, transactions, and pending balances."}</p>
            </div>
            
            <div className="flex flex-col sm:flex-row items-center gap-3 shrink-0 w-full lg:w-auto">
              
              <div className="relative w-full sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('search_customer') || "Search name or phone..."}
                  className="w-full h-11 pl-9 pr-4 rounded-xl border-zinc-200/80 bg-white text-zinc-900 text-sm font-medium shadow-sm focus-visible:ring-1 focus-visible:ring-zinc-900"
                />
              </div>

              <div className="w-full sm:w-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start h-11 font-medium text-sm border-zinc-200/80 shadow-sm text-zinc-800 hover:bg-zinc-50 rounded-xl transition-all">
                      <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400 shrink-0" />
                      <span className="truncate">{dateRange.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")) : <span>{t('select_date') || "Select Date Range"}</span>}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="end">
                    <Calendar mode="range" defaultMonth={dateRange.from} selected={dateRange} onSelect={(r: any) => setDateRange(r || { from: new Date() })} initialFocus numberOfMonths={1} className="rounded-2xl" />
                  </PopoverContent>
                </Popover>
              </div>
              
              <div className="flex gap-2 w-full sm:w-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="flex-1 sm:w-[140px] h-11 border-zinc-200/80 bg-white text-zinc-800 font-medium text-sm shadow-sm rounded-xl outline-none focus:ring-1 focus:ring-zinc-900">
                    <Filter className="w-4 h-4 mr-1.5 text-zinc-400"/><SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-zinc-200 shadow-lg">
                    <SelectItem value="ALL" className="font-medium text-sm">{t('all_records') || "All Status"}</SelectItem>
                    <SelectItem value="PAID" className="font-medium text-sm">{t('paid_in_full') || "Paid"}</SelectItem>
                    <SelectItem value="PARTIAL" className="font-medium text-sm">{t('advances') || "Advances"}</SelectItem>
                    <SelectItem value="PENDING" className="font-medium text-sm">{t('unpaid_due') || "Unpaid Due"}</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="flex-1 sm:w-[140px] h-11 border-zinc-200/80 bg-white text-zinc-800 font-medium text-sm shadow-sm rounded-xl outline-none focus:ring-1 focus:ring-zinc-900">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-zinc-200 shadow-lg">
                    <SelectItem value="ALL" className="font-medium text-sm">{t('all_types') || "All Types"}</SelectItem>
                    <SelectItem value="WALK_IN" className="font-medium text-sm">{t('walk_in') || "Walk-In"}</SelectItem>
                    <SelectItem value="ONLINE" className="font-medium text-sm">{t('online') || "Online"}</SelectItem>
                    <SelectItem value="MONTHLY" className="font-medium text-sm">{t('monthly') || "Monthly"}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="shadow-sm border border-zinc-200/80 bg-white rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3"><span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{t('gross_revenue') || "Gross Revenue"}</span><ArrowUpRight className="h-4 w-4 text-zinc-400" /></div>
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(stats.grossRevenue)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border border-emerald-200/60 bg-emerald-50/50 rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3"><span className="text-[11px] font-semibold text-emerald-700 uppercase tracking-wider">{t('collected') || "Collected"}</span><span className="flex h-2 w-2 rounded-full bg-emerald-500 shadow-sm" /></div>
                <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-emerald-900">{formatCurrency(stats.totalCollected)}</div>
                <div className="flex items-center gap-3 text-[11px] font-medium text-emerald-700 mt-2"><span>Cash: {formatCurrency(stats.cashCollected)}</span><span>Digi: {formatCurrency(stats.onlineCollected)}</span></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border border-zinc-200/80 bg-white rounded-2xl sm:col-span-2 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3"><span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">{t('pending_due') || "Pending / Due"}</span><span className="flex h-2 w-2 rounded-full bg-amber-500 shadow-sm" /></div>
                <div className="flex justify-between items-baseline mt-auto">
                  <div className="text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900">{formatCurrency(stats.pendingUdhaar)}</div>
                  <div className="text-[11px] font-medium text-zinc-400 hidden sm:block">{t('unpaid_balances') || "Unpaid balances"}</div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white border border-zinc-200/80 shadow-sm rounded-[24px] overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/80 backdrop-blur-md">
               <div className="flex items-center gap-2">
                 <h2 className="text-sm font-semibold text-zinc-900">{t('transaction_ledger') || "Transaction Ledger"}</h2>
                 <span className="px-2.5 py-1 text-[10px] font-medium bg-white border border-zinc-200 text-zinc-600 rounded-md shadow-sm">{filteredOrders.length}</span>
               </div>
            </div>

            {loading ? (
               <div className="text-center py-20 text-zinc-500 font-medium text-sm flex flex-col items-center gap-3"><div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-300 border-t-zinc-600" /><span>{t('loading_ledger') || "Loading ledger..."}</span></div>
            ) : paginatedOrders.length === 0 ? (
               <div className="text-center py-24 flex flex-col items-center px-4"><div className="h-12 w-12 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-4 text-zinc-400"><ShoppingBag className="h-5 w-5" /></div><p className="text-zinc-900 font-medium text-base">{t('no_transactions') || "No transactions found"}</p></div>
            ) : (
              <div className="flex flex-col divide-y divide-zinc-100">
                {paginatedOrders.map((order) => {
                  const isReturn = order.total_amount < 0;
                  const isExpanded = expandedRowId === order.id;
                  const hasDue = order.balance_due > 0;

                  return (
                    <div key={order.id} className="flex flex-col bg-white hover:bg-zinc-50/50 transition-colors">
                      <div className="flex flex-col md:flex-row md:items-center justify-between p-3 sm:p-4 gap-3">
                        
                        <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedRowId(isExpanded ? null : order.id)}>
                          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 border ${isReturn ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-zinc-50 border-zinc-200 text-zinc-600 shadow-sm'}`}>
                            {isReturn ? <ArrowDownLeft className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-zinc-900 truncate">
                              {order.customers?.full_name || (t('walk_in_customer') || "Walk-in Customer")}
                              {order.source && <span className="ml-2 px-1.5 py-0.5 text-[9px] bg-zinc-100 text-zinc-500 rounded border border-zinc-200 uppercase">{order.source.replace('_', ' ')}</span>}
                            </div>
                            <div className="text-[11px] font-medium text-zinc-500 flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-zinc-400">{order.order_number}</span><span>•</span><span>{format(new Date(order.created_at), "MMM d, h:mm a")}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-3 sm:gap-4 shrink-0 pl-14 md:pl-0">
                          <div className="flex flex-col items-start md:items-end min-w-[80px]">
                             <span className={`text-sm sm:text-base font-semibold ${isReturn ? 'text-rose-600' : 'text-zinc-900'}`}>{formatCurrency(order.total_amount)}</span>
                             {order.payment_status === 'PENDING' ? <span className="text-[10px] font-semibold text-amber-600 uppercase mt-0.5">{t('unpaid_due') || "Unpaid Due"}</span> : order.payment_status === 'PARTIAL' ? <span className="text-[10px] font-semibold text-indigo-600 uppercase mt-0.5">{t('advance') || "Advance"}</span> : <span className="text-[10px] font-semibold text-emerald-600 uppercase mt-0.5">{t('paid') || "Paid"}</span>}
                          </div>
                          
                          <div className="flex items-center gap-1 bg-white border border-zinc-200 p-1 rounded-xl shadow-sm">
                            
                            {hasDue && order.customers?.phone_number && (
                               <Button variant="ghost" size="sm" className="h-8 px-2.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 hover:text-amber-800 font-semibold text-[10px] uppercase tracking-wide mr-1" onClick={(e) => { e.stopPropagation(); navigate(`/udhaar?search=${order.customers?.phone_number}`); }}>
                                 <CreditCard className="h-3.5 w-3.5 mr-1" /> Pay Due
                               </Button>
                            )}

                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition-colors" onClick={(e) => { e.stopPropagation(); setPreviewOrder(order); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={!order.customers?.phone_number} className="h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors" onClick={(e) => { e.stopPropagation(); shareOnWhatsApp(order); }}>
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600 transition-colors" onClick={(e) => { e.stopPropagation(); setVoidingOrder(order); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100 transition-colors" onClick={() => setExpandedRowId(isExpanded ? null : order.id)}>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="bg-zinc-50/80 border-t border-zinc-100 p-4 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-5">
                           <div className="space-y-2">
                             <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t('order_items') || "Order Items"}</p>
                             {order.order_items.map((bi, idx) => {
                               const itemObj = getItemObj(bi.items);
                               return (
                               <div key={idx} className="flex justify-between items-start text-xs bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                 <div className="flex items-start gap-2 min-w-0 pr-2">
                                   <span className="font-semibold text-zinc-400 text-xs shrink-0">{Math.abs(bi.quantity)}×</span>
                                   <span className="font-semibold text-zinc-800 leading-tight">{itemObj?.item_name || "Unknown"}</span>
                                 </div>
                                 <span className="font-semibold text-zinc-900 shrink-0">₹{Math.abs(bi.quantity * bi.price_at_order)}</span>
                               </div>
                             );})}
                           </div>
                           <div className="space-y-2">
                             <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">{t('payment_breakdown') || "Payment Breakdown"}</p>
                             {order.payments && order.payments.length > 0 ? order.payments.map((p, i) => (
                               <div key={i} className="flex justify-between items-center text-xs bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                 <span className="font-semibold text-zinc-700">{p.payment_method}</span>
                                 <span className="font-semibold text-emerald-600">{formatCurrency(p.amount)}</span>
                               </div>
                             )) : (
                               <div className="text-xs font-medium text-zinc-500 italic bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">{t('no_payments_recorded') || "No payments recorded."}</div>
                             )}
                             {order.balance_due > 0 && (
                               <div className="flex justify-between items-center text-xs bg-amber-50 border border-amber-200 p-3 rounded-xl shadow-sm mt-2">
                                 <span className="font-semibold text-amber-700">{t('pending_balance') || "Pending Balance"}</span>
                                 <span className="font-semibold text-amber-700">{formatCurrency(order.balance_due)}</span>
                               </div>
                             )}
                           </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            
            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between px-5 py-4 border-t border-zinc-200/80 bg-zinc-50">
                <span className="text-xs font-medium text-zinc-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} entries
                </span>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} 
                    disabled={currentPage === 1}
                    className="h-8 rounded-lg border-zinc-300 text-xs font-medium"
                  >
                    Previous
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} 
                    disabled={currentPage === totalPages}
                    className="h-8 rounded-lg border-zinc-300 text-xs font-medium"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* --- CENTRAL BILLING FORMAT PREVIEW MODAL --- */}
      <Dialog open={!!previewOrder} onOpenChange={(open) => !open && setPreviewOrder(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-2xl p-0 overflow-hidden bg-zinc-100 shadow-2xl border-zinc-200 flex flex-col max-h-[90dvh]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 bg-white shrink-0 shadow-sm z-10">
            <div>
              <DialogTitle className="text-base font-semibold text-zinc-900">{t('receipt_preview') || "Receipt Preview"}</DialogTitle>
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mt-0.5">{previewOrder?.order_number}</p>
            </div>
            <button onClick={() => setPreviewOrder(null)} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-lg transition-colors active:scale-95"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex justify-center">
            <div className="bg-white w-[148mm] shadow-md border border-zinc-200 min-h-[200px] p-[15px] font-sans text-sm text-black">
               <img src="/jmm-bill-header.png" alt="JMM Spices" className="w-full object-contain mb-[15px] border-b-[3px] border-[#880000]" />
               <div className="flex justify-between font-bold text-[15px] mb-[10px] px-[5px]">
                 <div>नाव: {previewOrder?.customers?.full_name || "Walk-in Customer"}</div>
                 <div>दि.: {previewOrder ? new Date(previewOrder.created_at).toLocaleDateString('en-IN') : ''}</div>
               </div>
               <table className="w-full border-collapse mt-[5px] border-[2px] border-black">
                 <thead>
                   <tr>
                     <th className="border border-black p-1.5 font-bold text-center border-b-[2px]">तपशील</th>
                     <th className="border border-black p-1.5 font-bold text-center border-b-[2px] w-[25%] border-x-[2px]">वजन</th>
                     <th className="border border-black p-1.5 font-bold text-center border-b-[2px] w-[20%] text-right">रुपये</th>
                     <th className="border border-black p-1.5 font-bold text-center border-b-[2px] w-[10%] border-l-[2px]">पैसे</th>
                   </tr>
                 </thead>
                 <tbody>
                   {previewOrder?.order_items.map((item: any, index: number) => {
                     const itemObj = getItemObj(item.items);
                     if (!item.order_item_ingredients || item.order_item_ingredients.length === 0) {
                       return (
                         <tr key={index}>
                           <td className="border border-black p-1.5 font-bold">{itemObj?.item_name || "Item"}</td>
                           <td className="border border-black p-1.5 text-center font-bold border-x-[2px]">{item.quantity} {itemObj?.base_unit || 'pc'}</td>
                           <td className="border border-black p-1.5 text-right font-bold">{Math.floor(Math.abs(item.quantity * Number(item.price_at_order || 0)))}</td>
                           <td className="border border-black p-1.5 text-center font-bold border-l-[2px]">00</td>
                         </tr>
                       );
                     }
                     const sortedPrintIng = [...item.order_item_ingredients].sort((a, b) => {
                       const objA = getItemObj(a.items);
                       const objB = getItemObj(b.items);
                       let idxA = MASALA_SEQUENCE.findIndex(seq => objA?.item_name?.includes(seq));
                       let idxB = MASALA_SEQUENCE.findIndex(seq => objB?.item_name?.includes(seq));
                       return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
                     });
                     return sortedPrintIng.filter((ing:any) => ing.custom_quantity > 0).map((ing:any, iIdx:number) => {
                       const ingItemObj = getItemObj(ing.items);
                       const rawPrice = Number(ingItemObj?.selling_price || 0);
                       const normalizedQty = getNormalizedQtyForCost(ing.custom_quantity, ing.unit, ingItemObj?.base_unit || 'kg');
                       const cost = normalizedQty * rawPrice;

                       return (
                         <tr key={`${index}-${iIdx}`}>
                           <td className="border border-black p-1.5 font-bold">{ingItemObj?.item_name || "Spice"}</td>
                           <td className="border border-black p-1.5 text-center font-bold border-x-[2px]">{ing.custom_quantity} {ing.unit !== 'g' && ing.unit !== 'kg' ? ing.unit : ''}</td>
                           <td className="border border-black p-1.5 text-right font-bold">{Math.round(cost)}</td>
                           <td className="border border-black p-1.5 text-center font-bold border-l-[2px]">00</td>
                         </tr>
                       );
                     });
                   })}
                   <tr className="border-t-[2px] border-black font-black bg-[#f4f4f5]">
                     <td className="border border-black p-1.5">एकूण वजन</td>
                     <td className="border border-black p-1.5 text-center border-x-[2px]">{previewOrder?.totalMixWeightKg ? `${previewOrder.totalMixWeightKg.toFixed(3)} kg` : '-'}</td>
                     <td className="border border-black p-1.5 bg-[#f4f4f5]"></td>
                     <td className="border border-black p-1.5 border-l-[2px] bg-[#f4f4f5]"></td>
                   </tr>
                   <tr className="border-t-[2px] border-black font-black bg-[#f4f4f5]">
                     <td className="border border-black p-1.5" colSpan={2}>एकूण रुपये</td>
                     <td className="border border-black p-1.5 text-right text-lg">{Math.floor(previewOrder?.total_amount || 0)}</td>
                     <td className="border border-black p-1.5 text-center border-l-[2px]">00</td>
                   </tr>
                   <tr className="font-black bg-[#f4f4f5]">
                     <td className="border border-black p-1.5" colSpan={2}>ॲडव्हान्स जमा</td>
                     <td className="border border-black p-1.5 text-right">{Math.floor(previewOrder?.amount_paid || 0)}</td>
                     <td className="border border-black p-1.5 text-center border-l-[2px]">00</td>
                   </tr>
                   <tr className="border-t-[2px] border-black font-black bg-[#f4f4f5]">
                     <td className="border border-black p-1.5" colSpan={2}>एकूण शिल्लक</td>
                     <td className="border border-black p-1.5 text-right">{Math.floor(previewOrder?.balance_due || 0)}</td>
                     <td className="border border-black p-1.5 text-center border-l-[2px]">00</td>
                   </tr>
                 </tbody>
               </table>
            </div>
          </div>
          
          <div className="p-4 sm:p-5 border-t border-zinc-200 bg-white shrink-0 pb-safe">
            <Button onClick={() => setTimeout(() => window.print(), 100)} className="h-12 w-full rounded-xl bg-zinc-900 hover:bg-zinc-800 text-[15px] font-semibold text-white shadow-sm active:scale-[0.98] transition-transform">
              <Printer className="h-5 w-5 mr-2" /> {t('print_physical_receipt') || "Print Physical Receipt"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ThermalReceipt order={previewOrder} source="sales" />

      {/* VOID BILL CONFIRMATION MODAL */}
      <AlertDialog open={!!voidingOrder} onOpenChange={(open) => !open && setVoidingOrder(null)}>
        <AlertDialogContent aria-describedby={undefined} className="rounded-2xl border-zinc-200 shadow-2xl p-0 overflow-hidden sm:max-w-sm">
          <div className="p-6 bg-white">
            <div className="w-12 h-12 rounded-xl bg-rose-50 border border-rose-100 flex items-center justify-center mb-4 shadow-sm">
              <Trash2 className="h-5 w-5 text-rose-600" />
            </div>
            <AlertDialogTitle className="text-lg font-semibold text-zinc-900 mb-1">{t('void_bill_completely') || "Void Bill Completely?"}</AlertDialogTitle>
            <AlertDialogDescription className="font-medium text-zinc-500 text-sm mt-2">
              {t('void_bill_desc') || "This will permanently delete Order"} <span className="font-semibold text-zinc-900">{voidingOrder?.order_number}</span> {t('from_ledger_desc') || "from the ledger and reverse the transaction metrics. This cannot be undone."}
            </AlertDialogDescription>
          </div>
          <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="h-11 rounded-xl font-semibold border-zinc-200 text-zinc-700 w-full mt-0 bg-white shadow-sm hover:bg-zinc-50">{t('keep_bill') || "Keep Bill"}</AlertDialogCancel>
            <Button onClick={handleVoidOrder} className="h-11 rounded-xl font-semibold bg-rose-600 hover:bg-rose-700 text-white w-full shadow-sm active:scale-[0.98] transition-all">
              {t('yes_void_bill') || "Yes, Void Bill"}
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}