import React from "react";

// EXACT JMM STRICT SEQUENCE (Updated with new sorting & spelling fallbacks)
const MASALA_SEQUENCE = [
  "बेडगी", "लवंगी", "गावठी", "काश्मिरी", "संकेश्वरी", "निप्पाणी", "मिरची", 
  "धने", "धणे", "हळकुंड", "मिरी", "बडिशेप", "बडीशेप", "जिरा", "तिळ", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी", 
  "पिंपरी", "पिंपळी", "हिंग", "मेथी", "राई", "सुंठ", "हिरवी वेलची", 
  "गुलाब पाकळी", "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
];

const normalizeUnitStr = (str: string) => String(str || "").toLowerCase().trim();

// Safely handle Supabase joins whether they return an object or an array
const getItemObj = (itemsField: any) => {
  if (!itemsField) return null;
  return Array.isArray(itemsField) ? itemsField[0] : itemsField;
};

// Bulletproof weight normalizer: converts grams to kilograms for accurate pricing
const getNormalizedQtyForCost = (qty: number, displayUnit: string, dbBaseUnit: string) => {
  const u = normalizeUnitStr(displayUnit); 
  const bu = normalizeUnitStr(dbBaseUnit);
  
  if (['g', 'gm', 'gram', 'grams', 'ग्रॅम', 'ग्राम'].includes(u)) return qty / 1000;
  if (u === 'piece' || u === 'nug' || u === 'pcs' || bu === 'piece') return qty;
  if (qty >= 10 && (bu.includes('kg') || !bu)) return qty / 1000;
  return qty;
};

export const ThermalReceipt = ({ order, source = "billing" }: { order: any, source?: "billing" | "sales" }) => {
  if (!order) return null;

  // 1. Normalize Core Data
  const customerName = order.customerName || order.customers?.full_name || "Walk-in Customer";
  const customerPhone = order.customerPhone || order.customers?.phone_number || "";
  const customerAddress = order.customerAddress || order.customers?.address || "";
  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN');
  const totalAmount = Math.floor(order.final_amount || order.total_amount || 0);
  const advancePaid = Math.floor(order.advancePaid || order.amount_paid || 0);
  const balanceDue = Math.floor(order.balanceDue || order.balance_due || 0);
  const totalMixWeightKg = order.totalMixWeightKg || 0;

  // Additional Meta Info
  const orderMode = order.source || "WALK_IN";
  const orderNotes = order.notes || "";
  const paymentsList = order.payments || []; // Array of { method: string, amount: number }

  const footerText = "Thank you for shopping! Visit again.";

  // 2. Normalize Line Items & Services based on Source
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

  return (
    <div id="printable-receipt" className="hidden print:block">
      <style type="text/css" media="print">
        {`
          html, body { height: auto !important; min-height: auto !important; overflow: visible !important; }
          body * { visibility: hidden; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
          
          #printable-receipt { 
            position: absolute; left: 0; top: 0; right: 0;
            width: 100%; max-width: 148mm; 
            margin: 0 auto; padding: 10px; 
            background: white; color: black; font-family: sans-serif; 
            font-size: 14px;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }

          [role="dialog"], [data-radix-portal] {
            position: static !important; height: auto !important; max-height: none !important; overflow: visible !important; transform: none !important;
          }

          @page { margin: 0mm; }

          table { width: 100%; border-collapse: collapse; margin-top: 5px; border: 2px solid black; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          th, td { border: 1px solid black; padding: 5px 8px; color: black !important; }
          th { font-weight: bold; text-align: center; border-bottom: 2px solid black; }
          
          .td-item { font-weight: bold; width: 45%; }
          .td-wgt { text-align: center; font-weight: bold; width: 25%; border-left: 2px solid black; border-right: 2px solid black; }
          .td-rs { text-align: right; font-weight: bold; width: 20%; }
          .td-paise { text-align: center; font-weight: bold; width: 10%; border-left: 2px solid black; }
          
          .totals-row td { border-top: 2px solid black; font-weight: 900; }
          .payment-breakdown td { border-top: 1px dashed black; font-weight: 600; font-size: 13px; }
          
          .meta-header { display: flex; justify-content: space-between; font-weight: bold; font-size: 12px; margin-bottom: 5px; padding: 0 5px; border-bottom: 1px solid black; padding-bottom: 4px; }
          .customer-info { font-weight: bold; font-size: 14px; margin-bottom: 10px; padding: 0 5px; line-height: 1.4; }
          .header-image { width: 100%; object-fit: contain; margin-bottom: 5px; border-bottom: 3px solid #880000; }
          
          .receipt-footer { margin-top: 15px; text-align: center; font-size: 13px; }
          .receipt-footer .thank-you { font-weight: 600; font-style: italic; margin-bottom: 2px; }
          .receipt-footer .notes { margin-top: 8px; font-weight: bold; font-size: 14px; border: 1px dashed black; padding: 5px; display: inline-block;}
          .footer-image { width: 100%; max-height: 200px; object-fit: contain; margin-top: 0; page-break-inside: avoid; }
        `}
      </style>
      
      <img src="/jmm-bill-header.png" alt="JMM Spices Header" className="header-image" />
      
      <div className="meta-header">
        <div>No: {order.order_number}</div>
        <div>Mode: {orderMode.replace('_', ' ')}</div>
        <div>Date: {dateStr}</div>
      </div>

      <div className="customer-info">
        <div>नाव: {customerName} {customerPhone ? `(${customerPhone})` : ''}</div>
        {customerAddress && <div>पत्ता: {customerAddress}</div>}
      </div>

      <table>
        <thead>
          <tr>
            <th>तपशील</th>
            <th className="td-wgt">वजन</th>
            <th className="td-rs">रुपये</th>
            <th className="td-paise">पैसे</th>
          </tr>
        </thead>
        <tbody>
          {itemLines.map((line, idx) => (
            <tr key={idx}>
              <td className="td-item">{line.name}</td>
              <td className="td-wgt">{line.wgt}</td>
              <td className="td-rs">{line.rs}</td>
              <td className="td-paise">00</td>
            </tr>
          ))}

          <tr className="totals-row">
            <td className="td-item">एकूण वजन</td>
            <td className="td-wgt">{totalMixWeightKg ? `${totalMixWeightKg.toFixed(3)} kg` : '-'}</td>
            <td className="td-rs bg-gray-100"></td>
            <td className="td-paise bg-gray-100"></td>
          </tr>
          
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

          <tr className="totals-row">
            <td className="td-item" colSpan={2}>जमा रक्कम</td>
            <td className="td-rs">{advancePaid}</td>
            <td className="td-paise">00</td>
          </tr>

          {/* DYNAMIC PAYMENT BREAKDOWN */}
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
        </tbody>
      </table>

      <div className="receipt-footer">
        {orderNotes && <div className="notes">Note: {orderNotes}</div>}
        <div className="thank-you mt-2">{footerText}</div>
        <img src="/jmm-bill-footer.png" alt="JMM Spices Footer" className="footer-image" />
      </div>

    </div>
  );
};