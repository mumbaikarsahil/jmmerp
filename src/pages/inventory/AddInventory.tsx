import React, { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { createWorker } from "tesseract.js";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { 
  Plus, Save, Trash2, ClipboardPaste, Camera, 
  Wand2, FileSpreadsheet, AlertCircle, PackagePlus, Box
} from "lucide-react";

// --- REAL BILL OCR HELPERS ---
type OcrScanResult = {
  rows: GridRow[];
  text: string;
  confidence: number;
  warnings: string[];
};

type NumericToken = {
  value: number;
  raw: string;
  index: number;
};

const MONEY_RE = /^(?:₹\s*)?\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^(?:₹\s*)?\d+(?:\.\d+)?$/;

function cleanOcrLine(value: string): string {
  return value
    .replace(/[|¦]/g, " ")
    .replace(/[“”"]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function parseNumericToken(raw: string): number | null {
  const cleaned = raw
    .replace(/[₹,]/g, "")
    .replace(/[Oo]/g, "0")
    .replace(/[Il]/g, "1")
    .replace(/[Ss]/g, "5");
  if (!MONEY_RE.test(cleaned.replace(/^₹\s*/, ""))) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

function numbersAfterHsn(line: string, hsnIndex: number): NumericToken[] {
  const tokens = line.split(/\s+/);
  const output: NumericToken[] = [];
  for (let i = hsnIndex + 1; i < tokens.length; i++) {
    const value = parseNumericToken(tokens[i]);
    if (value !== null) output.push({ value, raw: tokens[i], index: i });
  }
  return output;
}

function findLikelyHsnIndex(tokens: string[]): number {
  for (let i = 0; i < tokens.length; i++) {
    const digits = tokens[i].replace(/\D/g, "");
    if (digits.length >= 6 && digits.length <= 8) return i;
  }
  for (let i = 0; i < tokens.length; i++) {
    const digits = tokens[i].replace(/\D/g, "");
    if (digits.length >= 4 && digits.length <= 5) return i;
  }
  return -1;
}

function cleanItemName(raw: string): string {
  return raw
    .replace(/^[#\d.)-]+\s*/, "")
    .replace(/\b(?:ITEM|DESCRIPTION|MARKS)\b\s*[:.-]?\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .replace(/[|:]+$/, "")
    .trim();
}

function inferLeadingQuantity(tokens: string[], hsnIndex: number): number | null {
  const first = parseNumericToken(tokens[0] || "");
  const second = parseNumericToken(tokens[1] || "");

  if (first !== null && second !== null && second > 0 && second <= 100000) {
    return second;
  }
  return null;
}

function deriveScanRow(line: string): GridRow | null {
  const normalized = cleanOcrLine(line);
  if (!normalized || normalized.length < 8) return null;

  const upper = normalized.toUpperCase();
  if (
    /^(TOTAL|SUB TOTAL|ROUND OFF|NET BILL|TAXABLE|GST|CGST|SGST|BILL NO|INVOICE NO|DATE|BANK|TERMS|PAYMENT|DELIVERY|GODOWN|CUSTOMER|AUTHORISED|AUTHORIZED|DESCRIPTION|ITEM NAME)/i.test(
      upper
    )
  ) {
    return null;
  }

  let tokens = normalized.split(/\s+/);

  const mergedTokens: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const currentDigits = tokens[i].replace(/\D/g, "");
    const nextDigits = tokens[i + 1]?.replace(/\D/g, "") || "";
    if (currentDigits.length === 6 && nextDigits.length === 2) {
      mergedTokens.push(`${currentDigits}${nextDigits}`);
      i++;
    } else {
      mergedTokens.push(tokens[i]);
    }
  }
  tokens = mergedTokens;

  const hsnIndex = findLikelyHsnIndex(tokens);
  if (hsnIndex < 0 || hsnIndex >= tokens.length - 2) return null;

  const tail = numbersAfterHsn(normalized, hsnIndex);
  if (tail.length < 3) return null;

  const amount = tail[tail.length - 1].value;
  if (!(amount > 0)) return null;

  const beforeHsn = tokens.slice(0, hsnIndex);
  const itemName = cleanItemName(beforeHsn.join(" "));
  if (!itemName || itemName.length < 3) return null;

  const hasPcs = /\b(?:PCS|PC|PIECE|PACK|PKT|PACKET|BOX|BAG|BAGS)\b/i.test(normalized);
  const leadingQty = inferLeadingQuantity(tokens, hsnIndex);

  if (tail.length >= 5) {
    let quantity: number | null = null;

    if (hasPcs) {
      const pcsIndex = tokens.findIndex((t) => /^(PCS?|PIECE|PACKETS?|PKT|BOX|BAGS?)$/i.test(t));
      if (pcsIndex > 0) {
        for (let i = pcsIndex - 1; i >= 0; i--) {
          const q = parseNumericToken(tokens[i]);
          if (q !== null && q > 0) {
            quantity = q;
            break;
          }
        }
      }
    }

    if (quantity === null) quantity = leadingQty;
    if (quantity === null) {
      const candidate = tail[1]?.value;
      if (candidate > 0 && candidate < 100000) quantity = candidate;
    }

    if (quantity === null || quantity <= 0) return null;

    const rate = tail[1]?.value ?? 0;
    const mrp = tail[0]?.value ?? 0;

    return {
      _id: crypto.randomUUID(),
      item_name: itemName,
      item_type: "PACKAGED_PRODUCT",
      base_unit: "piece",
      transaction_type: "PURCHASE", 
      initial_stock: String(quantity),
      purchase_price: String(Number.isFinite(rate) ? rate : 0),
      selling_price: String(Number.isFinite(mrp) ? mrp : 0),
    };
  }

  if (tail.length >= 4) {
    const bagQty = tail[0]?.value ?? 0;
    const netWeight = tail[1]?.value ?? 0;

    if (netWeight > 0 && netWeight <= 1000000) {
      const perKg = amount / netWeight;
      return {
        _id: crypto.randomUUID(),
        item_name: itemName,
        item_type: "RAW_MATERIAL",
        base_unit: "kg",
        transaction_type: "PURCHASE", 
        initial_stock: String(netWeight),
        purchase_price: String(Number(perKg.toFixed(4))),
        selling_price: "0",
      };
    }

    if (bagQty > 0) {
      return {
        _id: crypto.randomUUID(),
        item_name: itemName,
        item_type: "RAW_MATERIAL",
        base_unit: "piece",
        transaction_type: "PURCHASE", 
        initial_stock: String(bagQty),
        purchase_price: String(tail[tail.length - 2]?.value ?? 0),
        selling_price: "0",
      };
    }
  }

  return null;
}

function extractInvoiceRows(text: string): { rows: GridRow[]; warnings: string[] } {
  const rawLines = text
    .split(/\r?\n/)
    .map(cleanOcrLine)
    .filter(Boolean);

  const rows: GridRow[] = [];
  const warnings: string[] = [];

  for (const line of rawLines) {
    const row = deriveScanRow(line);
    if (row) rows.push(row);
  }

  const seen = new Set<string>();
  const deduped = rows.filter((row) => {
    const key = `${row.item_name.toUpperCase()}|${row.initial_stock}|${row.purchase_price}|${row.selling_price}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (deduped.length === 0) {
    warnings.push(
      "No reliable line items were detected. Retake the photo with the full table visible, flat on the page, and good lighting."
    );
  } else if (deduped.length < 2) {
    warnings.push(
      "Only one line item was detected. Check the row before committing; the scan may have missed additional items."
    );
  }

  return { rows: deduped, warnings };
}

function makeOcrInput(file: File, rotation = 0): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      try {
        const maxDimension = 2200;
        const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth, img.naturalHeight));
        const srcW = Math.max(1, Math.round(img.naturalWidth * scale));
        const srcH = Math.max(1, Math.round(img.naturalHeight * scale));

        const swap = rotation % 180 !== 0;
        const canvas = document.createElement("canvas");
        canvas.width = swap ? srcH : srcW;
        canvas.height = swap ? srcW : srcH;

        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Could not prepare the image for OCR.");

        ctx.save();
        if (rotation === 90) {
          ctx.translate(canvas.width, 0);
          ctx.rotate(Math.PI / 2);
        } else if (rotation === 180) {
          ctx.translate(canvas.width, canvas.height);
          ctx.rotate(Math.PI);
        } else if (rotation === 270) {
          ctx.translate(0, canvas.height);
          ctx.rotate(-Math.PI / 2);
        }

        ctx.drawImage(img, 0, 0, srcW, srcH);
        ctx.restore();

        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const px = image.data;

        for (let i = 0; i < px.length; i += 4) {
          const gray = Math.round(0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
          const enhanced = Math.max(0, Math.min(255, (gray - 128) * 1.45 + 128));
          px[i] = enhanced;
          px[i + 1] = enhanced;
          px[i + 2] = enhanced;
        }

        ctx.putImageData(image, 0, 0);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("The selected image could not be loaded."));
    };

    img.src = objectUrl;
  });
}

// --- TYPES & SCHEMAS ---
const singleFormSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  item_type: z.enum(['RAW_MATERIAL', 'FINISHED_PRODUCT', 'PACKAGED_PRODUCT']),
  base_unit: z.enum(['kg', 'g', 'piece', 'box']),
  transaction_type: z.enum(['OPENING_STOCK', 'PURCHASE', 'ADJUSTMENT']).default('OPENING_STOCK'),
  purchase_price: z.coerce.number().min(0),
  selling_price: z.coerce.number().min(0),
  initial_stock: z.coerce.number().min(0).default(0),
  supplier_code: z.string().optional(),
});

type SingleFormData = z.infer<typeof singleFormSchema>;

type GridRow = {
  _id: string;
  item_name: string;
  item_type: 'RAW_MATERIAL' | 'FINISHED_PRODUCT' | 'PACKAGED_PRODUCT';
  base_unit: 'kg' | 'g' | 'piece';
  transaction_type: 'OPENING_STOCK' | 'PURCHASE' | 'ADJUSTMENT';
  initial_stock: number | string;
  purchase_price: number | string;
  selling_price: number | string;
};

const createEmptyRow = (): GridRow => ({
  _id: crypto.randomUUID(),
  item_name: "",
  item_type: "RAW_MATERIAL",
  base_unit: "kg",
  transaction_type: "PURCHASE",
  initial_stock: "",
  purchase_price: "",
  selling_price: "",
});

function generateItemCode(): string {
  const suffix = crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `ITM-${suffix}`;
}

export default function AddInventory() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [rows, setRows] = useState<GridRow[]>([createEmptyRow()]);
  
  const { toast } = useToast();
  const { register, handleSubmit, reset } = useForm<SingleFormData>({
    resolver: zodResolver(singleFormSchema),
    defaultValues: { item_type: 'RAW_MATERIAL', base_unit: 'kg', purchase_price: 0, selling_price: 0, initial_stock: 0 },
  });

  useEffect(() => {
    const fetchTenant = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const { data: profile } = await supabase.from("profiles").select("*").eq("id", session.user.id).single();
        const p = profile as { tenant_id: string | null } | null;
        if (p?.tenant_id) setTenantId(p.tenant_id);
      }
    };
    fetchTenant();
  }, []);

  // --- SINGLE ITEM SUBMISSION ---
  const onSingleSubmit = async (data: SingleFormData) => {
    if (!tenantId) return toast({ variant: "destructive", title: "Auth Error", description: "No tenant context found." });
    setIsLoading(true);

    try {
      const { data: itemData, error: itemError } = await (supabase as any).from("items").insert({
        tenant_id: tenantId,
        item_code: generateItemCode(),
        item_name: data.item_name,
        item_type: data.item_type,
        base_unit: data.base_unit,
        purchase_price: data.purchase_price,
        selling_price: data.selling_price,
        supplier_code: data.supplier_code,
        track_inventory: true,
        is_sellable: data.item_type !== 'RAW_MATERIAL'
      }).select().single();

      if (itemError || !itemData) throw itemError || new Error("Failed to insert item record");

      if (data.initial_stock > 0) {
        const { error: txError } = await (supabase as any).from("stock_transactions").insert({
          tenant_id: tenantId,
          item_id: itemData.id,
          transaction_type: data.transaction_type,
          quantity: data.initial_stock,
          unit: data.base_unit,
          notes: 'Single item entry via app'
        });
        if (txError) throw txError;
      }

      toast({ title: "Item Saved", description: `${data.item_name} added successfully.` });
      reset();
    } catch (error: any) {
      toast({ title: "Database Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  // --- BULK EXCEL & CARD HANDLERS ---
  const updateRow = (id: string, field: keyof GridRow, value: any) => {
    setRows(prev => prev.map(r => r._id === id ? { ...r, [field]: value } : r));
  };

  const addRow = () => setRows(prev => [...prev, createEmptyRow()]);
  const removeRow = (id: string) => setRows(prev => prev.filter(r => r._id !== id));

  // --- SMART PASTE ---
  const handleSmartPaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const lines = text.split('\n').filter(line => line.trim() !== '');
      const newRows: GridRow[] = [];
      
      lines.forEach(line => {
        const match = line.match(/^(.*?)\s+(\d+(\.\d+)?)$/);
        if (match) {
          newRows.push({
            _id: crypto.randomUUID(),
            item_name: match[1].trim(),
            item_type: "RAW_MATERIAL",
            base_unit: "kg",
            transaction_type: "PURCHASE",
            initial_stock: "", 
            purchase_price: match[2],
            selling_price: "",
          });
        }
      });

      if (newRows.length > 0) {
        setRows(prev => [...prev.filter(r => r.item_name !== ""), ...newRows]);
        toast({ title: "Smart Paste Success", description: `Parsed ${newRows.length} items from clipboard.` });
      } else {
        toast({ variant: "destructive", title: "Paste Failed", description: "No valid item/price format found." });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "Clipboard Error", description: "Please allow clipboard permissions." });
    }
  };

  // --- REAL OCR BILL SCANNER ---
  const processOcrScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      toast({
        variant: "destructive",
        title: "Unsupported file",
        description: "Please select a bill photo in JPG, PNG or WEBP format.",
      });
      return;
    }

    setIsOcrLoading(true);
    let worker: Awaited<ReturnType<typeof createWorker>> | null = null;

    try {
      worker = await createWorker("eng");
      const candidateRotations = [0, 90];
      let best: OcrScanResult | null = null;

      for (const rotation of candidateRotations) {
        const input = await makeOcrInput(file, rotation);
        const result = await worker.recognize(input);
        const confidence = Number(result.data.confidence || 0);
        const parsed = extractInvoiceRows(result.data.text || "");

        const candidate: OcrScanResult = {
          rows: parsed.rows,
          text: result.data.text || "",
          confidence,
          warnings: parsed.warnings,
        };

        if (
          !best ||
          candidate.rows.length > best.rows.length ||
          (candidate.rows.length === best.rows.length && candidate.confidence > best.confidence)
        ) {
          best = candidate;
        }

        if (candidate.rows.length >= 2 && candidate.confidence >= 72) break;
      }

      if (!best || best.rows.length === 0) {
        throw new Error(
          best?.warnings?.[0] ||
            "The bill could not be parsed. Use a sharper photo with the invoice table fully visible."
        );
      }

      setRows((prev) => [...prev.filter((r) => r.item_name.trim() !== ""), ...best!.rows]);

      const confidenceText = `${Math.round(best.confidence)}%`;
      const warningText =
        best.warnings.length > 0
          ? ` ${best.warnings.join(" ")}`
          : " Review the extracted rows before committing.";

      toast({
        title: `Invoice scanned • ${confidenceText} OCR confidence`,
        description: `Extracted ${best.rows.length} item${best.rows.length === 1 ? "" : "s"}.${warningText}`,
      });
    } catch (error: any) {
      console.error("Invoice OCR failed:", error);
      toast({
        variant: "destructive",
        title: "Bill scan failed",
        description:
          error?.message ||
          "OCR could not read this invoice. Try a flat, well-lit photo with the entire bill in frame.",
      });
    } finally {
      if (worker) {
        try {
          await worker.terminate();
        } catch {
          // Ignore cleanup errors.
        }
      }
      setIsOcrLoading(false);
    }
  };

  // --- BULK COMMIT ---
  const handleBulkSave = async () => {
    if (!tenantId) return;
    const validRows = rows.filter(r => r.item_name.trim() !== "");
    if (validRows.length === 0) return toast({ variant: "destructive", title: "Empty Grid", description: "Enter at least one item." });

    setIsLoading(true);
    try {
      const itemsToInsert = validRows.map(row => ({
        tenant_id: tenantId,
        item_code: generateItemCode(),
        item_name: row.item_name,
        item_type: row.item_type,
        base_unit: row.base_unit,
        purchase_price: Number(row.purchase_price) || 0,
        selling_price: Number(row.selling_price) || 0,
        track_inventory: true,
        is_sellable: row.item_type !== 'RAW_MATERIAL'
      }));

      const { data: insertedItems, error: itemsError } = await (supabase as any).from("items").insert(itemsToInsert).select();
      if (itemsError || !insertedItems) throw itemsError;

      const transactions = insertedItems.map((item: any, index: number) => {
        const initialQty = Number(validRows[index].initial_stock);
        if (initialQty > 0) {
          return {
            tenant_id: tenantId, item_id: item.id, transaction_type: validRows[index].transaction_type,
            quantity: initialQty, unit: validRows[index].base_unit, notes: 'Bulk invoice import'
          };
        }
        return null;
      }).filter(Boolean);

      if (transactions.length > 0) {
        const { error: txError } = await (supabase as any).from("stock_transactions").insert(transactions);
        if (txError) throw txError;
      }

      toast({ title: "Bulk Upload Complete", description: `Committed ${insertedItems.length} items to ledger.` });
      setRows([createEmptyRow()]); 
      
    } catch (error: any) {
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      {/* PREMIUM ENTERPRISE CONTAINER */}
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fade-in pb-24 md:pb-12 font-sans">
          
        <div className="flex items-center justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
    <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none">
      Add Inventory
    </h1>
    {/* Subtitle stays hidden on mobile to save space, but appears on PC */}
    <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block">
      Record new stock, raw materials, and import supplier bills.
    </p>
  </div>

          <Tabs defaultValue="bulk" className="w-full">
            <div className="w-full overflow-x-auto scrollbar-none pb-4">
              <TabsList className="flex w-fit bg-zinc-100/80 p-1 rounded-xl min-w-max">
                <TabsTrigger value="normal" className="rounded-lg font-bold px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all text-zinc-600 data-[state=active]:text-zinc-900">Single Entry</TabsTrigger>
                <TabsTrigger value="bulk" className="rounded-lg font-bold px-6 py-2.5 data-[state=active]:bg-white data-[state=active]:shadow-sm transition-all text-zinc-600 data-[state=active]:text-zinc-900">Bulk / Scan Bill</TabsTrigger>
              </TabsList>
            </div>

            {/* ========================================== */}
            {/* SINGLE ITEM ENTRY (NORMAL METHOD)          */}
            {/* ========================================== */}
            <TabsContent value="normal" className="mt-2 outline-none">
              <Card className="max-w-3xl shadow-sm border-zinc-200 rounded-3xl overflow-hidden bg-white">
                <CardHeader className="bg-zinc-50/50 border-b border-zinc-100 pb-5 pt-6 px-6 sm:px-8">
                  <CardTitle className="flex items-center gap-2.5 text-lg font-bold text-zinc-900">
                    <PackagePlus className="h-5 w-5 text-zinc-400" /> Manual Product Entry
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6 sm:p-8">
                  <form onSubmit={handleSubmit(onSingleSubmit)} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-6">
                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Item Name</Label>
                        <Input className="h-12 rounded-xl border-zinc-200 shadow-sm text-base font-semibold focus-visible:ring-zinc-900" {...register("item_name")} placeholder="e.g. Bedgi Mirchi" />
                        {/* Empty validation feedback container */}
                        <div className="h-4">{/* Spacing */}</div>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Entry Type</Label>
                        <select {...register("transaction_type")} className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 font-semibold text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
                          <option value="OPENING_STOCK">Opening Stock (New Item)</option>
                          <option value="PURCHASE">Purchase (Supplier Bill)</option>
                          <option value="ADJUSTMENT">Adjustment (Correction)</option>
                        </select>
                      </div>
                      
                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Item Category</Label>
                        <select {...register("item_type")} className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 font-semibold text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
                          <option value="RAW_MATERIAL">Raw Material (Spices)</option>
                          <option value="FINISHED_PRODUCT">Bulk Finish (Mixed Masala)</option>
                          <option value="PACKAGED_PRODUCT">Retail Packet</option>
                        </select>
                      </div>

                      <div className="space-y-2 md:col-span-2">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Base Unit</Label>
                        <select {...register("base_unit")} className="flex h-12 w-full rounded-xl border border-zinc-200 bg-white px-3 font-semibold text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-900">
                          <option value="kg">Kilograms (kg)</option>
                          <option value="g">Grams (g)</option>
                          <option value="piece">Packets / Pieces</option>
                        </select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Purchase Price (₹)</Label>
                        <Input type="number" step="0.01" className="h-12 rounded-xl border-zinc-200 shadow-sm font-semibold focus-visible:ring-zinc-900" {...register("purchase_price")} />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-zinc-900 uppercase tracking-widest">Selling Price (₹)</Label>
                        <Input type="number" step="0.01" className="h-12 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-800 shadow-inner font-bold text-lg focus-visible:ring-emerald-500" {...register("selling_price")} />
                      </div>

                      <div className="space-y-2 md:col-span-2 p-5 bg-zinc-50 border border-zinc-100 rounded-2xl shadow-sm mt-2">
                        <Label className="text-[11px] font-bold text-zinc-700 uppercase tracking-widest">Opening Stock Qty</Label>
                        <Input type="number" step="0.01" className="h-12 rounded-xl bg-white border-zinc-200 shadow-sm font-bold text-lg focus-visible:ring-zinc-900" {...register("initial_stock")} />
                      </div>
                    </div>

                    <div className="pt-4">
                      <Button type="submit" disabled={isLoading} className="w-full h-14 bg-zinc-900 hover:bg-zinc-800 text-white rounded-2xl font-bold shadow-sm transition-transform active:scale-[0.98]">
                        {isLoading ? "Saving..." : "Save to Inventory"}
                      </Button>
                    </div>
                  </form>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ========================================== */}
            {/* BULK ENTRY & OCR INVOICE SCANNER           */}
            {/* ========================================== */}
            <TabsContent value="bulk" className="mt-2 space-y-5 outline-none">
              
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row items-center gap-3 bg-white p-3 sm:p-4 rounded-3xl border border-zinc-200 shadow-sm">
                <Button variant="outline" onClick={handleSmartPaste} className="w-full sm:w-auto h-12 bg-white hover:bg-zinc-50 text-zinc-700 border-zinc-200 rounded-2xl font-bold shadow-sm transition-all active:scale-[0.98]">
                  <ClipboardPaste className="h-4 w-4 mr-2 text-zinc-500" /> Smart Paste
                </Button>
                
                <div className="relative w-full sm:w-auto flex-1">
                  <Input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={processOcrScan} className="absolute inset-0 opacity-0 cursor-pointer w-full z-10" />
                  <Button variant="outline" disabled={isOcrLoading} className="w-full h-12 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 rounded-2xl font-bold pointer-events-none transition-all">
                    {isOcrLoading ? <Wand2 className="h-4 w-4 mr-2 animate-spin" /> : <Camera className="h-4 w-4 mr-2" />} 
                    Scan Bill (OCR)
                  </Button>
                </div>

                <Button onClick={handleBulkSave} disabled={isLoading} className="w-full sm:w-auto h-12 px-8 bg-zinc-900 text-white hover:bg-zinc-800 rounded-2xl font-bold shadow-sm transition-transform active:scale-[0.98]">
                  <Save className="h-4 w-4 mr-2" /> {isLoading ? "Committing..." : "Commit Ledger"}
                </Button>
              </div>

              {/* Quick Tips */}
              <div className="bg-amber-50 border border-amber-100 rounded-3xl p-5 sm:p-6 flex items-start gap-4 shadow-sm">
                <AlertCircle className="h-6 w-6 text-amber-500 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <h4 className="text-sm font-bold text-amber-900">Rapid Entry Instructions</h4>
                  <ul className="text-xs font-semibold text-amber-800/80 space-y-1.5 leading-relaxed">
                    <li>• <strong>Smart Paste:</strong> Copy text lists (e.g. <code className="bg-white px-1.5 py-0.5 rounded border border-amber-200 font-bold text-amber-900">तूरडाळ 180</code>) and paste it instantly.</li>
                    <li>• <strong>Scan Bill:</strong> Upload a flat, well-lit photo of the supplier invoice. OCR will extract rows automatically. Always review extracted numbers before committing.</li>
                  </ul>
                </div>
              </div>

              {/* HYBRID UI: Mobile Card View */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {rows.map((row, index) => (
                  <Card key={row._id} className="shadow-sm border-zinc-200 rounded-[24px] overflow-hidden relative bg-white">
                    <div className="absolute top-0 right-0 p-3 z-10">
                      <Button variant="ghost" size="icon" onClick={() => removeRow(row._id)} className="h-9 w-9 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl bg-white shadow-sm border border-zinc-100">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <CardHeader className="bg-zinc-50/50 pb-4 pt-5 px-5 border-b border-zinc-100">
                      <CardDescription className="font-mono text-[10px] font-bold uppercase tracking-widest text-zinc-400">Row #{index + 1}</CardDescription>
                      <Input 
                        value={row.item_name} onChange={(e) => updateRow(row._id, 'item_name', e.target.value)}
                        placeholder="Item Name (e.g. Bedgi Mirchi)" 
                        className="h-12 mt-2 rounded-xl border-zinc-200 bg-white font-bold text-zinc-900 shadow-sm focus-visible:ring-zinc-900"
                      />
                    </CardHeader>
                    <CardContent className="p-5 space-y-5">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Type</Label>
                          <select value={row.item_type} onChange={(e) => updateRow(row._id, 'item_type', e.target.value)} className="w-full h-12 rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold shadow-sm outline-none focus:ring-2 focus:ring-zinc-900">
                            <option value="RAW_MATERIAL">Raw (kg)</option>
                            <option value="PACKAGED_PRODUCT">Packaged (pc)</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Qty ({row.base_unit})</Label>
                          <Input type="number" value={row.initial_stock} onChange={(e) => updateRow(row._id, 'initial_stock', e.target.value)} placeholder="0" className="h-12 rounded-xl border-zinc-200 shadow-sm font-mono font-bold focus-visible:ring-zinc-900"/>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-zinc-500 tracking-wider">Buy (₹)</Label>
                          <Input type="number" value={row.purchase_price} onChange={(e) => updateRow(row._id, 'purchase_price', e.target.value)} placeholder="0.00" className="h-12 rounded-xl border-zinc-200 shadow-sm font-mono font-semibold focus-visible:ring-zinc-900"/>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Sell (₹)</Label>
                          <Input type="number" value={row.selling_price} onChange={(e) => updateRow(row._id, 'selling_price', e.target.value)} placeholder="0.00" className="h-12 rounded-xl border-emerald-200 bg-emerald-50/50 font-bold shadow-inner font-mono focus-visible:ring-emerald-500 text-emerald-900"/>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <Button variant="outline" onClick={addRow} className="h-14 border-dashed border-2 border-zinc-300 text-zinc-600 font-bold rounded-2xl bg-zinc-50/50 hover:bg-zinc-100 mt-2">
                  <Plus className="h-5 w-5 mr-2" /> Add Next Item
                </Button>
              </div>

              {/* HYBRID UI: Desktop Excel Grid View */}
              <div className="hidden md:flex flex-col bg-white border border-zinc-200 rounded-3xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-50/80 border-b border-zinc-200 text-zinc-500 font-bold text-[11px] uppercase tracking-widest">
                      <tr>
                        <th className="px-5 py-4 w-12 text-center">#</th>
                        <th className="px-3 py-4 w-40">Entry Type</th>
                        <th className="px-3 py-4 min-w-[280px]">Item Description</th>
                        <th className="px-3 py-4 w-44">Type</th>
                        <th className="px-3 py-4 w-28">Unit</th>
                        <th className="px-3 py-4 w-32">Buy (₹)</th>
                        <th className="px-3 py-4 w-32">Sell (₹)</th>
                        <th className="px-3 py-4 w-32">Stock</th>
                        <th className="px-5 py-4 w-16 text-center">Del</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100">
                      {rows.map((row, index) => (
                        <tr key={row._id} className="hover:bg-zinc-50/60 transition-colors group">
                          <td className="px-5 py-3.5 text-center text-zinc-400 font-mono text-xs font-bold">{index + 1}</td>
                          <td className="px-2 py-2">
                            <select 
                              value={row.transaction_type} 
                              onChange={(e) => updateRow(row._id, 'transaction_type', e.target.value)} 
                              className="h-11 w-full border-0 bg-transparent focus:ring-2 focus:ring-zinc-900 rounded-xl text-zinc-600 px-3 text-sm outline-none font-semibold transition-all hover:bg-white"
                            >
                              <option value="PURCHASE">Purchase</option>
                              <option value="OPENING_STOCK">Opening</option>
                              <option value="ADJUSTMENT">Adjustment</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <Input value={row.item_name} onChange={(e) => updateRow(row._id, 'item_name', e.target.value)} placeholder="e.g. तूरडाळ" className="h-11 border-0 bg-transparent focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-xl shadow-none px-3 font-bold text-zinc-900 hover:bg-white transition-all"/>
                          </td>
                          <td className="px-2 py-2">
                            <select value={row.item_type} onChange={(e) => updateRow(row._id, 'item_type', e.target.value)} className="h-11 w-full border-0 bg-transparent focus:ring-2 focus:ring-zinc-900 rounded-xl text-zinc-600 px-3 text-sm outline-none font-semibold transition-all hover:bg-white">
                              <option value="RAW_MATERIAL">Raw Mat.</option>
                              <option value="FINISHED_PRODUCT">Bulk Finish</option>
                              <option value="PACKAGED_PRODUCT">Packaged</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <select value={row.base_unit} onChange={(e) => updateRow(row._id, 'base_unit', e.target.value)} className="h-11 w-full border-0 bg-transparent focus:ring-2 focus:ring-zinc-900 rounded-xl text-zinc-600 px-3 text-sm outline-none font-semibold transition-all hover:bg-white">
                              <option value="kg">kg</option>
                              <option value="g">gram</option>
                              <option value="piece">piece</option>
                            </select>
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" step="0.01" value={row.purchase_price} onChange={(e) => updateRow(row._id, 'purchase_price', e.target.value)} className="h-11 border-0 bg-transparent focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-xl shadow-none px-3 font-mono font-semibold text-zinc-700 hover:bg-white transition-all" placeholder="0.00"/>
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" step="0.01" value={row.selling_price} onChange={(e) => updateRow(row._id, 'selling_price', e.target.value)} className="h-11 border-0 bg-emerald-50/50 focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xl shadow-none px-3 font-mono font-bold text-emerald-900 hover:bg-emerald-50 transition-all" placeholder="0.00"/>
                          </td>
                          <td className="px-2 py-2">
                            <Input type="number" step="0.001" value={row.initial_stock} onChange={(e) => updateRow(row._id, 'initial_stock', e.target.value)} className="h-11 border-0 bg-transparent focus-visible:ring-2 focus-visible:ring-zinc-900 rounded-xl shadow-none px-3 font-mono font-bold text-blue-700 hover:bg-white transition-all" placeholder="Qty"/>
                          </td>
                          <td className="px-5 py-2 text-center">
                            <Button variant="ghost" size="icon" onClick={() => removeRow(row._id)} className="h-10 w-10 text-zinc-400 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-all rounded-xl">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-4 border-t border-zinc-200 bg-zinc-50/80 flex justify-between items-center rounded-b-3xl">
                  <Button variant="ghost" onClick={addRow} className="text-zinc-700 hover:text-zinc-900 hover:bg-white h-11 px-5 text-sm font-bold rounded-xl transition-all shadow-sm border border-zinc-200/50">
                    <Plus className="h-4 w-4 mr-2" /> Add Next Row
                  </Button>
                  <div className="text-[11px] font-bold text-zinc-500 flex items-center bg-white px-4 py-2.5 rounded-xl border border-zinc-200 shadow-sm uppercase tracking-wider">
                    <FileSpreadsheet className="h-4 w-4 mr-2 text-emerald-500" />
                    {rows.filter(r => r.item_name.trim() !== "").length} Ready to Commit
                  </div>
                </div>
              </div>

            </TabsContent>
          </Tabs>

        </div>
      </div>
    </AppLayout>
  );
}