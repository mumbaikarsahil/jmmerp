import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import QRCode from "react-qr-code";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  MapPin, Loader2, Printer, Phone, CheckCircle2, Download
} from "lucide-react";

const normalizeUnitStr = (str: string) => String(str || "").toLowerCase().trim();

const getNormalizedQtyForCost = (qty: number, displayUnit: string, dbBaseUnit: string) => {
  const u = normalizeUnitStr(displayUnit); 
  const bu = normalizeUnitStr(dbBaseUnit);
  if (['piece', 'nug', 'pcs', 'pc'].includes(u) || ['piece', 'nug', 'pcs', 'pc'].includes(bu)) return qty;
  
  let parsedUnit = u;
  const match = u.match(/^([\d.]+)\s*(kg|g|gm|gram|l|ml)$/i);
  if (match) parsedUnit = match[2].toLowerCase();

  if (['g', 'gm', 'gram', 'grams', 'ग्रॅम', 'ग्राम'].includes(bu)) {
    if (parsedUnit === 'kg') return qty * 1000; 
    return qty; 
  }
  if (['kg', 'litre', 'l', 'ml'].includes(bu) || !bu) {
    if (['g', 'gm', 'gram', 'grams', 'ग्रॅम', 'ग्राम', 'ml'].includes(parsedUnit)) return qty / 1000; 
    if (parsedUnit === 'kg' && qty >= 20) return qty / 1000; 
    return qty; 
  }
  return qty;
};

// 🚀 FIXED: Accurately parses "4 x 5kg" and ignores DB sizes like "M"
const formatCartWeight = (qty: number, unit: string, customSize?: string) => {
  const u1 = normalizeUnitStr(unit);
  const u2 = normalizeUnitStr(customSize || "");
  
  const effectiveUnit = u1.match(/^([\d.]+)\s*(kg|g|gm|gram|l|ml)$/i) ? u1 : (u2.match(/^([\d.]+)\s*(kg|g|gm|gram|l|ml)$/i) ? u2 : u1);
  const match = effectiveUnit.match(/^([\d.]+)\s*(kg|g|gm|gram|l|ml)$/i);
  
  if (match) {
     if (qty > 1) return `${qty} x ${effectiveUnit}`;
     return effectiveUnit;
  }

  if (effectiveUnit === 'piece' || effectiveUnit === 'nug' || effectiveUnit === 'pcs' || effectiveUnit === 'pc') return `${qty} pc`;
  if (effectiveUnit === 'kg' && qty < 1) return `${Math.round(qty * 1000)} g`;
  if (effectiveUnit === 'g' && qty >= 1000) return `${(qty / 1000).toFixed(2)} kg`;
  
  return `${qty} ${effectiveUnit}`;
};

