import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import {
  Calendar as CalendarIcon, CreditCard, Banknote, ShoppingBag, 
  ArrowUpRight, ArrowDownLeft, Filter, MessageCircle, WalletCards
} from "lucide-react";
import { format } from "date-fns";

type OrderWithDetails = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  status: string;
  customers?: { full_name: string | null; phone_number: string | null } | null;
  order_items: {
    quantity: number;
    price_at_order: number;
    items: { item_name: string } | null;
  }[];
  payments: {
    amount: number;
    payment_method: string;
  }[];
  items_count: number;
  amount_paid: number;
  balance_due: number;
};

export default function Sales() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("Our Store");
  
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>({
    from: new Date(),
    to: new Date()
  });
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [orders, setOrders] = useState<OrderWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeTenantData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profileData } = await (supabase as any).from("profiles").select("tenant_id").eq("id", session.user.id).single();
        const profile = profileData as { tenant_id: string | null } | null;

        if (profile?.tenant_id) {
          setCurrentTenantId(profile.tenant_id);
          const { data: tenantData } = await (supabase as any).from("tenants").select("tenant_name").eq("id", profile.tenant_id).single();
          const tenant = tenantData as { tenant_name: string } | null;
          if (tenant) setTenantName(tenant.tenant_name);
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      }
    };
    initializeTenantData();
  }, []);

  useEffect(() => {
    if (currentTenantId && dateRange.from) fetchSalesData(currentTenantId);
  }, [dateRange.from, dateRange.to, currentTenantId]);

  const fetchSalesData = async (tenantId: string) => {
    setLoading(true);
    try {
      const start = new Date(dateRange.from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.to || dateRange.from);
      end.setHours(23, 59, 59, 999);

      const { data, error } = await (supabase as any)
        .from('orders')
        .select(`
          id, order_number, created_at, total_amount, payment_status, status,
          customers ( full_name, phone_number ),
          order_items ( quantity, price_at_order, items ( item_name ) ),
          payments ( amount, payment_method )
        `)
        .eq("tenant_id", tenantId) 
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;

      const formattedOrders: OrderWithDetails[] = (data || []).map((order: any) => {
        const amountPaid = order.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
        return {
          ...order,
          items_count: order.order_items?.reduce((sum: number, item: any) => sum + Math.abs(item.quantity), 0) || 0,
          amount_paid: amountPaid,
          balance_due: Math.max(0, order.total_amount - amountPaid)
        };
      });

      setOrders(formattedOrders);
    } catch (error) {
      console.error("Error fetching sales:", error);
    } finally {
      setLoading(false);
    }
  };

  const shareOnWhatsApp = (order: OrderWithDetails) => {
    const phone = order.customers?.phone_number;
    if (!phone) return;
    
    const PUBLIC_DOMAIN = "https://retail.biillo.com"; 
    const invoiceLink = `${PUBLIC_DOMAIN}/#/invoice/${order.id}`;
    
    const message = encodeURIComponent(
      `🙏 Thank you for shopping at *${tenantName}*!\n\n` +
      `🧾 Order No: ${order.order_number}\n` +
      `💰 Total Amount: ₹${Math.abs(order.total_amount)}\n\n` +
      `View your E-Receipt here:\n${invoiceLink}`
    );
    
    const cleanPhone = phone.replace(/\D/g, '');
    window.open(`https://wa.me/91${cleanPhone}?text=${message}`, "_blank");
  };

  const filteredOrders = useMemo(() => {
    if (statusFilter === "ALL") return orders;
    return orders.filter(order => order.payment_status === statusFilter);
  }, [orders, statusFilter]);

  const stats = useMemo(() => {
    return filteredOrders.reduce(
      (acc, order) => {
        const isReturn = order.total_amount < 0;
        const gross = order.total_amount; 
        
        acc.grossRevenue += gross;
        acc.pendingUdhaar += (isReturn ? -order.balance_due : order.balance_due);

        if (order.payments && order.payments.length > 0) {
          order.payments.forEach(payment => {
            const amt = isReturn ? -payment.amount : payment.amount;
            acc.totalCollected += amt;
            if (payment.payment_method === 'CASH') acc.cashCollected += amt;
            else acc.onlineCollected += amt;
          });
        }
        return acc;
      },
      { grossRevenue: 0, totalCollected: 0, cashCollected: 0, onlineCollected: 0, pendingUdhaar: 0 }
    );
  }, [filteredOrders]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  const getStatusIndicator = (order: OrderWithDetails) => {
    if (order.total_amount < 0) {
      return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-rose-200 bg-rose-50 text-[10px] font-bold text-rose-700 uppercase tracking-wider">Refund</span>;
    }
    if (order.payment_status === 'PENDING') {
      return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-amber-200 bg-amber-50 text-[10px] font-bold text-amber-700 uppercase tracking-wider">Unpaid Due</span>;
    }
    if (order.payment_status === 'PARTIAL') {
      return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-700 uppercase tracking-wider">Advance</span>;
    }
    return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">Paid</span>;
  };

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-fade-in pb-24 md:pb-12 font-sans">
          
          {/* --- SOFTWARE-STYLE HEADER --- */}
          <div className="flex flex-col md:flex-row justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none truncate">
                Revenue Ledger
              </h1>
              <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block truncate">
                Analyze sales performance, transactions, and pending balances.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-2 shrink-0 w-full md:w-auto">
              {/* Date Range Picker */}
              <div className="w-full sm:w-auto flex-1 sm:max-w-xs">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start h-10 font-bold text-xs border-zinc-200 shadow-sm text-zinc-800 hover:bg-zinc-50 rounded-xl transition-all">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5 text-zinc-400 shrink-0" />
                      <span className="truncate">
                        {dateRange.from ? (
                          dateRange.to ? <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")
                        ) : <span>Select Date Range</span>}
                      </span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="end">
                    <Calendar
                      mode="range" defaultMonth={dateRange.from} selected={dateRange}
                      onSelect={(range: any) => { if (!range) setDateRange({ from: new Date() }); else setDateRange(range); }}
                      initialFocus numberOfMonths={1} className="rounded-2xl"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              {/* Status Filter */}
              <div className="w-full sm:w-auto">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[150px] h-10 border-zinc-200 bg-white text-zinc-800 font-bold text-xs shadow-sm rounded-xl outline-none focus:ring-1 focus:ring-zinc-900 transition-all">
                    <Filter className="w-3.5 h-3.5 mr-1.5 text-zinc-400"/>
                    <SelectValue placeholder="Status" />
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

          {/* --- DYNAMIC METRICS GRID --- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            
            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl sm:rounded-3xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Gross Revenue</span>
                  <div className="h-7 w-7 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center"><ArrowUpRight className="h-4 w-4 text-zinc-400" /></div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{formatCurrency(stats.grossRevenue)}</div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-emerald-100 bg-emerald-50/50 rounded-2xl sm:rounded-3xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Collected</span>
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-900">{formatCurrency(stats.totalCollected)}</div>
                <div className="flex items-center gap-3 text-[10px] font-bold text-emerald-700/80 mt-2">
                  <span>Cash: <span className="text-emerald-700">{formatCurrency(stats.cashCollected)}</span></span>
                  <span>Digi: <span className="text-emerald-700">{formatCurrency(stats.onlineCollected)}</span></span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl sm:rounded-3xl sm:col-span-2 lg:col-span-2 hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex justify-between items-center mb-3">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pending Bookings / Due</span>
                  <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" />
                </div>
                <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4 mt-auto">
                  <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{formatCurrency(stats.pendingUdhaar)}</div>
                  <div className="text-[11px] font-medium text-zinc-400">Unpaid invoices & remaining advance balances</div>
                </div>
              </CardContent>
            </Card>

          </div>

          {/* --- TRANSACTION LEDGER --- */}
          <div className="bg-white border border-zinc-200 shadow-sm rounded-3xl overflow-hidden">
            <div className="px-5 py-4 border-b border-zinc-100 flex justify-between items-center bg-zinc-50/50">
               <div className="flex items-center gap-2">
                 <h2 className="text-sm font-bold text-zinc-900">Transaction Ledger</h2>
                 <span className="px-2 py-0.5 text-[10px] font-bold bg-white border border-zinc-200 text-zinc-500 rounded-md shadow-sm">{filteredOrders.length}</span>
               </div>
               <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 hidden sm:inline">Tap row to expand</span>
            </div>

            {loading ? (
               <div className="text-center py-20 text-zinc-400 font-medium text-sm flex flex-col items-center gap-3">
                 <div className="animate-spin rounded-full h-5 w-5 border-2 border-zinc-900 border-t-transparent" />
                 <span>Loading transaction ledger...</span>
               </div>
            ) : filteredOrders.length === 0 ? (
               <div className="text-center py-24 flex flex-col items-center px-4">
                 <div className="h-12 w-12 rounded-2xl bg-zinc-50 border border-zinc-200 flex items-center justify-center mb-4 text-zinc-400">
                   <ShoppingBag className="h-5 w-5" />
                 </div>
                 <p className="text-zinc-900 font-bold text-base">No transactions found</p>
                 <p className="text-zinc-500 text-sm mt-1 max-w-sm font-medium">Adjust your date range or status filters to view records.</p>
               </div>
            ) : (
              <Accordion type="single" collapsible className="w-full divide-y divide-zinc-100">
                {filteredOrders.map((order) => {
                  const isReturn = order.total_amount < 0;
                  let primaryMethodStr = "Unpaid";
                  if (order.payments && order.payments.length > 0) {
                    const methods = Array.from(new Set(order.payments.map(p => p.payment_method)));
                    primaryMethodStr = methods.length > 1 ? "Multiple" : methods[0];
                  }

                  return (
                    <AccordionItem 
                      key={order.id} 
                      value={order.id} 
                      className="border-0 px-4 sm:px-5 hover:bg-zinc-50/50 transition-colors"
                    >
                      <AccordionTrigger className="hover:no-underline py-4 sm:py-5 group">
                        <div className="flex items-center justify-between w-full pr-2 min-w-0">
                          
                          {/* Left Side: Icon, Customer Name & Time */}
                          <div className="flex items-center gap-3 sm:gap-4 text-left min-w-0 flex-1 mr-3">
                            <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl flex items-center justify-center shrink-0 border transition-colors
                              ${isReturn ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-white border-zinc-200 text-zinc-700 shadow-sm group-hover:border-zinc-300'}
                            `}>
                              {isReturn ? <ArrowDownLeft className="h-5 w-5" /> : <ShoppingBag className="h-5 w-5" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="text-sm font-bold text-zinc-900 leading-snug truncate">
                                {order.customers?.full_name || "Walk-in Customer"}
                              </div>
                              <div className="text-[11px] font-semibold text-zinc-500 flex items-center gap-1.5 mt-0.5">
                                <span className="font-mono text-zinc-400 hidden sm:inline">{order.order_number}</span>
                                <span className="hidden sm:inline">•</span>
                                <span>{format(new Date(order.created_at), "MMM d, h:mm a")}</span>
                              </div>
                            </div>
                          </div>

                          {/* Right Side: Amount & Status */}
                          <div className="text-right flex flex-col items-end gap-1.5 shrink-0">
                            <div className={`text-base sm:text-lg font-bold tracking-tight ${isReturn ? 'text-rose-600' : 'text-zinc-900'}`}>
                              {formatCurrency(order.total_amount)}
                            </div>
                            {getStatusIndicator(order)}
                          </div>

                        </div>
                      </AccordionTrigger>
                      
                      <AccordionContent className="pb-5 pt-1">
                        <div className="bg-zinc-50 border border-zinc-200/80 rounded-2xl p-4 sm:p-5 sm:ml-16 space-y-4 shadow-sm">
                          
                          {/* Mobile Order No Fallback */}
                          <div className="sm:hidden pb-3 border-b border-zinc-200/60 flex justify-between items-center text-xs">
                              <span className="font-bold text-zinc-500 uppercase tracking-widest text-[10px]">Order Ref</span>
                              <span className="font-mono text-zinc-700 font-bold bg-white border border-zinc-200 px-2 py-1 rounded shadow-sm">{order.order_number}</span>
                          </div>

                          {/* Payment Split Breakdown */}
                          <div className="pb-4 border-b border-zinc-200/80 grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Amount Collected</p>
                              <div className="text-base font-bold text-zinc-900 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                {formatCurrency(order.amount_paid)} 
                                {order.amount_paid > 0 && (
                                  <span className="text-[9px] font-bold text-zinc-500 uppercase px-1.5 py-0.5 bg-zinc-100 rounded border border-zinc-200 inline-block w-fit">
                                    {primaryMethodStr}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 mb-1">Balance Pending</p>
                              <div className={`text-base font-bold ${order.balance_due > 0 ? 'text-amber-600' : 'text-zinc-300'}`}>
                                {formatCurrency(order.balance_due)}
                              </div>
                            </div>
                          </div>

                          {/* Multi-Payment Details */}
                          {order.payments && order.payments.length > 1 && (
                             <div className="pb-3 border-b border-zinc-200/60 space-y-2">
                               <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Payment Breakdown</p>
                               {order.payments.map((p, i) => (
                                 <div key={i} className="flex justify-between items-center text-xs font-bold text-zinc-700 bg-white px-3 py-1.5 rounded-lg border border-zinc-100 shadow-sm">
                                   <span className="flex items-center gap-2">
                                     {p.payment_method === 'CASH' ? <Banknote size={12} className="text-emerald-500"/> : <WalletCards size={12} className="text-blue-500"/>}
                                     {p.payment_method}
                                   </span>
                                   <span>{formatCurrency(p.amount)}</span>
                                 </div>
                               ))}
                             </div>
                          )}

                          {/* Line Items List */}
                          <div className="space-y-2 pt-1">
                            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">Order Items</p>
                            {order.order_items.map((bi, idx) => (
                              <div key={idx} className="flex justify-between items-start text-xs sm:text-sm bg-white p-3 rounded-xl border border-zinc-200 shadow-sm">
                                <div className="flex items-start gap-2 min-w-0 pr-2">
                                  <span className="font-bold text-zinc-400 text-xs shrink-0 mt-0.5">{Math.abs(bi.quantity)}×</span>
                                  <span className="font-bold text-zinc-800 leading-tight">{bi.items?.item_name || "Unknown Item"}</span>
                                </div>
                                <span className="font-bold text-zinc-900 shrink-0">₹{Math.abs(bi.quantity * bi.price_at_order)}</span>
                              </div>
                            ))}
                          </div>

                          {/* WHATSAPP SHARE ACTION BAR */}
                          <div className="mt-4 pt-4 border-t border-zinc-200/80 flex">
                            <Button 
                              variant="outline" 
                              className="w-full h-11 bg-white text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200 font-bold text-xs sm:text-sm rounded-xl shadow-sm transition-colors"
                              onClick={() => shareOnWhatsApp(order)}
                              disabled={!order.customers?.phone_number}
                            >
                              <MessageCircle className={`h-4 w-4 mr-2 ${order.customers?.phone_number ? 'text-emerald-500' : 'text-zinc-300'}`} /> 
                              {order.customers?.phone_number ? "Send E-Receipt via WhatsApp" : "No Phone Number Attached"}
                            </Button>
                          </div>

                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  );
                })}
              </Accordion>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}