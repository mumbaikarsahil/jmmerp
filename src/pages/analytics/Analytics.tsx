import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Capacitor } from "@capacitor/core";
import { Filesystem, Directory } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import * as XLSX from "xlsx";
import {
  TrendingUp, Download, Search, Wallet, Banknote, AlertCircle, 
  Users, AlertTriangle, Calendar as CalendarIcon, CreditCard, Scale, Package
} from "lucide-react";
import { format, subDays, startOfDay, endOfDay } from "date-fns";

type Item = Database["public"]["Tables"]["items"]["Row"];

type DailySales = {
  date: string;
  amount: number;
};

type OrderWithLedger = {
  id: string;
  order_number: string;
  created_at: string;
  total_amount: number;
  payment_status: 'PAID' | 'PENDING' | 'PARTIAL';
  customers?: { full_name: string | null; phone_number: string | null } | null;
  payments?: { amount: number; payment_method: string }[];
};

export default function Analytics() {
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Custom Date Range State
  const [dateRange, setDateRange] = useState<{ from: Date; to?: Date }>({
    from: startOfDay(subDays(new Date(), 30)), 
    to: endOfDay(new Date())
  }); 
  
  const [metrics, setMetrics] = useState({
    totalSales: 0,
    cashCollected: 0,
    onlineCollected: 0,
    pendingUdhaar: 0,
    totalPurchaseValue: 0, 
    totalSellingValue: 0,  
    lowStockCount: 0
  });

  const [salesData, setSalesData] = useState<DailySales[]>([]); 
  const [recentUdhaar, setRecentUdhaar] = useState<any[]>([]); 
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  // --- 1. INITIALIZE TENANT DATA ---
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
        }
      } catch (error) {
        console.error("Failed to initialize tenant data:", error);
      }
    };
    initializeTenantData();
  }, []);

  // --- 2. FETCH DATA WHEN TENANT OR DATE CHANGES ---
  useEffect(() => {
    if (currentTenantId && dateRange.from) {
      fetchData(currentTenantId);
    }
  }, [dateRange.from, dateRange.to, currentTenantId]); 

  const fetchData = async (tenantId: string) => {
    setIsLoading(true);
    try {
      // 1. FETCH ITEMS
      const { data: itemsData, error: itemsError } = await (supabase as any)
        .from("items")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("item_name");

      if (itemsError) throw itemsError;
      const validItems = (itemsData || []) as Item[];
      setItems(validItems);

      const purchaseVal = validItems.reduce((sum, item) => sum + (Number(item.purchase_price) || 0) * Number(item.quantity || 0), 0);
      const sellingVal = validItems.reduce((sum, item) => sum + (Number(item.selling_price) || 0) * Number(item.quantity || 0), 0);
      const lowStock = validItems.filter((item) => Number(item.quantity) < 5 && item.item_type !== 'SERVICE').length;

      // 2. FETCH ORDERS IN RANGE (Replaces bills)
      const start = new Date(dateRange.from);
      start.setHours(0, 0, 0, 0);
      const end = new Date(dateRange.to || dateRange.from);
      end.setHours(23, 59, 59, 999);

      const { data: ordersData, error: ordersError } = await (supabase as any)
        .from("orders")
        .select(`
          id, order_number, created_at, total_amount, payment_status,
          customers ( full_name, phone_number ),
          payments ( amount, payment_method )
        `)
        .eq("tenant_id", tenantId)
        .gte("created_at", start.toISOString())
        .lte("created_at", end.toISOString());

      if (ordersError) throw ordersError;

      let totalSales = 0;
      let cashCollected = 0;
      let onlineCollected = 0;
      let pendingUdhaar = 0;

      const orders = (ordersData || []) as OrderWithLedger[];

      orders.forEach(order => {
        const isReturn = order.total_amount < 0;
        const gross = order.total_amount; 
        
        totalSales += gross;

        const amountPaid = order.payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
        const balance = Math.max(0, gross - amountPaid);
        
        pendingUdhaar += (isReturn ? -balance : balance);

        order.payments?.forEach(payment => {
          const amt = isReturn ? -payment.amount : payment.amount;
          if (payment.payment_method === 'CASH') cashCollected += amt;
          else onlineCollected += amt;
        });
      });

      setMetrics({
        totalPurchaseValue: purchaseVal,
        totalSellingValue: sellingVal,
        lowStockCount: lowStock,
        totalSales,
        cashCollected,
        onlineCollected,
        pendingUdhaar
      });

      // 3. FETCH RECENT UDHAAR (Pending Orders)
      const { data: pendingOrdersData } = await (supabase as any)
        .from("orders")
        .select(`
          id, order_number, created_at, total_amount,
          customers ( full_name, phone_number ),
          payments ( amount )
        `)
        .in("payment_status", ["PENDING", "PARTIAL"])
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      
      const formattedRecentUdhaar = (pendingOrdersData || []).map((o: any) => {
        const paid = o.payments?.reduce((s: number, p: any) => s + Number(p.amount), 0) || 0;
        return {
           id: o.id,
           customer_name: o.customers?.full_name || 'Walk-in',
           customer_phone: o.customers?.phone_number || 'N/A',
           created_at: o.created_at,
           balance_due: o.total_amount - paid
        };
      }).filter(o => o.balance_due > 0);

      setRecentUdhaar(formattedRecentUdhaar);

      // 4. FETCH CHART DATA (Last 7 Days)
      const last7Days: DailySales[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date();
        const displayDate = new Date(date);
        date.setDate(date.getDate() - i);
        displayDate.setDate(displayDate.getDate() - i);
        
        const dateStr = date.toISOString().split("T")[0];

        const { data: dayOrders } = await (supabase as any)
          .from("orders")
          .select("total_amount")
          .eq("tenant_id", tenantId) 
          .gte("created_at", `${dateStr}T00:00:00`)
          .lte("created_at", `${dateStr}T23:59:59`)
          .gt("total_amount", 0);

        const dayTotal = (dayOrders || []).reduce((sum: number, o: any) => sum + o.total_amount, 0);
        last7Days.push({
          date: displayDate.toLocaleDateString("en-US", { weekday: "short" }),
          amount: dayTotal,
        });
      }
      setSalesData(last7Days);

    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Failed to fetch data", variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (val: number) => 
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val);

  const formatCompactNumber = (number: number) => {
    return new Intl.NumberFormat('en-IN', { notation: "compact", compactDisplay: "short" }).format(number);
  };

  const filteredItems = useMemo(() => {
    return items
      .filter((item) => item.item_type !== 'SERVICE') // Hide services from analytics grid
      .filter((item) =>
        item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.brand_name && item.brand_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        item.item_code.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .map(item => ({
        ...item,
        stockDisplay: (item as any).pieces_per_box > 1 
          ? `${Math.floor(Number(item.quantity) / (item as any).pieces_per_box)} : ${Number(item.quantity) % (item as any).pieces_per_box}`
          : `${item.quantity}`
      }));
  }, [items, searchQuery]);

  const exportToExcel = async () => {
    try {
      const exportData = filteredItems.map((item) => ({
        "Code": item.item_code,
        "Name": item.item_name,
        "Type": item.item_type === "RAW_MATERIAL" ? "Raw Spice" : "Ready Blend",
        "Brand": item.brand_name || 'N/A',
        "Sell Price (INR)": item.selling_price,
        "Current Stock": item.quantity,
        "Unit": (item as any).base_unit || 'units'
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      const fileName = `Inventory_Report_${new Date().toISOString().split("T")[0]}.xlsx`;

      if (Capacitor.isNativePlatform()) {
        const excelBase64 = XLSX.write(wb, { bookType: "xlsx", type: "base64" });
        const result = await Filesystem.writeFile({
          path: fileName,
          data: excelBase64,
          directory: Directory.Cache, 
        });
        await Share.share({ title: "Export Inventory", text: "Here is your inventory file", url: result.uri, dialogTitle: "Save or Share Excel" });
      } else {
        XLSX.writeFile(wb, fileName);
      }
      toast({ title: "Success", description: "Sheet generated successfully" });
    } catch (error: any) {
      toast({ title: "Export Failed", description: error.message || "Could not save file", variant: "destructive" });
    }
  };

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-fade-in pb-24 md:pb-12 font-sans">
          
          {/* --- APP HEADER --- */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 border-b border-zinc-200/80 pb-5">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">Analytics</h1>
              <p className="text-zinc-500 mt-1.5 text-sm font-medium">Store performance, mix trends, and operational metrics.</p>
            </div>
            
            <div className="w-full sm:w-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full sm:w-[260px] justify-start h-12 font-bold border-zinc-200 shadow-sm bg-white text-zinc-800 hover:bg-zinc-50 rounded-xl transition-all">
                    <CalendarIcon className="mr-2 h-4 w-4 text-zinc-400 shrink-0" />
                    <span className="truncate">
                      {dateRange.from ? (
                        dateRange.to ? (
                          <>{format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd, y")}</>
                        ) : (
                          format(dateRange.from, "LLL dd, y")
                        )
                      ) : (
                        <span>Select Date Range</span>
                      )}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 rounded-2xl border-zinc-200 shadow-xl" align="end">
                  <Calendar
                    mode="range"
                    defaultMonth={dateRange.from}
                    selected={dateRange}
                    onSelect={(range: any) => {
                      if (!range) setDateRange({ from: startOfDay(new Date()) });
                      else setDateRange(range);
                    }}
                    initialFocus
                    numberOfMonths={1}
                    className="rounded-2xl"
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* --- METRICS GRID --- */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
            
            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Gross Sales</span>
                  <div className="h-7 w-7 rounded-lg bg-zinc-100 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-zinc-600" /></div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900">{formatCompactNumber(metrics.totalSales)}</div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-emerald-100 bg-emerald-50/50 rounded-2xl hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Collected</span>
                  <div className="flex items-center gap-1.5">
                    <Banknote className="h-4 w-4 text-emerald-500" />
                    <CreditCard className="h-4 w-4 text-emerald-400" />
                  </div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-emerald-900">{formatCompactNumber(metrics.cashCollected + metrics.onlineCollected)}</div>
                <div className="flex items-center gap-3 text-[10px] sm:text-xs font-bold text-emerald-600/70 mt-2">
                   <span>Cash: <span className="text-emerald-700">{formatCompactNumber(metrics.cashCollected)}</span></span>
                   <span>UPI: <span className="text-emerald-700">{formatCompactNumber(metrics.onlineCollected)}</span></span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl col-span-2 lg:col-span-1 hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                   <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Pending Due</span>
                   <div className="h-7 w-7 rounded-lg bg-amber-50 flex items-center justify-center"><AlertCircle className="h-4 w-4 text-amber-500" /></div>
                </div>
                <div className="text-2xl sm:text-3xl font-bold tracking-tight text-amber-600">{formatCurrency(metrics.pendingUdhaar)}</div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-zinc-200 bg-white rounded-2xl col-span-2 lg:col-span-1 hover:shadow-md transition-shadow">
              <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
                <div className="flex items-center justify-between mb-4">
                   <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Stock Valuation</span>
                   <div className="h-7 w-7 rounded-lg bg-zinc-100 flex items-center justify-center"><Wallet className="h-4 w-4 text-zinc-600" /></div>
                </div>
                <div className="flex justify-between items-end">
                  <div>
                     <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-0.5">Invested</div>
                     <div className="text-lg font-bold tracking-tight text-zinc-900">{formatCompactNumber(metrics.totalPurchaseValue)}</div>
                  </div>
                  <div className="text-right">
                     <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-0.5">Potential</div>
                     <div className="text-sm font-bold tracking-tight text-zinc-500">{formatCompactNumber(metrics.totalSellingValue)}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* --- PENDING PAYMENTS WIDGET --- */}
          {recentUdhaar.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-[13px] font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                  <Users className="h-4 w-4 text-zinc-400" /> Recent Pending Udhaar
                </h2>
              </div>
              <div className="flex overflow-x-auto gap-3 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 md:grid md:grid-cols-3 md:gap-4 md:overflow-visible hidden-scrollbar">
                {recentUdhaar.map((bill) => (
                  <Card key={bill.id} className="min-w-[260px] border border-zinc-200 bg-white shadow-sm rounded-2xl shrink-0 hover:shadow-md transition-all">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <div className="font-bold text-[15px] text-zinc-900 truncate pr-2 leading-tight">{bill.customer_name}</div>
                          <div className="text-[11px] font-semibold text-zinc-500 mt-0.5">{bill.customer_phone}</div>
                        </div>
                        <Badge variant="outline" className="text-[9px] bg-zinc-50 text-zinc-500 border-zinc-200 font-bold uppercase tracking-wider px-2 py-1 shrink-0 rounded-md">
                          {format(new Date(bill.created_at), "MMM d")}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-end pt-3 border-t border-zinc-100">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">Due Balance</span>
                        <span className="font-bold text-lg text-amber-600 leading-none">₹{bill.balance_due}</span>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* --- CHART SECTION --- */}
          <Card className="shadow-sm border border-zinc-200 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-5 sm:p-6 pb-2 border-b border-zinc-100 bg-zinc-50/50">
              <CardTitle className="text-base font-bold text-zinc-900">7-Day Sales Trend</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pt-5 sm:pt-6">
              <div className="h-[250px] w-full pr-4 pb-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#18181b" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#18181b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f4f4f5" />
                    <XAxis dataKey="date" tick={{fontSize: 10, fill: '#71717a', fontWeight: 600}} axisLine={false} tickLine={false} dy={10} />
                    <YAxis hide />
                    <Tooltip
                      contentStyle={{ borderRadius: '16px', border: '1px solid #e4e4e7', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', padding: '16px' }}
                      itemStyle={{ color: '#18181b', fontWeight: 700, fontSize: '16px' }}
                      formatter={(value: number) => [`₹${value}`, "Sales"]}
                      labelStyle={{ color: '#71717a', fontSize: '11px', textTransform: 'uppercase', marginBottom: '4px', fontWeight: 700, letterSpacing: '0.05em' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="amount"
                      stroke="#18181b"
                      fillOpacity={1}
                      fill="url(#colorSales)"
                      strokeWidth={3}
                      activeDot={{ r: 6, fill: '#18181b', stroke: '#fff', strokeWidth: 3 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* --- INVENTORY LIST --- */}
          <Card className="shadow-sm border border-zinc-200 rounded-3xl overflow-hidden bg-white">
            <CardHeader className="p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between bg-zinc-50/50 border-b border-zinc-100 gap-4">
              <div>
                <CardTitle className="text-base font-bold text-zinc-900">Live Inventory Diagnostics</CardTitle>
                {metrics.lowStockCount > 0 && (
                   <span className="text-[10px] text-rose-500 font-bold uppercase tracking-wider flex items-center gap-1.5 mt-1.5 bg-rose-50 w-fit px-2 py-1 rounded-md border border-rose-100">
                     <AlertTriangle className="h-3 w-3" /> {metrics.lowStockCount} Items Low Stock
                   </span>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={exportToExcel} className="h-11 rounded-xl shadow-sm font-bold text-xs bg-white border-zinc-200 text-zinc-700 w-full sm:w-auto">
                <Download className="h-4 w-4 mr-2" /> Download Report
              </Button>
            </CardHeader>
            
            <div className="p-4 border-b border-zinc-100 bg-white">
              <div className="relative max-w-sm">
                <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <Input
                  placeholder="Filter stock..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 h-11 text-sm bg-zinc-50 border-zinc-200 rounded-xl font-medium focus-visible:ring-zinc-900 shadow-none"
                />
              </div>
            </div>

            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-zinc-100 bg-zinc-50/40">
                      <TableHead className="w-[50%] pl-6 py-4 font-bold text-zinc-500 uppercase tracking-widest text-[10px]">Item Definition</TableHead>
                      <TableHead className="text-right py-4 font-bold text-zinc-500 uppercase tracking-widest text-[10px]">Selling Rate</TableHead>
                      <TableHead className="text-right pr-6 py-4 font-bold text-zinc-500 uppercase tracking-widest text-[10px]">Current Stock</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-16 text-zinc-400 font-semibold">Loading diagnostic data...</TableCell></TableRow>
                    ) : filteredItems.length === 0 ? (
                      <TableRow><TableCell colSpan={3} className="text-center py-16 text-zinc-400 font-semibold">No active tracking data found.</TableCell></TableRow>
                    ) : (
                      filteredItems.map((item) => {
                        const typeStr = item.item_type || "FINISHED_PRODUCT";
                        const isRaw = typeStr === "RAW_MATERIAL";

                        return (
                          <TableRow key={item.id} className="border-b-zinc-100 hover:bg-zinc-50/60 transition-colors">
                            <TableCell className="py-4 pl-6">
                              <div className="flex flex-col items-start gap-1">
                                <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${isRaw ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-blue-50 text-blue-600 border-blue-200'}`}>
                                   {isRaw ? <Scale className="h-2.5 w-2.5" /> : <Package className="h-2.5 w-2.5" />}
                                   {isRaw ? 'Raw Spice' : 'Ready Blend'}
                                </span>
                                <div className="font-bold text-[15px] text-zinc-900 truncate max-w-[200px] md:max-w-md mt-0.5">{item.item_name}</div>
                                <div className="text-[11px] text-zinc-400 font-bold mt-0.5 font-mono">{item.item_code}</div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right py-4 align-middle">
                              <div className="font-bold text-[15px] text-zinc-900">₹{item.selling_price}</div>
                              <div className="text-[10px] text-zinc-400 font-semibold mt-0.5">/ {(item as any).base_unit || 'unit'}</div>
                            </TableCell>
                            <TableCell className="text-right py-4 pr-6 align-middle">
                              <Badge 
                                variant="outline"
                                className={`text-[11px] font-bold uppercase tracking-widest px-2.5 py-1 border-0
                                  ${Number(item.quantity) <= 5 ? 'bg-rose-100 text-rose-700' : 'bg-zinc-100 text-zinc-700'}
                                `}
                              >
                                {item.stockDisplay}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </AppLayout>
  );
}