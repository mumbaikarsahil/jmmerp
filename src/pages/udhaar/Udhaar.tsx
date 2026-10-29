import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Search, Phone, MessageCircle, CheckCircle2, AlertCircle, 
  Wallet, Download, Receipt, X, Banknote, ChevronDown, Filter, Calendar as CalendarIcon
} from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER";

type OrderWithLedger = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  customer_id: string | null;
  source: string | null;
  customers?: {
    full_name: string | null;
    phone_number: string | null;
  } | null;
  payments?: {
    amount: number;
  }[];
  amount_paid: number;
  balance_due: number;
};

export default function Udhaar() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string>("Our Store");
  
  const [orders, setOrders] = useState<OrderWithLedger[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters & Views
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<'INVOICE' | 'CUSTOMER'>('CUSTOMER');
  
  // DEFAULT TO CURRENT MONTH
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    return { from: firstDay, to: now };
  });

  // PAGINATION STATE
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 50;
  
  // Settle Modal State (Now supports bulk settling)
  const [selectedOrders, setSelectedOrders] = useState<OrderWithLedger[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [settlementAmount, setSettlementAmount] = useState<string>("");
  const [isSettling, setIsSettling] = useState(false);

  // Reset pagination on filter or view mode changes
  useEffect(() => { setCurrentPage(1); }, [searchQuery, sourceFilter, viewMode, dateRange]);

  useEffect(() => {
    const initializeTenantData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const { data: profileData } = await (supabase as any)
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();
          
        if (profileData?.tenant_id) {
          setCurrentTenantId(profileData.tenant_id);
          const { data: tenant } = await supabase.from("tenants").select("tenant_name").eq("id", profileData.tenant_id).single();
          if (tenant) setTenantName((tenant as any).tenant_name);
        }
      } catch (error) {
        console.error("Failed to initialize:", error);
      }
    };
    initializeTenantData();
  }, []);

  useEffect(() => { 
    if (currentTenantId && dateRange.from) fetchPendingOrders(currentTenantId); 
  }, [dateRange.from, dateRange.to, currentTenantId]);

  useEffect(() => {
    if (selectedOrders.length > 0) {
      const totalDue = selectedOrders.reduce((sum, o) => sum + o.balance_due, 0);
      setSettlementAmount(totalDue.toString());
    } else {
      setSettlementAmount("");
    }
  }, [selectedOrders]);

  useEffect(() => {
    const handlePopState = () => { if (selectedOrders.length > 0) setSelectedOrders([]); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedOrders]);

  const openSettleModal = (ordersToSettle: OrderWithLedger[]) => {
    setSelectedOrders(ordersToSettle);
    if (window.innerWidth < 1024) {
      window.history.pushState({ modal: 'settle' }, '', window.location.pathname + '#settle');
    }
  };

  const closeSettleModal = () => {
    if (window.location.hash === '#settle') window.history.back(); 
    else setSelectedOrders([]);
  };

  const fetchPendingOrders = async (tenantId: string) => {
    try {
      setLoading(true);
      const start = new Date(dateRange.from); start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.to || dateRange.from); end.setHours(23, 59, 59, 999);

      let allOrders: any[] = [];
      let isFetchingOrders = true;
      let pageIndex = 0;
      const CHUNK_SIZE = 1000;

      while (isFetchingOrders) {
        const { data, error } = await (supabase as any)
          .from("orders")
          .select(`
            id, order_number, created_at, total_amount, payment_status, customer_id, source,
            customers (full_name, phone_number),
            payments (amount)
          `)
          .in("payment_status", ["PENDING", "PARTIAL"]) 
          .eq("tenant_id", tenantId)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString())
          .order("created_at", { ascending: false })
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
      
      const mappedOrders: OrderWithLedger[] = allOrders.map((ord: any) => {
        const amountPaid = ord.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
        return {
          ...ord,
          amount_paid: amountPaid,
          balance_due: Math.max(0, ord.total_amount - amountPaid)
        };
      }).filter((ord: OrderWithLedger) => ord.balance_due > 0);
      
      setOrders(mappedOrders);
    } catch (error: any) {
      toast({ title: t('error') || "Error", description: t('failed_load_ledger') || "Failed to load pending payments.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePayment = async () => {
    if (selectedOrders.length === 0 || !currentTenantId) return;
    
    const amountReceived = parseFloat(settlementAmount);
    if (isNaN(amountReceived) || amountReceived <= 0) {
      return toast({ title: t('invalid_amount') || "Invalid Amount", description: t('enter_valid_amount') || "Please enter a valid payment amount.", variant: "destructive" });
    }

    const totalDue = selectedOrders.reduce((sum, o) => sum + o.balance_due, 0);
    if (amountReceived > totalDue) {
      return toast({ title: t('amount_exceeded') || "Amount Exceeded", description: `Cannot collect more than ₹${totalDue}`, variant: "destructive" });
    }

    setIsSettling(true);
    try {
      let remainingAllocation = amountReceived;
      
      // Sort oldest orders first so they get paid off first
      const sortedOrders = [...selectedOrders].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

      for (const order of sortedOrders) {
        if (remainingAllocation <= 0) break;

        const allocationForThisOrder = Math.min(remainingAllocation, order.balance_due);
        
        const { error: paymentError } = await (supabase as any).from("payments").insert({
          tenant_id: currentTenantId,
          order_id: order.id,
          customer_id: order.customer_id,
          amount: allocationForThisOrder,
          payment_method: paymentMethod,
          payment_type: "SETTLEMENT",
          payment_date: new Date().toISOString()
        });

        if (paymentError) throw paymentError;

        const newStatus = allocationForThisOrder === order.balance_due ? "PAID" : "PARTIAL";
        const { error: orderError } = await (supabase as any)
          .from("orders")
          .update({ payment_status: newStatus })
          .eq("id", order.id)
          .eq("tenant_id", currentTenantId);

        if (orderError) throw orderError;

        remainingAllocation -= allocationForThisOrder;
      }

      toast({
        title: remainingAllocation === 0 && amountReceived === totalDue ? (t('payment_complete') || "Payment Complete") : (t('partial_payment') || "Partial Payment Received"),
        description: `Collected ₹${amountReceived} via ${paymentMethod}.`,
      });

      closeSettleModal();
      fetchPendingOrders(currentTenantId);
    } catch (error: any) {
      toast({ title: t('settlement_error') || "Settlement Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSettling(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      return toast({ title: t('no_data') || "No data to export", variant: "destructive" });
    }

    const headers = ["Invoice No", "Date", "Customer Name", "Phone", "Type", "Total Bill (INR)", "Amount Paid (INR)", "Pending Balance (INR)"];
    const rows = filteredOrders.map((o) => [
      `"${o.order_number || 'N/A'}"`,
      `"${format(new Date(o.created_at), "dd MMM yyyy")}"`,
      `"${(o.customers?.full_name || 'Walk-in').replace(/"/g, '""')}"`,
      `"${o.customers?.phone_number || 'N/A'}"`,
      `"${o.source?.replace('_', ' ') || 'Walk-in'}"`,
      Math.abs(o.total_amount).toFixed(2),
      (o.amount_paid || 0).toFixed(2),
      o.balance_due.toFixed(2),
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Pending_Ledger_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sendWhatsAppReminder = (customer: any, orders: OrderWithLedger[], totalDue: number) => {
    const phone = customer?.phone_number;
    if (!phone) {
      return toast({ title: t('phone_missing') || "Phone Missing", description: t('no_phone_attached') || "This record has no customer phone number attached.", variant: "destructive" });
    }

    const orderNumbers = orders.map(o => o.order_number).join(", ");
    const customerName = customer?.full_name || 'Customer';
    
    const messageText = `🙏 Hello ${customerName},\n\nThis is a gentle reminder regarding your pending payment of *₹${totalDue}* for the following order(s): ${orderNumbers}.\n\nPlease arrange to clear the pending balance at your earliest convenience.\n\nThank you!\n*${tenantName}*`;

    const message = encodeURIComponent(messageText);
    window.open(`https://wa.me/91${phone.replace(/\D/g,'')}?text=${message}`, "_blank");
  };

  // 1. Core Filtering
  const filteredOrders = useMemo(() => {
    let result = orders;
    if (sourceFilter !== "ALL") {
      result = result.filter(o => o.source === sourceFilter);
    }
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(o => 
        (o.customers?.full_name?.toLowerCase() || "").includes(q) ||
        (o.customers?.phone_number || "").includes(q) ||
        (o.order_number?.toLowerCase() || "").includes(q)
      );
    }
    return result;
  }, [orders, searchQuery, sourceFilter]);

  // 2. Customer Grouping Engine (For Settle All functionality)
  const groupedCustomers = useMemo(() => {
    const map = new Map<string, { customer: any, orders: OrderWithLedger[], totalDue: number }>();
    
    filteredOrders.forEach(o => {
      const cid = o.customer_id || `walkin-${o.id}`; 
      if (!map.has(cid)) {
        map.set(cid, { customer: o.customers, orders: [], totalDue: 0 });
      }
      const entry = map.get(cid)!;
      entry.orders.push(o);
      entry.totalDue += o.balance_due;
    });
    
    return Array.from(map.values()).sort((a, b) => b.totalDue - a.totalDue);
  }, [filteredOrders]);

  const totalPending = useMemo(() => filteredOrders.reduce((sum, ord) => sum + ord.balance_due, 0), [filteredOrders]);

  // 3. Paginated Data Derivatives
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  const paginatedCustomers = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return groupedCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [groupedCustomers, currentPage]);

  const totalPages = viewMode === 'CUSTOMER' 
    ? Math.ceil(groupedCustomers.length / ITEMS_PER_PAGE) 
    : Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <AppLayout>
      <div className="w-full bg-zinc-50/50 min-h-screen">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6 pb-24 md:pb-12 font-sans">
          
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-zinc-200/80">
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-zinc-900 leading-none truncate">
                {t('pending_ledger') || "Pending Ledger"}
              </h1>
              <p className="text-xs font-medium text-zinc-500 mt-1.5 truncate">
                {t('track_advances') || "Track advances and unsettled collections."}
              </p>
            </div>

            <div className="flex items-center gap-3 bg-white border border-rose-100 rounded-2xl p-2 pr-4 shadow-sm w-full md:w-auto">
              <div className="h-10 w-10 bg-rose-50 border border-rose-100 rounded-xl flex items-center justify-center shrink-0">
                <AlertCircle className="h-5 w-5 text-rose-500" />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-0.5">
                  {t('outstanding') || "Outstanding"} ({filteredOrders.length})
                </span>
                <span className="text-lg font-semibold tracking-tight text-rose-600 leading-none">
                  {formatCurrency(totalPending)}
                </span>
              </div>
            </div>
          </div>

          {/* --- SMART TOOLBAR --- */}
          <div className="flex flex-col lg:flex-row gap-3 bg-white p-3 rounded-2xl border border-zinc-200/80 shadow-sm">
            
            {/* View Toggle */}
            <div className="flex bg-zinc-100/80 p-1 rounded-xl w-full lg:w-auto shrink-0 border border-zinc-200/80">
              <button onClick={() => setViewMode('CUSTOMER')} className={`flex-1 lg:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${viewMode === 'CUSTOMER' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>By Customer</button>
              <button onClick={() => setViewMode('INVOICE')} className={`flex-1 lg:px-4 py-2 rounded-lg text-xs font-semibold transition-all ${viewMode === 'INVOICE' ? 'bg-white shadow-sm text-zinc-900' : 'text-zinc-500 hover:text-zinc-700'}`}>By Invoice</button>
            </div>

            <div className="flex gap-3 flex-1 flex-col sm:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  placeholder={t('search_customer') || "Search by name, phone, or invoice..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 bg-white shadow-sm border-zinc-200/80 rounded-xl font-medium text-sm focus-visible:ring-zinc-900"
                />
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto justify-start h-11 font-medium text-sm border-zinc-200/80 shadow-sm text-zinc-800 hover:bg-zinc-50 rounded-xl transition-all">
                      <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400 shrink-0" />
                      <span className="truncate">{dateRange.from ? (dateRange.to ? <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}</> : format(dateRange.from, "LLL dd, y")) : <span>Select Date</span>}</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="end">
                    <Calendar mode="range" defaultMonth={dateRange.from} selected={dateRange} onSelect={(r: any) => setDateRange(r || { from: new Date() })} initialFocus numberOfMonths={1} className="rounded-2xl" />
                  </PopoverContent>
                </Popover>

                <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="flex-1 sm:w-[130px] h-11 border-zinc-200/80 bg-white text-zinc-800 font-medium text-sm shadow-sm rounded-xl outline-none focus:ring-1 focus:ring-zinc-900">
                    <Filter className="w-4 h-4 mr-1.5 text-zinc-400"/><SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent className="rounded-xl border-zinc-200 shadow-lg">
                    <SelectItem value="ALL" className="font-medium text-sm">{t('all_types') || "All Types"}</SelectItem>
                    <SelectItem value="WALK_IN" className="font-medium text-sm">{t('walk_in') || "Walk-In"}</SelectItem>
                    <SelectItem value="ONLINE" className="font-medium text-sm">{t('online') || "Online"}</SelectItem>
                    <SelectItem value="MONTHLY" className="font-medium text-sm">{t('monthly') || "Monthly"}</SelectItem>
                  </SelectContent>
                </Select>

                <Button onClick={handleExportCSV} disabled={loading || filteredOrders.length === 0} className="h-11 px-4 rounded-xl font-medium bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shrink-0 active:scale-[0.98] transition-transform">
                  <Download className="sm:mr-2 h-4 w-4" /> <span className="hidden sm:inline">Export</span>
                </Button>
              </div>
            </div>
          </div>

          {/* --- LIST VIEWS --- */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-20 text-zinc-500 font-medium text-sm flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-300 border-t-zinc-700" />
                <span>{t('loading_ledger') || "Loading ledger..."}</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card className="border border-zinc-200 shadow-sm bg-white rounded-3xl">
                <CardContent className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                  </div>
                  <p className="text-zinc-900 font-semibold text-lg">
                    {searchQuery ? (t('no_matching') || "No matching records found") : (t('all_clear') || "All collections clear!")}
                  </p>
                  <p className="text-zinc-500 text-sm mt-1 max-w-sm text-center font-medium">
                    {searchQuery ? "Try searching with a different keyword." : "There are no pending balances for this date range."}
                  </p>
                </CardContent>
              </Card>
            ) : viewMode === 'CUSTOMER' ? (
              
              /* BY CUSTOMER (BULK) VIEW */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {paginatedCustomers.map((group, idx) => (
                  <Card key={idx} className="overflow-hidden border border-zinc-200/80 shadow-sm rounded-2xl bg-white hover:shadow-md transition-all flex flex-col group">
                    <CardContent className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-2 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-100">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest">{group.orders.length} Bills</span>
                          </div>
                          <div className="text-right">
                            <div className="text-xl font-semibold tracking-tight text-rose-600 leading-none">{formatCurrency(group.totalDue)}</div>
                          </div>
                        </div>

                        <div className="mb-5">
                          <div className="font-semibold text-base text-zinc-900 leading-tight truncate">{group.customer?.full_name || "Walk-in Customer"}</div>
                          <div className="flex items-center gap-2 mt-2 text-xs font-medium text-zinc-500">
                            <Phone className="h-3.5 w-3.5 text-zinc-400" />
                            {group.customer?.phone_number || "No Phone"}
                          </div>
                        </div>

                        <div className="pt-3 border-t border-zinc-100 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto scrollbar-none">
                          {group.orders.map(o => (
                            <span key={o.id} className="text-[10px] font-medium bg-zinc-50 border border-zinc-200 text-zinc-500 px-1.5 py-0.5 rounded uppercase">
                              {o.order_number}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div className="flex gap-2 mt-5">
                        <Button variant="outline" className="flex-1 h-10 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200 font-semibold text-xs rounded-xl shadow-sm"
                          onClick={() => sendWhatsAppReminder(group.customer, group.orders, group.totalDue)}
                          disabled={!group.customer?.phone_number}
                        >
                          <MessageCircle className={`h-3.5 w-3.5 mr-1.5 ${group.customer?.phone_number ? 'text-emerald-500' : 'text-zinc-300'}`} /> Remind
                        </Button>
                        <Button className="flex-1 h-10 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl shadow-sm active:scale-[0.98] transition-transform"
                          onClick={() => openSettleModal(group.orders)}
                        >
                          <Wallet className="h-3.5 w-3.5 mr-1.5" /> Settle All
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

            ) : (

              /* BY INVOICE (INDIVIDUAL) VIEW */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {paginatedOrders.map((order) => {
                  const isAdvance = order.amount_paid > 0;
                  return (
                    <Card key={order.id} className="overflow-hidden border border-zinc-200/80 shadow-sm rounded-2xl bg-white hover:shadow-md transition-all flex flex-col group">
                      <CardContent className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                              <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-widest">{t('pending') || "Pending"}</span>
                            </div>
                            <div className="text-right">
                              <div className="text-xl font-semibold tracking-tight text-rose-600 leading-none">{formatCurrency(order.balance_due)}</div>
                            </div>
                          </div>

                          <div className="mb-5">
                            <div className="font-semibold text-base text-zinc-900 leading-tight truncate">{order.customers?.full_name || "Walk-in Customer"}</div>
                            <div className="flex flex-col gap-1.5 mt-2">
                              {order.customers?.phone_number && (
                                <div className="flex items-center gap-2 text-xs font-medium text-zinc-500">
                                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                                  {order.customers.phone_number}
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-xs font-mono font-medium text-zinc-500">
                                <Receipt className="h-3.5 w-3.5 text-zinc-400" />
                                {order.order_number}
                              </div>
                            </div>
                          </div>

                          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                            <span className="text-zinc-500 font-medium">{format(new Date(order.created_at), "dd MMM yyyy")}</span>
                            {isAdvance ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-zinc-50 text-zinc-600 border border-zinc-200/80">
                                Paid: ₹{order.amount_paid}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold bg-zinc-50 text-zinc-400 border border-zinc-100">
                                Zero Adv
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex gap-2 mt-4">
                          <Button variant="outline" className="flex-1 h-10 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200 font-semibold text-xs rounded-xl shadow-sm"
                            onClick={() => sendWhatsAppReminder(order.customers, [order], order.balance_due)}
                            disabled={!order.customers?.phone_number}
                          >
                            <MessageCircle className={`h-3.5 w-3.5 mr-1.5 ${order.customers?.phone_number ? 'text-emerald-500' : 'text-zinc-300'}`} /> Remind
                          </Button>
                          <Button className="flex-1 h-10 bg-zinc-900 hover:bg-zinc-800 text-white font-semibold text-xs rounded-xl shadow-sm active:scale-[0.98] transition-transform"
                            onClick={() => openSettleModal([order])}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1.5" /> Settle
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
            
            {/* Pagination Controls */}
            {!loading && totalPages > 1 && (
              <div className="flex items-center justify-between bg-white border border-zinc-200/80 shadow-sm rounded-xl px-4 py-3 mt-4">
                <span className="text-xs font-medium text-zinc-500">
                  Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, viewMode === 'CUSTOMER' ? groupedCustomers.length : filteredOrders.length)} of {viewMode === 'CUSTOMER' ? groupedCustomers.length : filteredOrders.length} entries
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

        {/* --- SETTLE PAYMENT MODAL --- */}
        <Dialog open={selectedOrders.length > 0} onOpenChange={(open) => !open && closeSettleModal()}>
          <DialogContent className="fixed inset-x-0 bottom-0 top-auto sm:top-1/2 sm:-translate-y-1/2 sm:left-1/2 sm:-translate-x-1/2 w-full sm:max-w-md bg-white p-0 rounded-t-[24px] sm:rounded-2xl shadow-2xl border-t sm:border border-zinc-200 m-0 z-50 flex flex-col max-h-[90vh]">
            
            {/* Pull pill for mobile */}
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-200 sm:hidden shrink-0" />

            <div className="px-5 py-4 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center rounded-t-[24px] shrink-0 mt-2 sm:mt-0">
              <div>
                <DialogTitle className="text-base font-semibold tracking-tight text-zinc-900">
                  {selectedOrders.length > 1 ? "Bulk Settlement" : "Receive Payment"}
                </DialogTitle>
                <DialogDescription className="text-[11px] font-medium text-zinc-500 mt-0.5">
                  {selectedOrders.length > 1 ? `Settling ${selectedOrders.length} invoices` : "Record full or partial settlement."}
                </DialogDescription>
              </div>
              <button onClick={closeSettleModal} className="p-2 -mr-2 bg-white border border-zinc-200 rounded-lg text-zinc-500 hover:text-zinc-900 hover:bg-zinc-50 shadow-sm transition-colors hidden sm:block">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-5 space-y-6 overflow-y-auto">
              {/* Amount Status */}
              <div className="bg-rose-50/50 border border-rose-100 p-5 rounded-2xl flex items-center justify-between shadow-sm">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500/80 mb-1">Total Due</p>
                  <p className="text-3xl font-semibold tracking-tight text-rose-700">
                    {formatCurrency(selectedOrders.reduce((s,o) => s + o.balance_due, 0))}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-500/80 mb-1">Customer</p>
                  <p className="text-sm font-medium text-rose-900 truncate max-w-[120px]">
                    {selectedOrders[0]?.customers?.full_name || 'Walk-in'}
                  </p>
                </div>
              </div>

              {/* Editable Amount Input */}
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Amount Received (₹)</Label>
                <div className="relative">
                  <Input 
                    type="number"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="h-12 pl-10 text-lg font-medium rounded-xl border-zinc-200 focus-visible:ring-zinc-900 bg-white shadow-sm"
                    placeholder="Enter amount..."
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-medium text-lg">₹</span>
                </div>
              </div>

              {/* Method Select */}
              <div className="space-y-2">
                <Label className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Payment Method</Label>
                <div className="relative">
                  <select 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="h-12 w-full rounded-xl border border-zinc-200 bg-white px-10 text-sm font-medium shadow-sm focus:outline-none focus:ring-1 focus:ring-zinc-900 appearance-none"
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">CARD</option>
                    <option value="BANK_TRANSFER">BANK TRANSFER</option>
                  </select>
                  <Banknote className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                  <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 bg-white pb-safe shrink-0 sm:rounded-b-2xl shadow-[0_-4px_15px_rgba(0,0,0,0.02)]">
              <div className="flex gap-3">
                <Button variant="outline" onClick={closeSettleModal} className="flex-1 h-12 rounded-xl font-medium border-zinc-200 text-zinc-700 bg-white shadow-sm hover:bg-zinc-50">
                  Cancel
                </Button>
                <Button onClick={handleSettlePayment} disabled={isSettling} className="flex-1 h-12 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-medium shadow-sm transition-transform active:scale-[0.98]">
                  {isSettling ? "Processing..." : "Confirm Payment"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}