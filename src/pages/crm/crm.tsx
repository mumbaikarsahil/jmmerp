import React, { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { 
  Users, 
  Search, 
  Download, 
  Phone, 
  ShoppingBag, 
  Loader2, 
  UserCheck,
  TrendingUp,
  Calendar,
  ArrowUpRight
} from "lucide-react";

interface CustomerProfile {
  phone: string;
  name: string;
  totalOrders: number;
  totalSpent: number;
  lastVisit: string;
}

export default function CRM() {
  const [customers, setCustomers] = useState<CustomerProfile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();

  // 1. Fetch orders & aggregate by customer
  useEffect(() => {
    const fetchCustomerData = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Bypass 'never' and extract directly to avoid 'possibly null' errors
        const { data: profileData } = await (supabase as any)
          .from("profiles")
          .select("tenant_id")
          .eq("id", session.user.id)
          .single();
        
        const tenantId = profileData?.tenant_id;
        if (!tenantId) return;

        // Fetch using the new 'orders' and 'customers' relational schema
        const { data: ordersData, error } = await (supabase as any)
          .from("orders")
          .select(`
            id, total_amount, created_at,
            customers ( full_name, phone_number )
          `)
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false });

        if (error) throw error;

        const customerMap: Record<string, CustomerProfile> = {};

        (ordersData || []).forEach((order: any) => {
          const phoneKey = order.customers?.phone_number?.trim() || "No Phone";
          const nameVal = order.customers?.full_name?.trim() || "Walk-in Customer";

          // Skip completely anonymous walk-ins
          if (phoneKey === "No Phone" && nameVal === "Walk-in Customer") return;

          const uniqueKey = `${phoneKey}_${nameVal.toLowerCase()}`;

          if (!customerMap[uniqueKey]) {
            customerMap[uniqueKey] = {
              phone: phoneKey,
              name: nameVal,
              totalOrders: 0,
              totalSpent: 0,
              lastVisit: order.created_at,
            };
          }

          customerMap[uniqueKey].totalOrders += 1;
          customerMap[uniqueKey].totalSpent += Number(order.total_amount || 0);

          if (new Date(order.created_at) > new Date(customerMap[uniqueKey].lastVisit)) {
            customerMap[uniqueKey].lastVisit = order.created_at;
          }
        });

        const aggregatedList = Object.values(customerMap).sort(
          (a, b) => b.totalSpent - a.totalSpent
        );

        setCustomers(aggregatedList);
      } catch (err: any) {
        toast({
          title: "Error fetching CRM data",
          description: err.message || "Failed to load customer list.",
          variant: "destructive",
        });
      } finally {
        setIsLoading(false);
      }
    };

    fetchCustomerData();
  }, [toast]);

  // 2. Search & Filter
  const filteredCustomers = useMemo(() => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [customers, searchTerm]);

  // 3. Export to CSV functionality
  const handleExportCSV = () => {
    if (filteredCustomers.length === 0) {
      toast({ title: "No data to export", variant: "destructive" });
      return;
    }

    const headers = ["Customer Name", "Phone Number", "Total Orders", "Total Spent (INR)", "Last Visit Date"];
    
    const rows = filteredCustomers.map((c) => [
      `"${c.name.replace(/"/g, '""')}"`,
      `"${c.phone}"`,
      c.totalOrders,
      c.totalSpent.toFixed(2),
      `"${new Date(c.lastVisit).toLocaleDateString("en-IN")}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Biillo_CRM_Customers_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast({
      title: "Export Successful",
      description: `Downloaded ${filteredCustomers.length} customer profiles.`,
    });
  };

  // 4. Summary Metrics
  const totalSpendAll = useMemo(
    () => customers.reduce((sum, c) => sum + c.totalSpent, 0),
    [customers]
  );
  const repeatCustomersCount = useMemo(
    () => customers.filter((c) => c.totalOrders > 1).length,
    [customers]
  );

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-5 animate-fade-in pb-24 md:pb-12 font-sans">
          
          {/* --- SOFTWARE-STYLE HEADER --- */}
          <div className="flex flex-col sm:flex-row justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
            {/* COMPACT TITLE SECTION */}
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none truncate">
                Customer CRM
              </h1>
              <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block truncate">
                View purchase histories, loyalty stats, and export audience lists.
              </p>
            </div>

            {/* COMPACT ACTION CONTROLS */}
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
                <Input
                  placeholder="Search customers..."
                  className="pl-8 h-9 bg-white border-zinc-200 shadow-sm rounded-lg focus-visible:ring-zinc-900 text-xs w-full font-semibold"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <Button
                onClick={handleExportCSV}
                disabled={isLoading || filteredCustomers.length === 0}
                className="h-9 px-3 rounded-lg font-bold bg-zinc-900 text-white hover:bg-zinc-800 shadow-sm shrink-0 text-xs transition-transform active:scale-95"
              >
                <Download className="sm:mr-1.5 h-3.5 w-3.5" />
                <span className="hidden sm:inline">Export CSV</span>
              </Button>
            </div>
          </div>

          {/* --- COMPACT METRICS PILLS --- */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Card className="shadow-sm border border-zinc-200 bg-white rounded-xl">
              <CardContent className="p-3 sm:p-4 flex items-center justify-between">
                <div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Total Customers</span>
                  <span className="text-lg sm:text-2xl font-bold text-zinc-900 leading-none">{customers.length}</span>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500">
                  <Users className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-emerald-100 bg-emerald-50/50 rounded-xl">
              <CardContent className="p-3 sm:p-4 flex items-center justify-between">
                <div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-emerald-600 uppercase tracking-widest block mb-0.5">Repeat Buyers</span>
                  <div className="flex items-end gap-1.5 leading-none">
                    <span className="text-lg sm:text-2xl font-bold text-emerald-900 leading-none">{repeatCustomersCount}</span>
                    <span className="text-[10px] font-bold text-emerald-600/80 mb-0.5">
                      ({customers.length ? ((repeatCustomersCount / customers.length) * 100).toFixed(0) : 0}%)
                    </span>
                  </div>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-white border border-emerald-100 flex items-center justify-center text-emerald-600">
                  <UserCheck className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-sm border border-zinc-200 bg-white rounded-xl col-span-2 md:col-span-1">
              <CardContent className="p-3 sm:p-4 flex items-center justify-between">
                <div>
                  <span className="text-[9px] sm:text-[10px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Lifetime Value</span>
                  <span className="text-lg sm:text-2xl font-bold text-zinc-900 leading-none">
                    ₹{totalSpendAll.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                  </span>
                </div>
                <div className="h-8 w-8 sm:h-10 sm:w-10 rounded-lg bg-zinc-50 border border-zinc-100 flex items-center justify-center text-zinc-500">
                  <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* --- CONTENT AREA --- */}
          {isLoading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-3 text-zinc-400">
              <Loader2 className="h-6 w-6 animate-spin text-zinc-900" />
              <span className="text-xs font-semibold tracking-wide">Loading customer records...</span>
            </div>
          ) : filteredCustomers.length === 0 ? (
            <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50 rounded-2xl">
              <CardContent className="flex flex-col items-center justify-center py-16 text-zinc-500">
                <Users className="h-10 w-10 mb-3 text-zinc-300" />
                <p className="font-bold text-sm text-zinc-900">No customers found</p>
                <p className="text-xs mt-1 text-center font-medium">We couldn't find anything matching "{searchTerm}"</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* --- MOBILE VIEW (CARDS) --- */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredCustomers.map((c, idx) => (
                  <Card key={idx} className="border-zinc-200 shadow-sm rounded-2xl overflow-hidden bg-white">
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 pr-2">
                          <h3 className="font-bold text-sm text-zinc-900 truncate">{c.name}</h3>
                          <div className="flex items-center gap-1.5 mt-1">
                            <Phone className="h-3 w-3 text-zinc-400 shrink-0" />
                            {c.phone !== "No Phone" ? (
                              <a 
                                href={`tel:${c.phone}`} 
                                className="text-xs font-bold text-zinc-500 hover:text-zinc-900 transition-colors"
                              >
                                {c.phone}
                              </a>
                            ) : (
                              <span className="text-[10px] font-bold text-zinc-400">No Phone</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0 bg-zinc-50 px-2.5 py-1.5 rounded-lg border border-zinc-100">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest block mb-0.5">Total Spent</span>
                          <span className="font-bold text-sm text-zinc-900 leading-none">
                            ₹{c.totalSpent.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-50 border border-zinc-100 p-3 rounded-xl">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Total Orders</span>
                          <span className="font-bold text-zinc-800 flex items-center gap-1.5 mt-1 text-xs">
                            <ShoppingBag className="h-3 w-3 text-zinc-400" />
                            {c.totalOrders}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest">Last Visit</span>
                          <span className="font-bold text-zinc-800 flex items-center gap-1.5 mt-1 text-xs">
                            <Calendar className="h-3 w-3 text-zinc-400" />
                            {new Date(c.lastVisit).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" })}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* --- DESKTOP VIEW (TABLE) --- */}
              <Card className="hidden md:block shadow-sm border-zinc-200 rounded-2xl overflow-hidden bg-white">
                <CardContent className="p-0">
                  <div className="overflow-x-auto w-full">
                    <Table className="w-full">
                      <TableHeader className="bg-zinc-50 border-b border-zinc-200">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-widest text-[10px] pl-5 py-3">Customer Details</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-widest text-[10px] py-3 text-center">Orders</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-widest text-[10px] text-right py-3">Lifetime Value</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-widest text-[10px] text-right pr-5 py-3">Last Visit</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredCustomers.map((c, idx) => (
                          <TableRow key={idx} className="border-b border-zinc-100 hover:bg-zinc-50/60 transition-colors group">
                            <TableCell className="pl-5 py-3">
                              <div className="font-bold text-sm text-zinc-900">{c.name}</div>
                              <div className="flex items-center gap-1.5 mt-0.5 text-[11px] font-semibold text-zinc-500">
                                <span>{c.phone}</span>
                                {c.phone !== "No Phone" && (
                                  <a 
                                    href={`tel:${c.phone}`} 
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-zinc-400 hover:text-emerald-600"
                                    title="Call customer"
                                  >
                                    <ArrowUpRight className="h-3 w-3" />
                                  </a>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="py-3 text-center align-middle">
                              <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-md text-[11px] font-bold bg-zinc-100 text-zinc-800 border border-zinc-200">
                                {c.totalOrders}
                              </span>
                            </TableCell>
                            <TableCell className="py-3 text-right align-middle font-bold text-sm text-zinc-900">
                              ₹{c.totalSpent.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                            </TableCell>
                            <TableCell className="pr-5 py-3 text-right align-middle text-xs font-semibold text-zinc-500">
                              {new Date(c.lastVisit).toLocaleDateString("en-IN", {
                                day: "2-digit",
                                month: "short",
                                year: "numeric",
                              })}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </AppLayout>
  );
}