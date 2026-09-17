import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import {
  Search, Phone, MessageCircle, CheckCircle2, AlertCircle, 
  Wallet, Clock, Download, Receipt, X, Banknote, CreditCard,
  ChevronDown
} from "lucide-react";
import { format } from "date-fns";

type PaymentMethod = "CASH" | "UPI" | "CARD" | "BANK_TRANSFER";

type OrderWithLedger = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  customer_id: string | null;
  customers?: {
    full_name: string | null;
    phone_number: string | null;
  } | null;
  payments?: {
    amount: number;
  }[];
  // Derived
  amount_paid: number;
  balance_due: number;
};

export default function Udhaar() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [orders, setOrders] = useState<OrderWithLedger[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Settle Modal State
  const [selectedOrder, setSelectedOrder] = useState<OrderWithLedger | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [settlementAmount, setSettlementAmount] = useState<string>("");
  const [isSettling, setIsSettling] = useState(false);
  
  const { toast } = useToast();

  const totalPending = useMemo(() => orders.reduce((sum, ord) => sum + ord.balance_due, 0), [orders]);

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
          
        const profile = profileData as { tenant_id: string | null } | null;

        if (profile?.tenant_id) {
          setCurrentTenantId(profile.tenant_id);
          fetchPendingOrders(profile.tenant_id);
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      }
    };
    initializeTenantData();
  }, []);

  // Pre-fill settlement amount when a bill is selected
  useEffect(() => {
    if (selectedOrder) {
      setSettlementAmount(selectedOrder.balance_due.toString());
    } else {
      setSettlementAmount("");
    }
  }, [selectedOrder]);

  // --- HARDWARE BACK BUTTON INTERCEPTION FOR MOBILE MODAL ---
  useEffect(() => {
    const handlePopState = () => { if (selectedOrder) setSelectedOrder(null); };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [selectedOrder]);

  const openSettleModal = (order: OrderWithLedger) => {
    setSelectedOrder(order);
    if (window.innerWidth < 1024) {
      window.history.pushState({ modal: 'settle' }, '', window.location.pathname + '#settle');
    }
  };

  const closeSettleModal = () => {
    if (window.location.hash === '#settle') window.history.back(); 
    else setSelectedOrder(null);
  };

  const fetchPendingOrders = async (tenantId: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await (supabase as any)
        .from("orders")
        .select(`
          id, order_number, created_at, total_amount, payment_status, customer_id,
          customers (full_name, phone_number),
          payments (amount)
        `)
        .in("payment_status", ["PENDING", "PARTIAL"]) 
        .eq("tenant_id", tenantId)       
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      const mappedOrders: OrderWithLedger[] = (data || []).map((ord: any) => {
        const amountPaid = ord.payments?.reduce((sum: number, p: any) => sum + Number(p.amount), 0) || 0;
        return {
          ...ord,
          amount_paid: amountPaid,
          balance_due: Math.max(0, ord.total_amount - amountPaid)
        };
      }).filter((ord: OrderWithLedger) => ord.balance_due > 0); // Double check logic
      
      setOrders(mappedOrders);
    } catch (error: any) {
      toast({ title: "Error loading ledger", description: "Failed to load pending payments.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleSettlePayment = async () => {
    if (!selectedOrder || !currentTenantId) return;
    
    const amountReceived = parseFloat(settlementAmount);

    if (isNaN(amountReceived) || amountReceived <= 0) {
      toast({ title: "Invalid Amount", description: "Please enter a valid payment amount.", variant: "destructive" });
      return;
    }

    if (amountReceived > selectedOrder.balance_due) {
      toast({ title: "Amount Exceeded", description: `Cannot collect more than ₹${selectedOrder.balance_due}`, variant: "destructive" });
      return;
    }

    setIsSettling(true);
    try {
      // 1. Insert Payment Record
      const { error: paymentError } = await (supabase as any).from("payments").insert({
        tenant_id: currentTenantId,
        order_id: selectedOrder.id,
        customer_id: selectedOrder.customer_id,
        amount: amountReceived,
        payment_method: paymentMethod,
        payment_type: "SETTLEMENT",
        payment_date: new Date().toISOString()
      });

      if (paymentError) throw paymentError;

      // 2. Check if fully paid and update Order status
      const isFullyPaid = amountReceived === selectedOrder.balance_due;
      const newStatus = isFullyPaid ? "PAID" : "PARTIAL";

      const { error: orderError } = await (supabase as any)
        .from("orders")
        .update({ payment_status: newStatus })
        .eq("id", selectedOrder.id)
        .eq("tenant_id", currentTenantId);

      if (orderError) throw orderError;

      toast({
        title: isFullyPaid ? "Payment Complete" : "Partial Payment Received",
        description: `Collected ₹${amountReceived} via ${paymentMethod}. ${!isFullyPaid ? `₹${selectedOrder.balance_due - amountReceived} still pending.` : 'Order fully settled!'}`,
      });

      // 3. Update Local State smoothly
      if (isFullyPaid) {
        setOrders((prev) => prev.filter((o) => o.id !== selectedOrder.id));
      } else {
        setOrders((prev) => prev.map((o) => o.id === selectedOrder.id ? { 
          ...o, 
          amount_paid: o.amount_paid + amountReceived,
          balance_due: o.balance_due - amountReceived, 
          payment_status: "PARTIAL" 
        } : o));
      }
      
      closeSettleModal();
    } catch (error: any) {
      toast({ title: "Settlement Error", description: error.message, variant: "destructive" });
    } finally {
      setIsSettling(false);
    }
  };

  const handleExportCSV = () => {
    if (filteredOrders.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = ["Invoice No", "Date", "Customer Name", "Phone", "Total Bill (INR)", "Amount Paid (INR)", "Pending Balance (INR)"];
    
    const rows = filteredOrders.map((o) => [
      `"${o.order_number || 'N/A'}"`,
      `"${format(new Date(o.created_at), "dd MMM yyyy")}"`,
      `"${(o.customers?.full_name || 'Walk-in').replace(/"/g, '""')}"`,
      `"${o.customers?.phone_number || 'N/A'}"`,
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

    toast({ title: "Export Successful", description: "Pending ledger has been downloaded." });
  };

  const sendWhatsAppReminder = (order: OrderWithLedger) => {
    const phone = order.customers?.phone_number;
    if (!phone) {
      toast({ title: "Phone Missing", description: "This record has no customer phone number attached.", variant: "destructive" });
      return;
    }

    const date = format(new Date(order.created_at), "dd MMM yyyy");
    const isAdvance = order.amount_paid > 0;
    const customerName = order.customers?.full_name || 'Customer';
    
    const messageText = isAdvance
      ? `🙏 *Jai Ganesh!* Hello ${customerName},\n\nThis is a gentle reminder regarding your order from ${date}.\n\n• Order No: ${order.order_number}\n• Total Bill: ₹${Math.abs(order.total_amount)}\n• Amount Paid: ₹${order.amount_paid}\n• *Balance Due: ₹${order.balance_due}*\n\nPlease arrange to clear the pending balance at your earliest convenience.\n\nThank you!\n*श्री समर्थ कृपा गणेश कला केंद्र*`
      : `🙏 *Jai Ganesh!* Hello ${customerName},\n\nThis is a gentle reminder regarding your pending payment of *₹${order.balance_due}* for order ${order.order_number} on ${date}.\n\nPlease pay at your earliest convenience.\n\nThank you!\n*श्री समर्थ कृपा गणेश कला केंद्र*`;

    const message = encodeURIComponent(messageText);
    window.open(`https://wa.me/91${phone.replace(/\D/g,'')}?text=${message}`, "_blank");
  };

  // Search
  const filteredOrders = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return orders;
    return orders.filter(o => 
      (o.customers?.full_name?.toLowerCase() || "").includes(q) ||
      (o.customers?.phone_number || "").includes(q) ||
      (o.order_number?.toLowerCase() || "").includes(q)
    );
  }, [orders, searchQuery]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount);
  };

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-fade-in pb-24 md:pb-12 font-sans">
          
        <div className="flex items-center justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
  
  {/* 1. COMPACT TITLE SECTION */}
  <div className="flex flex-col justify-center min-w-0">
    <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none truncate">
      Pending Ledger
    </h1>
    <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block truncate">
      Track advances and unsettled collections.
    </p>
  </div>

  {/* 2. MATCHING "METRIC PILL" (Replaces the giant Card) */}
  <div className="flex items-center gap-2.5 sm:gap-3 bg-rose-50 border border-rose-100 rounded-xl p-1.5 sm:p-2 pr-3 sm:pr-4 shrink-0 shadow-sm">
    <div className="h-8 w-8 sm:h-10 sm:w-10 bg-white border border-rose-100 rounded-lg flex items-center justify-center shadow-sm shrink-0">
      <AlertCircle className="h-4 w-4 sm:h-5 sm:w-5 text-rose-500" />
    </div>
    <div className="flex flex-col justify-center">
      <span className="text-[8px] sm:text-[9px] font-bold text-rose-500 uppercase tracking-widest leading-none mb-1">
        Outstanding ({orders.length})
      </span>
      <span className="text-sm sm:text-lg font-bold tracking-tight text-rose-700 leading-none">
        {formatCurrency(totalPending)}
      </span>
    </div>
  </div>

</div>

          {/* --- TOOLBAR (Search & Export) --- */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search by name, phone, or invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-12 bg-white shadow-sm border-zinc-200 rounded-xl font-medium text-sm focus-visible:ring-zinc-900"
              />
            </div>
            <Button
              onClick={handleExportCSV}
              disabled={loading || filteredOrders.length === 0}
              className="h-12 px-6 rounded-xl font-bold bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shrink-0"
            >
              <Download className="mr-2 h-4 w-4" /> Export CSV
            </Button>
          </div>

          {/* --- LIST OF PENDING BILLS --- */}
          <div className="space-y-4">
            {loading ? (
              <div className="text-center py-20 text-zinc-400 font-medium text-sm flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-900 border-t-transparent" />
                <span className="font-semibold tracking-wide">Loading ledger...</span>
              </div>
            ) : filteredOrders.length === 0 ? (
              <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50 rounded-3xl">
                <CardContent className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <div className="h-14 w-14 rounded-full bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                    <CheckCircle2 className="h-7 w-7 text-emerald-500" />
                  </div>
                  <p className="text-zinc-900 font-bold text-lg">
                    {searchQuery ? "No matching records found" : "All collections clear!"}
                  </p>
                  <p className="text-zinc-500 text-sm mt-1 max-w-sm text-center font-medium">
                    {searchQuery ? "Try searching with a different keyword or invoice." : "There are no pending balances or unpaid bookings at the moment."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredOrders.map((order) => {
                  const isAdvance = order.amount_paid > 0;

                  return (
                    <Card key={order.id} className="overflow-hidden border border-zinc-200 shadow-sm rounded-3xl bg-white flex flex-col justify-between hover:shadow-md transition-all group">
                      <CardContent className="p-5 flex-1 flex flex-col justify-between">
                        <div>
                          
                          {/* Header: Amount & Status Dot */}
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex items-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)] animate-pulse" />
                              <span className="text-[10px] font-bold text-amber-600 uppercase tracking-widest">Pending</span>
                            </div>
                            <div className="text-right bg-rose-50 px-3 py-1 rounded-lg border border-rose-100">
                              <div className="text-xl font-bold tracking-tight text-rose-600 leading-none">{formatCurrency(order.balance_due)}</div>
                            </div>
                          </div>

                          {/* Customer Details */}
                          <div className="mb-5">
                            <div className="font-bold text-base text-zinc-900 leading-tight truncate">{order.customers?.full_name || "Walk-in Customer"}</div>
                            <div className="flex flex-col gap-1.5 mt-2">
                              {order.customers?.phone_number && (
                                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-500">
                                  <Phone className="h-3.5 w-3.5 text-zinc-400" />
                                  {order.customers.phone_number}
                                </div>
                              )}
                              <div className="flex items-center gap-2 text-xs font-mono font-semibold text-zinc-500">
                                <Receipt className="h-3.5 w-3.5 text-zinc-400" />
                                {order.order_number}
                              </div>
                            </div>
                          </div>

                          {/* Tags */}
                          <div className="pt-3 border-t border-zinc-100 flex items-center justify-between text-xs">
                            <span className="text-zinc-500 font-semibold font-mono">{format(new Date(order.created_at), "dd MMM yyyy")}</span>
                            {isAdvance ? (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-zinc-100 text-zinc-600 border border-zinc-200">
                                Paid: ₹{order.amount_paid}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold bg-zinc-50 text-zinc-400 border border-zinc-200/50">
                                Zero Adv
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 mt-5">
                          <Button 
                            variant="outline" 
                            className="flex-1 h-11 text-zinc-700 hover:text-zinc-900 hover:bg-zinc-50 border-zinc-200 font-bold text-xs rounded-xl shadow-sm"
                            onClick={() => sendWhatsAppReminder(order)}
                            disabled={!order.customers?.phone_number}
                          >
                            <MessageCircle className={`h-4 w-4 mr-1.5 ${order.customers?.phone_number ? 'text-emerald-500' : 'text-zinc-300'}`} /> Remind
                          </Button>
                          <Button 
                            className="flex-1 h-11 bg-zinc-900 hover:bg-zinc-800 text-white font-bold text-xs rounded-xl shadow-sm"
                            onClick={() => openSettleModal(order)}
                          >
                            <Wallet className="h-4 w-4 mr-1.5" /> Settle
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* --- SETTLE PAYMENT MODAL (MOBILE SLIDE-UP / DESKTOP CENTER) --- */}
        <Dialog open={!!selectedOrder} onOpenChange={(open) => !open && closeSettleModal()}>
          <DialogContent className="fixed inset-x-0 bottom-0 top-auto sm:top-1/2 sm:-translate-y-1/2 sm:left-1/2 sm:-translate-x-1/2 w-full sm:max-w-md bg-white p-0 rounded-t-3xl sm:rounded-3xl shadow-2xl border-t sm:border border-zinc-200 m-0 z-50 flex flex-col max-h-[90vh] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:slide-out-to-bottom-full data-[state=open]:slide-in-from-bottom-full sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-top-[48%] duration-300">
            
            {/* Pull pill for mobile */}
            <div className="mx-auto mt-3 h-1.5 w-12 rounded-full bg-zinc-200 sm:hidden shrink-0" />

            <div className="px-6 py-4 border-b border-zinc-100 bg-zinc-50/50 flex justify-between items-center rounded-t-3xl shrink-0 mt-2 sm:mt-0">
              <div>
                <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900">Receive Payment</DialogTitle>
                <DialogDescription className="text-xs font-semibold text-zinc-500 mt-1">
                  Record full or partial settlement.
                </DialogDescription>
              </div>
              <button onClick={closeSettleModal} className="p-2 -mr-2 bg-white border border-zinc-200 rounded-full text-zinc-500 hover:text-zinc-900 shadow-sm transition-colors hidden sm:block">
                <X className="h-4 w-4" />
              </button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              {/* Amount Status */}
              <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex items-center justify-between shadow-inner">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500/80 mb-1">Total Due</p>
                  <p className="text-3xl font-bold tracking-tight text-rose-700">
                    {selectedOrder ? formatCurrency(selectedOrder.balance_due) : "0"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500/80 mb-1">Customer</p>
                  <p className="text-sm font-bold text-rose-900 truncate max-w-[120px]">{selectedOrder?.customers?.full_name || 'Walk-in'}</p>
                </div>
              </div>

              {/* Editable Amount Input */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Amount Received (₹)</Label>
                <div className="relative">
                  <Input 
                    type="number"
                    value={settlementAmount}
                    onChange={(e) => setSettlementAmount(e.target.value)}
                    className="h-14 pl-10 text-xl font-bold rounded-2xl border-zinc-200 focus-visible:ring-zinc-900 bg-white shadow-sm"
                    placeholder="Enter amount..."
                  />
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-400 font-bold text-lg">₹</span>
                </div>
              </div>

              {/* Method Select */}
              <div className="space-y-2">
                <Label className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Payment Method</Label>
                <div className="relative">
                  <select 
                    value={paymentMethod} 
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="h-14 w-full rounded-2xl border border-zinc-200 bg-white px-10 text-sm font-bold shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900 appearance-none"
                  >
                    <option value="CASH">CASH</option>
                    <option value="UPI">UPI</option>
                    <option value="CARD">CARD</option>
                    <option value="BANK_TRANSFER">BANK TRANSFER</option>
                  </select>
                  <Banknote className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500 pointer-events-none" />
                  <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-zinc-100 bg-zinc-50/50 pb-safe shrink-0 sm:rounded-b-3xl">
              <div className="flex gap-3">
                <Button variant="outline" onClick={closeSettleModal} className="flex-1 h-14 rounded-2xl font-bold border-zinc-200 text-zinc-700 bg-white shadow-sm">
                  Cancel
                </Button>
                <Button onClick={handleSettlePayment} disabled={isSettling} className="flex-1 h-14 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl font-bold shadow-[0_4px_15px_rgba(16,185,129,0.25)] transition-transform active:scale-[0.98]">
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