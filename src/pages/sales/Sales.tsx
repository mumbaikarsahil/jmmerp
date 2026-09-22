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
import {
  Calendar as CalendarIcon, Banknote, ShoppingBag, ArrowUpRight, ArrowDownLeft, Filter, 
  MessageCircle, WalletCards, Eye, Trash2, ChevronDown, ChevronUp, Printer, X
} from "lucide-react";
import { format } from "date-fns";
import { ThermalReceipt } from "@/components/receipts/ThermalReceipt";

type OrderWithDetails = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  status: string;
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
  "बेडगी", "लवंगी", "काश्मिरी", "मिरची", "धणे", "हळकुंड", "मिरी", "बडीशेप", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी",
  "हिंग", "मेथी", "राई", "जिरा", "पिंपळी", "सुंठ", "हिरवी वेलची", "गुलाब पाकळी", 
  "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
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
  const { toast } = useToast();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("Our Store");
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>({ from: new Date(), to: new Date() });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [voidingOrder, setVoidingOrder] = useState<OrderWithDetails | null>(null);
  const [previewOrder, setPreviewOrder] = useState<OrderWithDetails | null>(null);

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

      const { data, error } = await (supabase as any)
        .from('orders')
        .select(`
          id, order_number, created_at, total_amount, payment_status, status,
          customers ( full_name, phone_number ),
          order_items ( id, quantity, price_at_order, items ( item_name, base_unit, item_type, selling_price ) ),
          payments ( amount, payment_method )
        `)
        .eq("tenant_id", tenantId) 
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const { data: ingredientsData } = await (supabase as any)
        .from('order_item_ingredients')
        .select('order_item_id, custom_quantity, unit, items (item_name, base_unit, selling_price)')
        .in('order_item_id', data.flatMap((o: any) => o.order_items.map((oi: any) => oi.id)));

      const formattedOrders: OrderWithDetails[] = (data || []).map((order: any) => {
        const amountPaid = order.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
        
        let totalMixWeight = 0;
        const mappedItems = order.order_items.map((oi: any) => {
           const ings = (ingredientsData || []).filter((ing: any) => ing.order_item_id === oi.id);
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
    if (!phone) return toast({ title: "No Phone Found", variant: "destructive" });
    const invoiceLink = `https://retail.biillo.com/#/invoice/${order.id}`;
    const message = encodeURIComponent(`🙏 Thank you for shopping at *${tenantName}*!\n\n🧾 Order No: ${order.order_number}\n💰 Total Amount: ₹${Math.abs(order.total_amount)}\n\nView your E-Receipt here:\n${invoiceLink}`);
    window.open(`https://wa.me/91${phone.replace(/\D/g, '')}?text=${message}`, "_blank");
  };

  const handleVoidOrder = async () => {
    if (!voidingOrder || !currentTenantId) return;
    setLoading(true);
    try {
      const { error } = await (supabase as any).from('orders').delete().eq('id', voidingOrder.id).eq('tenant_id', currentTenantId);
      if (error) throw error;
      toast({ title: "Bill Voided", description: `Order ${voidingOrder.order_number} has been permanently removed.` });
      setVoidingOrder(null); fetchSalesData(currentTenantId);
    } catch (error: any) { toast({ title: "Failed to void bill", description: error.message, variant: "destructive" }); } finally { setLoading(false); }
  };

  const filteredOrders = useMemo(() => statusFilter === "ALL" ? orders : orders.filter(o => o.payment_status === statusFilter), [orders, statusFilter]);

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
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-fade-in pb-24 md:pb-12 font-sans print:hidden">
          
          <div className="flex flex-col md:flex-row justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none truncate">Revenue Ledger</h1>
              <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block truncate">Analyze sales performance, transactions, and pending balances.</p>
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full md:w-auto">
              <div className="w-full sm:w-auto flex-1 sm:max-w-xs">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start h-10 font-bold text-xs border-zinc-200 shadow-sm text-zinc-800 hover:bg-zinc-50 rounded-xl transition-all">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">{dateRange.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")) : <span>Select Date Range</span>}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="end">
                    <Calendar mode="range" defaultMonth={dateRange.from} selected={dateRange} onSelect={(r: any) => setDateRange(r || { from: new Date() })} initialFocus numberOfMonths={1} className="rounded-2xl" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="w-full sm:w-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[150px] h-10 border-zinc-200 bg-white text-zinc-800 font-bold text-xs shadow-sm rounded-xl outline-none focus:ring-1 focus:ring-zinc-900">
                    <Filter className="w-3.5 h-3.5 mr-1.5 text-zinc-400"/><SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-zinc-200 shadow-lg">
                    <SelectItem value="ALL" className="font-bold text-xs">All Records</SelectItem>
                    <SelectItem value="PAID" className="font-bold text-xs">Paid in Full</SelectItem>
                    <SelectItem value="PARTIAL" className="font-bold text-xs">Advances</SelectItem>
                    <SelectItem value="PENDING" className="font-bold text-xs">Unpaid Due</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Gross Revenue</span><ArrowUpRight className="h-4 w-4 text-zinc-400" /></div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{formatCurrency(stats.grossRevenue)}</div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border border-emerald-100 bg-emerald-50/50 rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Collected</span><span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" /></div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-900">{formatCurrency(stats.totalCollected)}</div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-emerald-700/80 mt-2"><span>Cash: {formatCurrency(stats.cashCollected)}</span><span>Digi: {formatCurrency(stats.onlineCollected)}</span></div>
              </CardContent>
            </Card>
            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl sm:col-span-2 hover:shadow-md transition-shadow">
              <CardContent className="p-4 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3"><span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pending / Due</span><span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" /></div>
                <div className="flex justify-between items-baseline mt-auto"><div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{formatCurrency(stats.pendingUdhaar)}</div><div className="text-[11px] font-semibold text-zinc-400 hidden sm:block">Unpaid balances</div></div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
               <div className="flex items-center gap-2"><h2 className="text-sm font-bold text-zinc-900">Transaction Ledger</h2><span className="px-2 py-0.5 text-[10px] font-bold bg-white border border-zinc-200 text-zinc-500 rounded-md shadow-sm">{filteredOrders.length}</span></div>
            </div>

            {loading ? (
               <div className="text-center py-20 text-zinc-400 font-semibold text-sm flex flex-col items-center gap-3"><div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-900 border-t-transparent" /><span>Loading ledger...</span></div>
            ) : filteredOrders.length === 0 ? (
               <div className="text-center py-24 flex flex-col items-center px-4"><div className="h-12 w-12 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-4 text-zinc-400"><ShoppingBag className="h-5 w-5" /></div><p className="text-zinc-900 font-bold text-base">No transactions found</p></div>
            ) : (
              <div className="flex flex-col divide-y divide-zinc-100">
                {filteredOrders.map((order) => {
                  const isReturn = order.total_amount < 0;
                  const isExpanded = expandedRowId === order.id;

                  return (
                    <div key={order.id} className="flex flex-col bg-white hover:bg-zinc-50/50 transition-colors">
                      {/* COMPACT RECORD LINE */}
                      <div className="flex flex-col md:flex-row md:items-center justify-between p-3 sm:p-4 gap-3">
                        
                        <div className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer" onClick={() => setExpandedRowId(isExpanded ? null : order.id)}>
                          <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${isReturn ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-zinc-200 text-zinc-700 shadow-sm'}`}>
                            {isReturn ? <ArrowDownLeft className="h-4 w-4" /> : <ShoppingBag className="h-4 w-4" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-zinc-900 truncate">{order.customers?.full_name || "Walk-in Customer"}</div>
                            <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5 mt-0.5">
                              <span className="font-mono text-zinc-400">{order.order_number}</span><span>•</span><span>{format(new Date(order.created_at), "MMM d, h:mm a")}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between md:justify-end gap-4 shrink-0 pl-12 md:pl-0">
                          <div className="flex flex-col items-start md:items-end min-w-[80px]">
                             <span className={`text-sm sm:text-base font-bold ${isReturn ? 'text-rose-600' : 'text-zinc-900'}`}>{formatCurrency(order.total_amount)}</span>
                             {order.payment_status === 'PENDING' ? <span className="text-[9px] font-bold text-amber-600 uppercase">Unpaid Due</span> : order.payment_status === 'PARTIAL' ? <span className="text-[9px] font-bold text-blue-600 uppercase">Advance</span> : <span className="text-[9px] font-bold text-emerald-600 uppercase">Paid</span>}
                          </div>
                          
                          {/* INLINE ACTION BAR */}
                          <div className="flex items-center gap-1 bg-white border border-zinc-200 p-1 rounded-xl shadow-sm">
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900" onClick={(e) => { e.stopPropagation(); setPreviewOrder(order); }}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" disabled={!order.customers?.phone_number} className="h-8 w-8 rounded-lg text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700" onClick={(e) => { e.stopPropagation(); shareOnWhatsApp(order); }}>
                              <MessageCircle className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-rose-50 hover:text-rose-600" onClick={(e) => { e.stopPropagation(); setVoidingOrder(order); }}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-4 bg-zinc-200 mx-1"></div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-zinc-400 hover:bg-zinc-100" onClick={() => setExpandedRowId(isExpanded ? null : order.id)}>
                              {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* COMPACT BREAKDOWN */}
                      {isExpanded && (
                        <div className="bg-zinc-50 border-t border-zinc-100 p-4 shadow-inner grid grid-cols-1 md:grid-cols-2 gap-4">
                           <div className="space-y-2">
                             <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Order Items</p>
                             {order.order_items.map((bi, idx) => {
                               const itemObj = getItemObj(bi.items);
                               return (
                               <div key={idx} className="flex justify-between items-start text-xs bg-white p-2.5 rounded-lg border border-zinc-200 shadow-sm">
                                 <div className="flex items-start gap-2 min-w-0 pr-2">
                                   <span className="font-bold text-zinc-400 text-xs shrink-0">{Math.abs(bi.quantity)}×</span>
                                   <span className="font-bold text-zinc-800 leading-tight">{itemObj?.item_name || "Unknown"}</span>
                                 </div>
                                 <span className="font-bold text-zinc-900 shrink-0">₹{Math.abs(bi.quantity * bi.price_at_order)}</span>
                               </div>
                             );})}
                           </div>
                           <div className="space-y-2">
                             <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Payment Breakdown</p>
                             {order.payments && order.payments.length > 0 ? order.payments.map((p, i) => (
                               <div key={i} className="flex justify-between items-center text-xs bg-white p-2.5 rounded-lg border border-zinc-200 shadow-sm">
                                 <span className="font-bold text-zinc-700">{p.payment_method}</span>
                                 <span className="font-bold text-emerald-600">{formatCurrency(p.amount)}</span>
                               </div>
                             )) : (
                               <div className="text-xs font-semibold text-zinc-400 italic bg-white p-2.5 rounded-lg border border-zinc-200 shadow-sm">No payments recorded.</div>
                             )}
                             {order.balance_due > 0 && (
                               <div className="flex justify-between items-center text-xs bg-rose-50 border border-rose-100 p-2.5 rounded-lg">
                                 <span className="font-bold text-rose-700">Pending Balance</span>
                                 <span className="font-bold text-rose-700">{formatCurrency(order.balance_due)}</span>
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
          </div>
        </div>
      </div>

      {/* --- CENTRAL BILLING FORMAT PREVIEW MODAL --- */}
      <Dialog open={!!previewOrder} onOpenChange={(open) => !open && setPreviewOrder(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-[32px] p-0 overflow-hidden bg-zinc-100 shadow-2xl border-zinc-200 flex flex-col max-h-[90dvh]">
          <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 bg-white shrink-0 shadow-sm z-10">
            <div>
              <DialogTitle className="text-base font-bold text-zinc-900">Receipt Preview</DialogTitle>
              <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mt-0.5">{previewOrder?.order_number}</p>
            </div>
            <button onClick={() => setPreviewOrder(null)} className="p-2 text-zinc-400 hover:text-zinc-900 hover:bg-zinc-100 rounded-full transition-colors active:scale-95"><X className="h-5 w-5" /></button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex justify-center">
            {/* Visually replicating the physical receipt on screen using properly normalized calculations */}
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
            <Button onClick={() => setTimeout(() => window.print(), 100)} className="h-14 w-full rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-[16px] font-bold text-white shadow-sm active:scale-[0.98] transition-transform">
              <Printer className="h-5 w-5 mr-2" /> Print Physical Receipt
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ThermalReceipt order={previewOrder} source="sales" />

      {/* VOID BILL CONFIRMATION MODAL */}
      <AlertDialog open={!!voidingOrder} onOpenChange={(open) => !open && setVoidingOrder(null)}>
        <AlertDialogContent aria-describedby={undefined} className="rounded-[24px] border-zinc-200 shadow-2xl p-0 overflow-hidden sm:max-w-sm">
          <div className="p-6 bg-white">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mb-4 shadow-inner">
              <Trash2 className="h-5 w-5 text-rose-500" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-zinc-900 mb-1">Void Bill Completely?</AlertDialogTitle>
            <AlertDialogDescription className="font-semibold text-zinc-500 text-sm mt-2">
              This will permanently delete Order <span className="font-bold text-zinc-800">{voidingOrder?.order_number}</span> from the ledger and reverse the transaction metrics. This cannot be undone.
            </AlertDialogDescription>
          </div>
          <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="h-12 rounded-xl font-bold border-zinc-200 text-zinc-700 w-full mt-0 bg-white shadow-sm hover:bg-zinc-100">Keep Bill</AlertDialogCancel>
            <Button onClick={handleVoidOrder} className="h-12 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white w-full shadow-sm active:scale-95 transition-transform">
              Yes, Void Bill
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}