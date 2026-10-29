import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// EXACT JMM STRICT SEQUENCE
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

export const ThermalReceipt = ({ 
  order, 
  source = "billing",
  printerSize = "110mm",
  isEstimate = false // Added flag for demo/estimate prints
}: { 
  order: any; 
  source?: "billing" | "sales";
  printerSize?: "80mm" | "110mm"; 
  isEstimate?: boolean;
}) => {
  const [mountNode, setMountNode] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let node = document.getElementById("receipt-portal-node");
    if (!node) {
      node = document.createElement("div");
      node.id = "receipt-portal-node";
      document.body.appendChild(node);
    }
    setMountNode(node);
  }, []);

  if (!order || !mountNode) return null;

  // Use prop flag or check if the order object itself contains the flag
  const isDemoEstimate = isEstimate || order.is_estimate;

  const customerName = order.customerName || order.customers?.full_name || "Walk-in Customer";
  const customerPhone = order.customerPhone || order.customers?.phone_number || "";
  const customerAddress = order.customerAddress || order.customers?.address || "";
  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN');
  const totalAmount = Math.floor(order.final_amount || order.total_amount || 0);
  const advancePaid = Math.floor(order.advancePaid || order.amount_paid || 0);
  const balanceDue = Math.floor(order.balanceDue || order.balance_due || 0);
  const totalMixWeightKg = order.totalMixWeightKg || 0;

  const orderMode = order.source || "WALK_IN";
  const orderNotes = order.notes || "";
  const paymentsList = order.payments || []; 

  const isCustomMasalaBill = source === "billing" 
    ? (order.cartItems || []).some((item: any) => item.customIngredients?.length > 0)
    : (order.order_items || []).some((item: any) => item.order_item_ingredients?.length > 0);

  let itemLines: any[] = [];
  let serviceLines: any[] = [];

  if (source === "billing") {
    (order.cartItems || []).forEach((item: any) => {
      if (item.customIngredients?.length > 0) {
        const sortedIng = [...item.customIngredients].sort((a, b) => {
          let idxA = MASALA_SEQUENCE.findIndex(seq => a.item_name.includes(seq));
          let idxB = MASALA_SEQUENCE.findIndex(seq => b.item_name.includes(seq));
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        sortedIng.filter((ing: any) => ing.qty > 0).forEach((ing: any) => {
           const normalizedQty = getNormalizedQtyForCost(ing.qty, ing.unit, ing.base_unit || 'kg');
           const cost = normalizedQty * Number(ing.price_per_unit || 0);
           itemLines.push({ name: ing.item_name, wgt: `${ing.qty} ${ing.unit !== 'g' && ing.unit !== 'kg' ? ing.unit : ''}`, rs: Math.round(cost) });
        });
      } else {
         itemLines.push({ name: item.item_name, wgt: `${item.cartQuantity} ${item.base_unit || 'pc'}`, rs: Math.round(item.cartQuantity * Number(item.selling_price || 0)) });
      }
    });
    serviceLines = order.receiptServices || [];
  } else {
    (order.order_items || []).forEach((item: any) => {
      const itemObj = getItemObj(item.items);
      if (itemObj?.item_type === 'SERVICE') {
        serviceLines.push({ name: itemObj.item_name, total: Math.round(Math.abs(item.quantity * Number(item.price_at_order || 0))) });
        return;
      }
      if (item.order_item_ingredients?.length > 0) {
        const sortedIng = [...item.order_item_ingredients].sort((a, b) => {
          const objA = getItemObj(a.items);
          const objB = getItemObj(b.items);
          let idxA = MASALA_SEQUENCE.findIndex(seq => objA?.item_name?.includes(seq));
          let idxB = MASALA_SEQUENCE.findIndex(seq => objB?.item_name?.includes(seq));
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        sortedIng.filter((ing: any) => ing.custom_quantity > 0).forEach((ing: any) => {
           const ingItemObj = getItemObj(ing.items);
           const rawPrice = Number(ingItemObj?.selling_price || 0);
           const normalizedQty = getNormalizedQtyForCost(ing.custom_quantity, ing.unit, ingItemObj?.base_unit || 'kg');
           const cost = normalizedQty * rawPrice;
           itemLines.push({ name: ingItemObj?.item_name || "Spice", wgt: `${ing.custom_quantity} ${ing.unit !== 'g' && ing.unit !== 'kg' ? ing.unit : ''}`, rs: Math.round(cost) });
        });
      } else {
        itemLines.push({ name: itemObj?.item_name || "Item", wgt: `${Math.abs(item.quantity)} ${itemObj?.base_unit || 'pc'}`, rs: Math.round(Math.abs(item.quantity * Number(item.price_at_order || 0))) });
      }
    });
  }

  return createPortal(
    <div id="printable-receipt" className="hidden print:block">
      <style type="text/css" media="print">
        {`
          /* DYNAMIC PAPER SIZE INJECTION */
          @page { 
            margin: 0; 
            size: ${printerSize === "110mm" ? "106mm 297mm" : "78mm 297mm"}; 
          }
          
         @media print {
            /* 1. AGGRESSIVELY HIDE THE ENTIRE APP UI AND ANY OPEN MODALS */
            #root, [data-radix-portal] { 
              display: none !important; 
            }
            
            /* 2. FORCE BACKGROUND TO WHITE */
            html, body { 
              background: #ffffff !important; 
              margin: 0 !important; 
              padding: 0 !important; 
              -webkit-print-color-adjust: exact !important; 
              print-color-adjust: exact !important; 
            }

            .thermal-print-section {
              position: absolute !important;
              top: 0 !important;
              left: 0 !important;
              /* DYNAMIC WIDTH INJECTION */
              width: ${printerSize === "110mm" ? "106mm" : "78mm"} !important; 
              max-width: 100vw !important;
              min-height: 100vh !important;
              background: #ffffff !important;
              z-index: 2147483647 !important;
              margin: 0 auto !important;
              padding: 4mm 3mm 10mm 3mm !important; 
              visibility: visible !important;
              display: block !important;
              color: #000000 !important;
              font-family: monospace, sans-serif !important;
            }

            .thermal-print-section * { visibility: visible !important; color: #000000 !important; }
          }

          /* ESTIMATE BANNER */
          .estimate-banner {
            text-align: center;
            font-weight: 900;
            font-size: 20px;
            text-transform: uppercase;
            border-bottom: 2px dashed black;
            padding-bottom: 6px;
            margin-bottom: 12px;
            letter-spacing: 1px;
            background: #f0f0f0;
          }

          /* HTML CUSTOM MASALA HEADER */
          .custom-header { text-align: center; margin-bottom: 12px; border-bottom: 1px dashed black; padding-bottom: 10px; }
          .ch-top { display: flex; justify-content: space-between; align-items: flex-start; font-weight: 900; font-size: 15px; margin-bottom: 4px; }
          .ch-logo { height: 90px; object-fit: contain; margin: 6px auto; filter: grayscale(100%) contrast(1.2); }
          .ch-title { font-size: 34px; font-weight: 900; margin: 8px 0 6px 0; letter-spacing: 0.5px; }
          .ch-sub { font-size: 13px; font-weight: bold; line-height: 1.3; margin: 3px 0; }
          .gst-band { background: black !important; color: white !important; padding: 5px 2px; margin-top: 10px; font-size: 13px; font-weight: bold; border-radius: 4px; display: flex; justify-content: space-around; align-items: center; }
          .gst-band * { color: white !important; }

          /* TEXT ONLY HEADER (Normal Bills) */
          .text-header { text-align: center; margin-bottom: 12px; border-bottom: 1px dashed black; padding-bottom: 10px; }
          .text-header h1 { font-size: 24px; font-weight: 900; margin: 0 0 5px 0; }
          .text-header p { font-size: 14px; font-weight: bold; margin: 2px 0; }

          .meta-header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px; font-weight: bold; font-size: 14px; margin-bottom: 8px; }
          .meta-header span { white-space: nowrap; }
          .customer-info { font-weight: bold; font-size: 15px; margin-bottom: 10px; line-height: 1.4; display: flex; flex-direction: column; }
          
          /* DOTTED THERMAL TABLE */
          table { width: 100%; border-collapse: collapse; margin-top: 5px; margin-bottom: 10px; table-layout: fixed; }
          tr { page-break-inside: avoid !important; break-inside: avoid-page !important; }
          
          .thermal-header-row { border-top: 1px dashed black; border-bottom: 1px dashed black; }
          .thermal-header-row th { padding: 6px 0; font-weight: 900; font-size: 15px; }
          
          td { padding: 5px 0; font-weight: bold; word-wrap: break-word; font-size: 15px; }
          
          th:first-child, td:first-child { text-align: left; }
          .td-item { width: 45%; }
          .td-wgt { text-align: center; width: 25%; }
          .td-rs { text-align: right; width: 20%; padding-right: 5px; }
          .td-paise { text-align: right; width: 10%; }
          
          .totals-row td { border-top: 1px dashed black; padding-top: 6px; padding-bottom: 6px; font-weight: 900; }
          .payment-breakdown td { border-top: none; font-weight: normal; font-size: 14px; padding: 2px 0; }
          
          .receipt-footer { margin-top: 15px; text-align: center; font-size: 14px; border-top: 1px dashed black; padding-top: 10px; page-break-inside: avoid !important; }
          .receipt-footer .thank-you { font-weight: bold; margin-bottom: 2px; }
          .receipt-footer .notes { margin-top: 8px; font-weight: bold; font-size: 14px; border: 1px dashed black; padding: 6px; display: inline-block; word-break: break-word; max-width: 100%; }

          /* HTML CUSTOM MASALA FOOTER & QR CODE */
          .custom-footer { margin-top: 15px; display: flex; flex-direction: column; align-items: center; page-break-inside: avoid !important; }
          .cf-band { background: black !important; color: white !important; border-radius: 20px; padding: 6px 12px; font-weight: bold; font-size: 15px; margin-bottom: 10px; width: 100%; text-align: center; }
          .cf-band * { color: white !important; }
          .cf-website { font-size: 16px; font-weight: bold; margin-bottom: 8px; }
          .cf-socials { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 10px; font-size: 14px; font-weight: bold; }
          .cf-social-item { display: flex; align-items: center; gap: 4px; }
          .cf-icon { width: 16px; height: 16px; fill: black; }
          .cf-icon-outline { width: 16px; height: 16px; fill: none; stroke: black; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

          .qr-section { margin-top: 20px; text-align: center; border-top: 1px dashed black; padding-top: 15px; page-break-inside: avoid !important; }
          .qr-image { width: 140px; height: 140px; margin: 0 auto; object-fit: contain; filter: grayscale(100%) contrast(1.2); }
          .qr-text { font-size: 15px; font-weight: 900; margin-top: 5px; text-transform: uppercase; letter-spacing: 1px; }
        `}
      </style>
      
      <div className="thermal-print-section">
        
        {/* ESTIMATE BANNER (Only renders if demo print) */}
        {isDemoEstimate && (
          <div className="estimate-banner">
            ESTIMATE / QUOTATION
          </div>
        )}

        {/* CONDITIONAL HEADER */}
        {isCustomMasalaBill ? (
          <div className="custom-header">
            <div className="ch-top">
              <div>गायकवाड बंधू &reg;</div>
              <div className="text-right leading-tight">
                <div>9867987460</div>
                <div>9594777194</div>
              </div>
            </div>
            
            <img src="/jmmlogo.png" alt="JMM Logo" className="ch-logo" />
            <h1 className="ch-title">जय महाराष्ट्र मसाले</h1>
            
            <p className="ch-sub">आमच्या येथे सर्व प्रकारचे अखंड मिरची आणि गरम मसाले भाजून व कुटून मिळतील.</p>
            <p className="ch-sub">दुकान नं. 3, बावला मस्जिद शेजारी, डिलाईल रोड, ना.म. जोशी मार्ग, करीरोड (प), मुंबई-13.</p>
            
            {!isDemoEstimate && (
              <div className="gst-band">
                <span>GSTIN : 27AAKPG4562D1ZU</span>
                <span>•</span>
                <span>FSSAI NO. : 11518004000348</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-header">
            <h1>जय महाराष्ट्र मसाले</h1>
            <p>दुकान नं. 3, बावला मस्जिद शेजारी,</p>
            <p>करीरोड (प), मुंबई-13.</p>
            <p>9867987460 / 9594777194</p>
          </div>
        )}
        
        <div className="meta-header">
          <span className="whitespace-nowrap">No: {order.order_number}</span>
          {!isDemoEstimate && <span className="whitespace-nowrap">Mode: {orderMode.replace('_', ' ')}</span>}
          <span className="whitespace-nowrap">Date: {dateStr}</span>
        </div>

        <div className="customer-info">
          <div>नाव: {customerName} {customerPhone ? `(${customerPhone})` : ''}</div>
          {customerAddress && <div>पत्ता: {customerAddress}</div>}
        </div>

        <table>
          <tbody>
            <tr className="thermal-header-row">
              <th>तपशील</th>
              <th className="td-wgt">वजन</th>
              <th className="td-rs">रुपये</th>
              <th className="td-paise">पैसे</th>
            </tr>

            {itemLines.map((line, idx) => (
              <tr key={idx}>
                <td className="td-item">{line.name}</td>
                <td className="td-wgt">{line.wgt}</td>
                <td className="td-rs">{line.rs}</td>
                <td className="td-paise">00</td>
              </tr>
            ))}

            {isCustomMasalaBill && (
              <tr className="totals-row">
                <td className="td-item">एकूण वजन</td>
                <td className="td-wgt">{totalMixWeightKg ? `${totalMixWeightKg.toFixed(3)} kg` : '-'}</td>
                <td className="td-rs"></td>
                <td className="td-paise"></td>
              </tr>
            )}
            
            {serviceLines.map((svc: any, idx: number) => (
              <tr key={`svc-${idx}`} className="totals-row">
                <td className="td-item" colSpan={2}>{svc.name}</td>
                <td className="td-rs">{svc.total}</td>
                <td className="td-paise">00</td>
              </tr>
            ))}
            
            <tr className="totals-row">
              <td className="td-item" colSpan={2}>एकूण रुपये</td>
              <td className="td-rs text-lg">{totalAmount}</td>
              <td className="td-paise">00</td>
            </tr>

            {/* HIDE ADVANCE & DUE IF THIS IS JUST AN ESTIMATE */}
            {!isDemoEstimate && (
              <>
                <tr>
                  <td className="td-item" colSpan={2}>जमा रक्कम</td>
                  <td className="td-rs">{advancePaid}</td>
                  <td className="td-paise">00</td>
                </tr>

                {paymentsList.length > 0 && paymentsList.map((payment: any, i: number) => (
                  <tr key={`pay-${i}`} className="payment-breakdown">
                    <td className="td-item text-right pr-4" colSpan={2}>via {payment.payment_method || payment.method}</td>
                    <td className="td-rs">{payment.amount}</td>
                    <td className="td-paise">00</td>
                  </tr>
                ))}

                <tr className="totals-row">
                  <td className="td-item" colSpan={2}>एकूण शिल्लक (Due)</td>
                  <td className="td-rs">{balanceDue}</td>
                  <td className="td-paise">00</td>
                </tr>
              </>
            )}
          </tbody>
        </table>

        <div className="receipt-footer">
          {orderNotes && <div className="notes">Note: {orderNotes}</div>}
          <div className="thank-you">
            {isDemoEstimate ? "This is an estimate only." : "Thank you for shopping! Visit again."}
          </div>
          
          {/* CONDITIONAL PURE HTML FOOTER */}
          {isCustomMasalaBill && !isDemoEstimate && (
            <div className="custom-footer">
              <div className="cf-band">
                सर्व प्रकारचे मसाले ऑर्डर प्रमाणे बनवून मिळतील.
              </div>
              <div className="cf-website">Visit us: www.jmmspices.in</div>
              <div className="cf-socials">
                <span>Follow us on :</span>
                
                {/* Facebook Icon */}
                <div className="cf-social-item">
                  <svg viewBox="0 0 24 24" className="cf-icon">
                    <path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-1.1 0-2 .9-2 2v1h4l-1 3h-3v6.8c4.56-.93 8-4.96 8-9.8z"/>
                  </svg>
                  <span>jay_maharashtra_masale_jmm</span>
                </div>
                
                {/* Instagram Icon */}
                <div className="cf-social-item">
                  <svg viewBox="0 0 24 24" className="cf-icon-outline">
                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                  </svg>
                  <span>the_jmm_curryroad</span>
                </div>
              </div>
            </div>
          )}
          
          {/* UPI QR CODE FOR ACTUAL BILLS */}
          {!isDemoEstimate && balanceDue > 0 && (
            <div className="qr-section">
              <img src="/upi-qr.png" alt="Scan to Pay via UPI" className="qr-image" />
              <div className="qr-text">Scan to Pay via UPI</div>
            </div>
          )}
        </div>
      </div>
    </div>,
    mountNode
  );
};