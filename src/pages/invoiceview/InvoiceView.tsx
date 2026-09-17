import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  MapPin,
  Loader2,
  Printer,
  Phone,
  CheckCircle2,
  Download
} from "lucide-react";

export default function InvoiceView() {
  const { id } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBill();
  }, [id]);

  const fetchBill = async () => {
    if (!id) return;

    try {
      // 1. Fetch Order & Tenant/Customer Details
      const { data: orderData, error: orderError } = await (supabase as any)
        .from("orders")
        .select(`
          *,
          customers(full_name, phone_number),
          tenants(tenant_name, tenant_logo, tenant_address, tenant_contact_name, tenant_phone)
        `)
        .eq("id", id)
        .single();

      if (orderError) throw orderError;
      if (!orderData) throw new Error("Order not found");

      const currentOrder = orderData as any; // Bypasses the 'never' type restriction

      // 2. Fetch Order Items & Custom Ingredients (Mix Masala support)
      const { data: itemsData, error: itemsError } = await (supabase as any)
        .from("order_items")
        .select(`
          *,
          items ( item_name, base_unit, item_type ),
          order_item_ingredients (
            custom_quantity, unit,
            items ( item_name )
          )
        `)
        .eq("order_id", currentOrder.id);

      if (itemsError) throw itemsError;

      // 3. Fetch Payments
      const { data: paymentsData } = await (supabase as any)
        .from("payments")
        .select("*")
        .eq("order_id", currentOrder.id);

      setOrder(currentOrder);
      setItems(itemsData || []);
      setPayments(paymentsData || []);
    } catch (error) {
      console.error("Error fetching invoice:", error);
    } finally {
      setLoading(false);
    }
  };

  const safeNumber = (value: any) => Number(value || 0);

  if (loading) {
    return ( 
      <div className="h-[100dvh] flex flex-col items-center justify-center bg-zinc-50"> 
        <Loader2 className="h-8 w-8 animate-spin text-orange-600 mb-4" /> 
        <p className="text-zinc-500 font-bold">Fetching JMM Receipt...</p> 
      </div>
    );
  }

  if (!order) {
    return ( 
      <div className="h-[100dvh] flex items-center justify-center bg-zinc-50 text-zinc-500 font-bold">
        Invoice not found or link expired. 
      </div>
    );
  }

  // --- CALCULATIONS & DATA EXTRACTION ---
  const totalPaid = payments.reduce((sum, p) => sum + safeNumber(p.amount), 0);
  const balanceDue = Math.max(0, safeNumber(order.total_amount) - totalPaid);
  const isPaid = balanceDue <= 0;

  // Separate Labour Charge (मजूरी) from Physical Items
  const labourItems = items.filter(i => i.items?.item_type === 'SERVICE' || i.items?.item_name?.includes('Labour') || i.items?.item_name?.includes('मजूरी'));
  const physicalItems = items.filter(i => i.items?.item_type !== 'SERVICE' && !i.items?.item_name?.includes('Labour') && !i.items?.item_name?.includes('मजूरी'));

  const totalLabourCharge = labourItems.reduce((sum, item) => sum + safeNumber(item.price_at_order), 0);
  const totalMaterialCost = physicalItems.reduce((sum, item) => sum + safeNumber(item.price_at_order), 0);

  // Store details (With JMM Defaults if missing)
  const businessName = order.tenants?.tenant_name || "जय महाराष्ट्र मसाले (JMM)";
  const tenantLogo = order.tenants?.tenant_logo || "/logo.png";
  const tenantAddress = order.tenants?.tenant_address || "दुकान नं. 3, बाबला मस्जिद शेजारी, डिलाई रोड, ना. म. जोशी मार्ग, करीरोड, मुंबई - 400013.";
  const tenantPhone = order.tenants?.tenant_phone ? String(order.tenants.tenant_phone) : "98679 87460 / 98679 95629";

  // Customer details
  const customerName = order.customers?.full_name || "Walk-in Customer";
  const customerPhone = order.customers?.phone_number || "";

  const handlePrint = () => {
    window.print();
  };

  return (
    <> 
      <style>
        {`          
          @media print {
            body { background-color: white !important; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .invoice-container { box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; }
          }
        `} 
      </style>

      <div className="min-h-screen bg-zinc-100 py-6 px-2 md:py-10 md:px-8 flex flex-col items-center font-sans">
        
        {/* --- ACTION BUTTONS (Hidden on Print) --- */}
        <div className="w-full max-w-[800px] flex justify-end gap-3 mb-4 no-print px-2">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95"
          >
            <Printer size={18} />
            Print Bill
          </button>
        </div>

        {/* --- MAIN INVOICE PAPER --- */}
        <div className="w-full max-w-[800px] bg-white shadow-xl invoice-container border border-zinc-300 relative overflow-hidden">
          
          {/* Top Border Accent */}
          <div className="h-3 w-full bg-orange-600 print-exact"></div>

          <div className="p-4 sm:p-8">
            {/* HEADER SECTION */}
            <div className="text-center mb-6">
              <h2 className="text-xs sm:text-sm font-bold text-zinc-700 mb-1">
                आम्ही सर्व प्रकारचे मसाले ऑर्डर प्रमाणे भाजून व कुटून देतो.
              </h2>
              <div className="flex justify-center items-center gap-3 mb-2">
                <h1 className="text-2xl sm:text-4xl font-black text-orange-600 tracking-tight print-exact">
                  {businessName}
                </h1>
              </div>
              <p className="text-xs sm:text-sm text-zinc-800 font-semibold max-w-lg mx-auto leading-relaxed">
                {tenantAddress}
              </p>
              <div className="flex justify-center items-center gap-4 mt-2 text-xs sm:text-sm font-bold text-zinc-800">
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {tenantPhone}</span>
              </div>
            </div>

            {/* CUSTOMER & BILL META GRID */}
            <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-black mb-6 print-exact text-sm font-bold text-black">
              {/* Row 1 */}
              <div className="border-r-2 border-b-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">नाव (Name)</div>
              <div className="border-b-2 border-black p-2 md:border-r-2 flex items-center col-span-1 md:col-span-1 truncate">{customerName}</div>
              <div className="border-r-2 border-b-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">मोबाईल (Mobile)</div>
              <div className="border-b-2 border-black p-2 flex items-center truncate">{customerPhone || '-'}</div>
              
              {/* Row 2 */}
              <div className="border-r-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">बिल क्र. (Bill No)</div>
              <div className="border-r-2 border-black p-2 flex items-center text-orange-700 print-exact">{order.order_number}</div>
              <div className="border-r-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">दिनांक (Date)</div>
              <div className="border-black p-2 flex items-center">
                {new Date(order.created_at).toLocaleDateString("en-IN")}
              </div>
            </div>

            {/* MAIN ITEMS TABLE */}
            <table className="w-full border-collapse border-2 border-black text-sm font-bold text-black mb-6 print-exact">
              <thead>
                <tr className="bg-[#fde047] print-exact border-b-2 border-black text-center">
                  <th className="border-r-2 border-black px-3 py-2 w-[60%]">जिन्नस (Item Details)</th>
                  <th className="border-r-2 border-black px-3 py-2 w-[20%]">वजन (Qty)</th>
                  <th className="px-3 py-2 w-[20%]">किंमत (Price)</th>
                </tr>
              </thead>
              <tbody>
                {physicalItems.map((item, idx) => {
                  const hasCustomIngredients = item.order_item_ingredients && item.order_item_ingredients.length > 0;
                  
                  return (
                    <React.Fragment key={idx}>
                      <tr className="border-b border-black">
                        <td className="border-r-2 border-black px-3 py-2">
                          <span className="text-black">{item.items?.item_name || "Unknown Item"}</span>
                          {/* If it's a mix masala, show ingredients indented */}
                          {hasCustomIngredients && (
                            <div className="mt-1.5 pl-3 space-y-0.5">
                              {item.order_item_ingredients.map((ing: any, i: number) => (
                                <div key={i} className="text-xs text-zinc-600 font-semibold flex justify-between pr-4">
                                  <span>• {ing.items?.item_name}</span>
                                  <span>{ing.custom_quantity} {ing.unit}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="border-r-2 border-black px-3 py-2 text-center align-top">
                          {item.quantity} {item.items?.base_unit || 'unit'}
                        </td>
                        <td className="px-3 py-2 text-right align-top">
                          {safeNumber(item.price_at_order).toFixed(0)}
                        </td>
                      </tr>
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {/* SUMMARY TOTALS */}
            <div className="flex justify-end">
              <table className="w-full sm:w-[60%] border-collapse border-2 border-black text-sm font-bold text-black print-exact">
                <tbody>
                  <tr className="border-b border-black">
                    <td className="border-r-2 border-black px-3 py-2 text-right w-[60%]">फक्त मालाची किंमत (Material Cost)</td>
                    <td className="px-3 py-2 text-right w-[40%]">{totalMaterialCost.toFixed(0)}</td>
                  </tr>
                  
                  {totalLabourCharge > 0 && (
                    <tr className="border-b border-black">
                      <td className="border-r-2 border-black px-3 py-2 text-right">कुटणावळ मजुरी (Labour/Grinding)</td>
                      <td className="px-3 py-2 text-right">{totalLabourCharge.toFixed(0)}</td>
                    </tr>
                  )}

                  <tr className="border-b-2 border-black bg-zinc-100 print-exact text-lg">
                    <td className="border-r-2 border-black px-3 py-3 text-right">एकूण बिलाची रक्कम (Grand Total)</td>
                    <td className="px-3 py-3 text-right text-orange-700">{safeNumber(order.total_amount).toFixed(0)}</td>
                  </tr>

                  {totalPaid > 0 && balanceDue > 0 && (
                    <>
                      <tr className="border-b border-black">
                        <td className="border-r-2 border-black px-3 py-2 text-right text-emerald-700">ऍडव्हान्स जमा (Advance Paid)</td>
                        <td className="px-3 py-2 text-right text-emerald-700">-{totalPaid.toFixed(0)}</td>
                      </tr>
                      <tr className="bg-red-50 print-exact text-lg">
                        <td className="border-r-2 border-black px-3 py-3 text-right text-red-700">बाकी रक्कम (Balance Due)</td>
                        <td className="px-3 py-3 text-right text-red-700">{balanceDue.toFixed(0)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {/* FOOTER MESSAGES */}
            <div className="mt-10 pt-4 border-t border-dashed border-zinc-300 text-center">
              <div className="flex justify-center items-center gap-2 mb-2 no-print">
                {isPaid ? (
                  <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="h-4 w-4" /> Payment Complete
                  </span>
                ) : (
                  <span className="bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                    <Loader2 className="h-4 w-4 animate-spin" /> Pending Dues: ₹{balanceDue.toFixed(0)}
                  </span>
                )}
              </div>
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
                धन्यवाद! पुन्हा भेट द्या.
              </p>
              <p className="text-[10px] text-zinc-400 mt-1 font-semibold">
                This is a computer-generated invoice via Biillo OS.
              </p>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}