export default function InvoiceView() {
  const { id } = useParams();
  const [order, setOrder] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // 🚀 ADDED: Allows you to mark an item as given directly from the Invoice View
  const toggleHandedOver = async (orderItemId: string, currentStatus: boolean) => {
      try {
          const newStatus = !currentStatus;
          await (supabase as any).from('order_items').update({ is_handed_over: newStatus }).eq('id', orderItemId);
          
          setItems(prev => prev.map(i => i.id === orderItemId ? { ...i, is_handed_over: newStatus } : i));
          
          toast({ title: "Updated Handed Over Status" });
      } catch (e) {
          toast({ title: "Error updating status", variant: "destructive" });
      }
  };

  useEffect(() => {
    fetchBill();
  }, [id]);

  const fetchBill = async () => {
    if (!id) return;

    try {
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

      const currentOrder = orderData as any;

      const { data: itemsData, error: itemsError } = await (supabase as any)
        .from("order_items")
        .select(`
          *,
          items ( item_name, base_unit, item_type, selling_price, size ),
          order_item_ingredients (
            custom_quantity, unit,
            items ( item_name, selling_price, base_unit )
          )
        `)
        .eq("order_id", currentOrder.id);

      if (itemsError) throw itemsError;

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

  const totalPaid = payments.reduce((sum, p) => sum + safeNumber(p.amount), 0);
  const balanceDue = Math.max(0, safeNumber(order.total_amount) - totalPaid);
  const isPaid = balanceDue <= 0;

  const labourItems = items.filter(i => i.items?.item_type === 'SERVICE' || i.items?.item_name?.includes('Labour') || i.items?.item_name?.includes('मजूरी'));
  const physicalItems = items.filter(i => i.items?.item_type !== 'SERVICE' && !i.items?.item_name?.includes('Labour') && !i.items?.item_name?.includes('मजूरी'));

  const totalLabourCharge = Math.round(labourItems.reduce((sum, item) => sum + Math.abs(safeNumber(item.quantity) * safeNumber(item.price_at_order)), 0));
  
  const totalMaterialCost = Math.round(physicalItems.reduce((sum, item) => {
    let lineTotal = 0;
    if (item.order_item_ingredients && item.order_item_ingredients.length > 0) {
      item.order_item_ingredients.forEach((ing: any) => {
        const rawPrice = safeNumber(ing.items?.selling_price);
        const normalizedQty = getNormalizedQtyForCost(ing.custom_quantity, ing.unit, ing.items?.base_unit || 'kg');
        lineTotal += (normalizedQty * rawPrice);
      });
    } else {
      lineTotal = Math.abs(safeNumber(item.quantity) * safeNumber(item.price_at_order));
    }
    return sum + lineTotal;
  }, 0));
  
  const deliveryCharge = safeNumber(order.delivery_charge);

  const businessName = order.tenants?.tenant_name || "जय महाराष्ट्र मसाले (JMM)";
  const tenantLogo = order.tenants?.tenant_logo || "/jmmlogo.png"; 
  const tenantAddress = order.tenants?.tenant_address || "दुकान नं. 3, बाबला मस्जिद शेजारी, डिलाई रोड, ना. म. जोशी मार्ग, करीरोड, मुंबई - 400013.";
  const tenantPhone = order.tenants?.tenant_phone ? String(order.tenants.tenant_phone) : "98679 87460 / 98679 95629";

  const customerName = order.customers?.full_name || "Walk-in Customer";
  const customerPhone = order.customers?.phone_number || "";
  const customerAddress = order.customer_address || "";

  const handlePrint = () => { window.print(); };

  return (
    <> 
      <style>
        {`          
          @media print {
            body { background-color: white !important; margin: 0; padding: 0; }
            .no-print { display: none !important; }
            .print-exact { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
            .invoice-container { box-shadow: none !important; margin: 0 !important; width: 100% !important; max-width: 100% !important; border: 0 !important; }
          }
        `} 
      </style>

      <div className="min-h-screen bg-zinc-100 py-6 px-2 md:py-10 md:px-8 flex flex-col items-center font-sans">
        <div className="w-full max-w-[800px] flex justify-end gap-3 mb-4 no-print px-2">
          <button onClick={handlePrint} className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95">
            <Printer size={18} /> Download Bill
          </button>
        </div>

        <div className="w-full max-w-[800px] bg-white shadow-xl invoice-container border border-zinc-300 relative overflow-hidden rounded-xl sm:rounded-none">
          <div className="h-3 w-full bg-orange-600 print-exact"></div>

          <div className="p-4 sm:p-8">
            <div className="text-center mb-6 flex flex-col items-center">
              {tenantLogo && ( <img src={tenantLogo} alt="Business Logo" className="h-20 w-auto object-contain mb-3 print-exact" /> )}
              <h2 className="text-xs sm:text-sm font-bold text-zinc-700 mb-1">आम्ही सर्व प्रकारचे मसाले ऑर्डर प्रमाणे भाजून व कुटून देतो.</h2>
              <div className="flex justify-center items-center gap-3 mb-2"><h1 className="text-2xl sm:text-4xl font-black text-orange-600 tracking-tight print-exact">{businessName}</h1></div>
              <p className="text-xs sm:text-sm text-zinc-800 font-semibold max-w-lg mx-auto leading-relaxed">{tenantAddress}</p>
              <div className="flex justify-center items-center gap-4 mt-2 text-xs sm:text-sm font-bold text-zinc-800">
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {tenantPhone}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-black mb-6 print-exact text-sm font-bold text-black">
              <div className="border-r-2 border-b-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">नाव (Name)</div>
              <div className="border-b-2 border-black p-2 md:border-r-2 flex items-center col-span-1 md:col-span-1 truncate">{customerName}</div>
              <div className="border-r-2 border-b-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">मोबाईल (Mobile)</div>
              <div className="border-b-2 border-black p-2 flex items-center truncate">{customerPhone || '-'}</div>
              <div className="border-r-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">बिल क्र. (Bill No)</div>
              <div className="border-r-2 border-black p-2 flex items-center text-orange-700 print-exact">{order.order_number}</div>
              <div className="border-r-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">दिनांक (Date)</div>
              <div className="border-black p-2 flex items-center">{new Date(order.created_at).toLocaleDateString("en-IN")}</div>
            </div>

            {customerAddress && (
              <div className="border-2 border-black border-t-0 -mt-[26px] mb-6 p-2 text-sm font-bold text-black flex print-exact">
                <span className="bg-zinc-100 border-r-2 border-black px-2 mr-2 py-1 -my-2 -ml-2 flex items-center justify-center whitespace-nowrap">पत्ता (Address):</span>
                <span>{customerAddress}</span>
              </div>
            )}

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
                  const givenTag = item.is_handed_over ? " (हातोहात*)" : ""; // 🚀 Added Tag string
                  
                  return (
                    <React.Fragment key={idx}>
                      {hasCustomIngredients ? (
                         item.order_item_ingredients.map((ing: any, i: number) => {
                           if (ing.custom_quantity <= 0) return null;
                           
                           const rawPrice = safeNumber(ing.items?.selling_price);
                           const normalizedQty = getNormalizedQtyForCost(ing.custom_quantity, ing.unit, ing.items?.base_unit || 'kg');
                           const lineCost = normalizedQty * rawPrice;
                           
                           return (
                             <tr key={`${idx}-${i}`} className="border-b border-black">
                               <td className="border-r-2 border-black px-3 py-2">
                                 <span className="text-black font-bold">{ing.items?.item_name || "Spice"}{givenTag}</span>
                                 
                                 {/* 🚀 ADDED: Toggle Switch for custom mixes (No Print) */}
                                 {i === 0 && (
                                   <div className="no-print mt-2 flex items-center gap-2">
                                      <span className="text-[10px] text-zinc-500 font-bold uppercase">Given Mix?</span>
                                      <Switch checked={!!item.is_handed_over} onCheckedChange={() => toggleHandedOver(item.id, !!item.is_handed_over)} className="scale-75 m-0 data-[state=checked]:bg-emerald-500" />
                                   </div>
                                 )}
                               </td>
                               <td className="border-r-2 border-black px-3 py-2 text-center align-middle whitespace-nowrap">
                                 {formatCartWeight(ing.custom_quantity, ing.unit)}
                               </td>
                               <td className="px-3 py-2 text-right align-middle">
                                 {Math.round(lineCost)}
                               </td>
                             </tr>
                           )
                         })
                      ) : (
                        (() => {
                          const sizeStr = item.items?.size ? ` (${item.items.size})` : '';
                          const printUnit = item.unit || item.items?.base_unit || 'pc';
                          
                          return (
                            <tr className="border-b border-black">
                              <td className="border-r-2 border-black px-3 py-2">
                                <span className="text-black font-bold">{item.items?.item_name || "Unknown Item"}{sizeStr}{givenTag}</span>
                                
                                {/* 🚀 ADDED: Toggle Switch for standard items (No Print) */}
                                <div className="no-print mt-2 flex items-center gap-2">
                                   <span className="text-[10px] text-zinc-500 font-bold uppercase">Given?</span>
                                   <Switch checked={!!item.is_handed_over} onCheckedChange={() => toggleHandedOver(item.id, !!item.is_handed_over)} className="scale-75 m-0 data-[state=checked]:bg-emerald-500" />
                                </div>
                              </td>
                              <td className="border-r-2 border-black px-3 py-2 text-center align-middle whitespace-nowrap">
                                {formatCartWeight(Math.abs(item.quantity), printUnit, item.items?.size)}
                              </td>
                              <td className="px-3 py-2 text-right align-middle">
                                {Math.floor(Math.abs(item.quantity * safeNumber(item.price_at_order)))}
                              </td>
                            </tr>
                          );
                        })()
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

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

                  {deliveryCharge > 0 && (
                    <tr className="border-b border-black">
                      <td className="border-r-2 border-black px-3 py-2 text-right">डिलीव्हरी फी (Delivery Fee)</td>
                      <td className="px-3 py-2 text-right">{deliveryCharge.toFixed(0)}</td>
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

            <div className="mt-10 pt-8 border-t-2 border-dashed border-zinc-300 text-center flex flex-col items-center">
              {/* 🚀 ADDED: Scannable UPI QR Code (Hidden on Physical Prints) */}
              {!isPaid && (
                <div className="flex flex-col items-center justify-center mb-8 no-print bg-zinc-50 p-4 rounded-2xl border border-zinc-200">
                  <div className="bg-white p-2 rounded-xl shadow-sm border border-zinc-200">
                    <QRCode value="upi://pay?pa=jaymaharashtramasale@upi&pn=JMM&cu=INR" size={120} />
                  </div>
                  <p className="mt-3 text-sm font-bold text-zinc-700">Scan to Pay Balance: ₹{balanceDue.toFixed(0)}</p>
                  <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">पेमेंट केल्यावर कृपया स्क्रीनशॉट पाठवा.....</p>
                </div>
              )}

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
              <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-2">
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
