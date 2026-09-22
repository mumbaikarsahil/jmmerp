import React from "react";

// Exact JMM Strict Sequence
const MASALA_SEQUENCE = [
  "बेडगी", "लवंगी", "काश्मिरी", "मिरची", "धणे", "हळकुंड", "मिरी", "बडीशेप", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी",
  "हिंग", "मेथी", "राई", "जिरा", "पिंपळी", "सुंठ", "हिरवी वेलची", "गुलाब पाकळी", 
  "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
];

const normalizeUnitStr = (str: string) => String(str || "").toLowerCase().trim();

const getNormalizedQtyForCost = (qty: number, displayUnit: string, dbBaseUnit: string) => {
  const u = normalizeUnitStr(displayUnit); const bu = normalizeUnitStr(dbBaseUnit);
  if (u === 'piece' || u === 'nug' || u === 'pcs' || bu === 'piece') return qty;
  if ((u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') && (bu === 'kg' || bu === 'kilogram' || bu === 'kilograms')) return qty / 1000;
  if ((u === 'ml') && (bu === 'l' || bu === 'ltr' || bu === 'liter' || bu === 'liters')) return qty / 1000;
  if (qty >= 10 && bu.includes('kg')) return qty / 1000;
  return qty;
};

export const ThermalReceipt = ({ order, source = "billing" }: { order: any, source?: "billing" | "sales" }) => {
  if (!order) return null;

  // 1. Normalize Core Data
  const customerName = order.customerName || order.customers?.full_name || "Walk-in Customer";
  const dateStr = new Date(order.created_at || Date.now()).toLocaleDateString('en-IN');
  const totalAmount = Math.floor(order.final_amount || order.total_amount || 0);
  const advancePaid = Math.floor(order.advancePaid || order.amount_paid || 0);
  const balanceDue = Math.floor(order.balanceDue || order.balance_due || 0);
  const totalMixWeightKg = order.totalMixWeightKg || 0;

  // Defaults for Footer (Can be wired to DB settings later)
  const taxInfo = "GSTIN: 27AAKPG4562D1ZU • FSSAI NO.: 11518004000348";
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
           const cost = getNormalizedQtyForCost(ing.qty, ing.unit, ing.base_unit || 'kg') * (ing.price_per_unit || 0);
           itemLines.push({ name: ing.item_name, wgt: `${ing.qty} ${ing.unit !== 'g' && ing.unit !== 'kg' ? ing.unit : ''}`, rs: Math.floor(cost) });
        });
      } else {
         itemLines.push({ name: item.item_name, wgt: `${item.cartQuantity} ${item.base_unit || 'pc'}`, rs: Math.floor(item.cartQuantity * Number(item.selling_price || 0)) });
      }
    });
    serviceLines = order.receiptServices || [];
  } else {
    (order.order_items || []).forEach((item: any) => {
      if (item.items?.item_type === 'SERVICE') {
        serviceLines.push({ name: item.items.item_name, total: Math.floor(Math.abs(item.quantity * Number(item.price_at_order || 0))) });
        return;
      }
      if (item.order_item_ingredients?.length > 0) {
        const sortedIng = [...item.order_item_ingredients].sort((a, b) => {
          let idxA = MASALA_SEQUENCE.findIndex(seq => a.items?.item_name.includes(seq));
          let idxB = MASALA_SEQUENCE.findIndex(seq => b.items?.item_name.includes(seq));
          return (idxA === -1 ? 999 : idxA) - (idxB === -1 ? 999 : idxB);
        });
        sortedIng.filter((ing: any) => ing.custom_quantity > 0).forEach((ing: any) => {
           const cost = getNormalizedQtyForCost(ing.custom_quantity, ing.unit, ing.items?.base_unit || 'kg') * Number(item.price_at_order || 0);
           itemLines.push({ name: ing.items?.item_name, wgt: `${ing.custom_quantity} ${ing.unit !== 'g' && ing.unit !== 'kg' ? ing.unit : ''}`, rs: Math.floor(cost) });
        });
      } else {
        itemLines.push({ name: item.items?.item_name, wgt: `${Math.abs(item.quantity)} ${item.items?.base_unit || 'pc'}`, rs: Math.floor(Math.abs(item.quantity * Number(item.price_at_order || 0))) });
      }
    });
  }

  return (
    <div id="printable-receipt" className="hidden print:block">
      <style type="text/css" media="print">
        {`
          body * { visibility: hidden; }
          #printable-receipt, #printable-receipt * { visibility: visible; }
          #printable-receipt { 
            position: absolute; left: 0; top: 0; 
            width: 100%; max-width: 148mm; 
            margin: 0 auto; padding: 15px; 
            background: white; color: black; font-family: sans-serif; 
            font-size: 14px;
            -webkit-print-color-adjust: exact !important; 
            print-color-adjust: exact !important;
          }
          @page { size: A5 portrait; margin: 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; border: 2px solid black; }
          th, td { border: 1px solid black; padding: 5px 8px; color: black !important; }
          th { font-weight: bold; text-align: center; border-bottom: 2px solid black; }
          .td-item { font-weight: bold; width: 45%; }
          .td-wgt { text-align: center; font-weight: bold; width: 25%; border-left: 2px solid black; border-right: 2px solid black; }
          .td-rs { text-align: right; font-weight: bold; width: 20%; }
          .td-paise { text-align: center; font-weight: bold; width: 10%; border-left: 2px solid black; }
          .totals-row td { border-top: 2px solid black; font-weight: 900; }
          .customer-info { display: flex; justify-content: space-between; font-weight: bold; font-size: 15px; margin-bottom: 10px; padding: 0 5px; }
          .header-image { width: 100%; object-fit: contain; margin-bottom: 15px; border-bottom: 3px solid #880000; }
          
          /* Footer Styles */
          .receipt-footer { margin-top: 20px; text-align: center; font-size: 13px; }
          .receipt-footer .tax-info { font-weight: bold; margin-bottom: 6px; }
          .receipt-footer .thank-you { font-weight: 600; font-style: italic; margin-bottom: 15px; }
          .footer-image { width: 100%; max-height: 100px; object-fit: contain; margin-top: 10px; }
        `}
      </style>
      
      <img src="/jmm-bill-header.png" alt="JMM Spices Header" className="header-image" />
      
      <div className="customer-info">
        <div>नाव: {customerName}</div>
        <div>दि.: {dateStr}</div>
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
            <td className="td-item" colSpan={2}>ॲडव्हान्स जमा</td>
            <td className="td-rs">{advancePaid}</td>
            <td className="td-paise">00</td>
          </tr>
          <tr className="totals-row">
            <td className="td-item" colSpan={2}>एकूण शिल्लक</td>
            <td className="td-rs">{balanceDue}</td>
            <td className="td-paise">00</td>
          </tr>
        </tbody>
      </table>

      {/* NEW FOOTER SECTION WITH IMAGE */}
      <div className="receipt-footer">
        <div className="tax-info">{taxInfo}</div>
        <div className="thank-you">{footerText}</div>
        <img src="/jmm-bill-footer.png" alt="JMM Spices Footer" className="footer-image" />
      </div>

    </div>
  );
};