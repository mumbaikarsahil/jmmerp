import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import QRCode from "react-qr-code";
import {
  Phone, CheckCircle2, Download, ExternalLink, Printer, Loader2
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

  const businessName = "जय महाराष्ट्र मसाले";
  const branchName = "(करी रोड)";
  const tagline = "आम्ही सर्व प्रकारचे मसाले ऑर्डर प्रमाणे भाजून व कुटून देतो.";
  const tenantLogo = order.tenants?.tenant_logo || "/jmmbill.png"; 
  const tenantAddress = order.tenants?.tenant_address || "दुकान नं. 3, बावला मस्जिद शेजारी, डिलाईल रोड, ना. म. जोशी मार्ग, करीरोड, मुंबई - 400013.";
  const tenantPhone = order.tenants?.tenant_phone ? String(order.tenants.tenant_phone) : "98679 87460 / 98679 95629";

  const customerName = order.customers?.full_name || "Walk-in Customer";
  const customerPhone = order.customers?.phone_number || "";
  const customerAddress = order.customer_address || "";

  // 🚀 FIXED: Always defaults to total_amount if balance is 0 to ensure the QR code always works
  const qrPaymentAmount = balanceDue > 0 ? balanceDue : safeNumber(order.total_amount);
  const upiLink = `upi://pay?pa=9867987460@okbizaxis&pn=JMM&cu=INR&am=${qrPaymentAmount.toFixed(2)}`;

  const handlePrint = () => { window.print(); };

  const downloadQR = () => {
    const svg = document.getElementById("payment-qr-code");
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = "JMM-Payment-QR.png";
      downloadLink.href = `${pngFile}`;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(svgData);
  };

  return (
    <> 
      <style>
        {`          
          /* 🚀 LOAD MARATHI FONT */
          @import url('https://fonts.googleapis.com/css2?family=Yatra+One&display=swap');

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
          <button onClick={handlePrint} className="flex items-center gap-2 bg-zinc-900 hover:bg-zinc-800 text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-md transition-transform active:scale-95">
            <Printer size={18} /> Print Bill
          </button>
        </div>

        <div className="w-full max-w-[800px] bg-white shadow-xl invoice-container border border-zinc-300 relative overflow-hidden rounded-xl sm:rounded-none">
          <div className="h-3 w-full bg-black print-exact"></div>

          <div className="p-4 sm:p-8">
            <div className="text-center mb-6 flex flex-col items-center">
              {/* 🚀 FIXED: Removed grayscale filter so logo shows in full color */}
              {tenantLogo && ( <img src={tenantLogo} alt="JMM Logo" className="h-28 w-auto object-contain mb-1 print-exact" /> )}
              <h1 className="text-3xl sm:text-5xl font-black text-black tracking-tight print-exact font-['Yatra_One'] -mt-3">{businessName}</h1>
              <h2 className="text-xl sm:text-2xl font-black text-black tracking-tight print-exact font-['Yatra_One'] mb-2">{branchName}</h2>
              
              <h3 className="text-sm sm:text-base font-black text-zinc-800 mb-2">{tagline}</h3>
              <p className="text-xs sm:text-sm text-zinc-700 font-bold max-w-lg mx-auto leading-relaxed border-t border-dashed border-zinc-400 pt-2 px-4">{tenantAddress}</p>
              
              <div className="flex justify-center items-center gap-4 mt-2 text-sm sm:text-base font-black text-black">
                <span className="flex items-center gap-1.5"><Phone className="h-4 w-4" /> {tenantPhone}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 border-2 border-black mb-6 print-exact text-sm font-bold text-black">
              <div className="border-r-2 border-b-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">नाव (Name)</div>
              <div className="border-b-2 border-black p-2 md:border-r-2 flex items-center col-span-1 md:col-span-1 truncate">{customerName}</div>
              <div className="border-r-2 border-b-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">मोबाईल (Mobile)</div>
              <div className="border-b-2 border-black p-2 flex items-center truncate">{customerPhone || '-'}</div>
              <div className="border-r-2 border-black p-2 bg-zinc-100 print-exact flex items-center justify-center">बिल क्र. (Bill No)</div>
              <div className="border-r-2 border-black p-2 flex items-center text-black print-exact">{order.order_number}</div>
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
                <tr className="bg-zinc-100 print-exact border-b-2 border-black text-center">
                  <th className="border-r-2 border-black px-3 py-2 w-[60%]">तपशील (Item Details)</th>
                  <th className="border-r-2 border-black px-3 py-2 w-[20%]">वजन (Qty)</th>
                  <th className="px-3 py-2 w-[20%]">किंमत (Price)</th>
                </tr>
              </thead>
              <tbody>
                {physicalItems.map((item, idx) => {
                  const hasCustomIngredients = item.order_item_ingredients && item.order_item_ingredients.length > 0;
                  
                  let givenTag = "";
                  const handedOverQty = Number(item.handed_over_qty || 0);
                  if (handedOverQty > 0) {
                      if (handedOverQty === item.quantity || item.quantity === 1) {
                          givenTag = " (हातोहात)"; 
                      } else {
                          givenTag = ` (${handedOverQty} हातोहात)`; 
                      }
                  }
                  
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
                                 <span className="text-black font-bold">{ing.items?.item_name || "Spice"}</span>
                               </td>
                               {/* 🚀 FIXED: Removed the Given/Switch toggles completely */}
                               <td className="border-r-2 border-black px-3 py-2 text-center align-middle whitespace-nowrap">
                                 {formatCartWeight(ing.custom_quantity, ing.unit)}
                                 {givenTag && <div className="text-[11px] mt-1 text-zinc-600">{givenTag}</div>}
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
                                <span className="text-black font-bold">{item.items?.item_name || "Unknown Item"}{sizeStr}</span>
                              </td>
                              {/* 🚀 FIXED: Removed the Given/Switch toggles completely */}
                              <td className="border-r-2 border-black px-3 py-2 text-center align-middle whitespace-nowrap">
                                {formatCartWeight(Math.abs(item.quantity), printUnit, item.items?.size)}
                                {givenTag && <div className="text-[11px] mt-1 text-zinc-600">{givenTag}</div>}
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

                  <tr className="border-b-2 border-black bg-zinc-100 print-exact text-lg font-black">
                    <td className="border-r-2 border-black px-3 py-3 text-right">एकूण बिलाची रक्कम (Grand Total)</td>
                    <td className="px-3 py-3 text-right text-black">{safeNumber(order.total_amount).toFixed(0)}</td>
                  </tr>

                  {totalPaid > 0 && balanceDue > 0 && (
                    <>
                      <tr className="border-b border-black">
                        <td className="border-r-2 border-black px-3 py-2 text-right text-black font-black">ऍडव्हान्स जमा (Advance Paid)</td>
                        <td className="px-3 py-2 text-right text-black font-black">-{totalPaid.toFixed(0)}</td>
                      </tr>
                      <tr className="bg-zinc-100 print-exact text-lg font-black">
                        <td className="border-r-2 border-black px-3 py-3 text-right text-black">बाकी रक्कम (Balance Due)</td>
                        <td className="px-3 py-3 text-right text-black">{balanceDue.toFixed(0)}</td>
                      </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>

            <div className="mt-10 pt-8 border-t-2 border-dashed border-zinc-400 text-center flex flex-col items-center">
              
              {/* 🚀 FIXED: QR Code now always displays (uses Total Amount if balance is 0) */}
              <div className="flex flex-col items-center justify-center mb-8 no-print bg-zinc-50 p-6 rounded-3xl border border-zinc-200 shadow-sm w-full sm:w-auto">
                <a href={upiLink} className="bg-white p-3 rounded-2xl shadow-md border border-zinc-200 hover:scale-105 transition-transform cursor-pointer block">
                  <QRCode id="payment-qr-code" value={upiLink} size={150} />
                </a>
                
                <h3 className="mt-4 text-lg font-black text-zinc-900">Scan to Pay: ₹{qrPaymentAmount.toFixed(0)}</h3>
                <p className="text-xs font-bold text-zinc-500 uppercase tracking-widest mt-1 mb-4">
                  {isPaid ? "For your records / future payments" : "पेमेंट केल्यावर कृपया स्क्रीनशॉट पाठवा"}
                </p>
                
                <div className="flex gap-2">
                   <a href={upiLink} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors md:hidden">
                      <ExternalLink size={14}/> Pay Now
                   </a>
                   <button onClick={downloadQR} className="flex items-center gap-2 bg-white border border-zinc-300 text-zinc-700 hover:bg-zinc-100 px-4 py-2 rounded-xl text-xs font-bold shadow-sm transition-colors">
                      <Download size={14}/> Download QR
                   </button>
                </div>
              </div>

              <div className="flex justify-center items-center gap-2 mb-2 no-print">
                {isPaid ? (
                  <span className="bg-emerald-100 text-emerald-800 px-4 py-1.5 rounded-full text-sm font-black flex items-center gap-1 border border-emerald-200 shadow-sm">
                    <CheckCircle2 className="h-4.5 w-4.5" /> Payment Complete
                  </span>
                ) : (
                  <span className="bg-amber-100 text-amber-800 px-4 py-1.5 rounded-full text-sm font-black flex items-center gap-1 border border-amber-200 shadow-sm">
                    <Loader2 className="h-4.5 w-4.5 animate-spin" /> Pending Dues: ₹{balanceDue.toFixed(0)}
                  </span>
                )}
              </div>
              
              <p className="text-sm font-black text-black uppercase tracking-widest mt-4">
                धन्यवाद! पुन्हा भेट द्या.
              </p>
              
              <div className="mt-4 w-full flex flex-col gap-1 text-[12px] font-bold text-zinc-500 pt-2 text-center no-print border-t border-zinc-200">
                  <span>www.thejmmindia.com</span>
                  <span>This is a computer-generated invoice via Biillo OS.</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </>
  );
}
