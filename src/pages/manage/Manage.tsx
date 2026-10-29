'use client'

import React, { useState, useEffect, useRef, useMemo } from "react";
import { useForm, useWatch, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Barcode from "react-barcode"; 
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogTitle, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";
import { Search, Pencil, Trash2, Printer, Loader2, Package, AlertTriangle, Image as ImageIcon, Globe, UploadCloud, Scale, Wrench, Layers, FlaskConical, Plus, X, ImagePlus, ShieldAlert, CheckSquare, Square } from "lucide-react";

export type Item = Database["public"]["Tables"]["items"]["Row"] & {
  ecommerce_items?: {
    is_published: boolean;
    override_selling_price: number | null;
    variants: { weight: string, price: number }[];
    additional_images: string[];
    policy_id: string | null;
    description: string | null;
    max_order_qty: number;
    product_tags: string[] | null;
    category_id: string | null;
  }[] | null;
};

export type Category = {
  id: string;
  name_en: string;
  name_mr: string;
  image_url: string | null;
};

const STRICT_MASALA_SEQUENCE = [
  "बेडगी", "लवंगी", "काश्मिरी", "मिरची", "धणे", "हळकुंड", "मिरी", "बडीशेप", 
  "खसखस", "लवंग", "दालचिनी", "लालफुल", "चक्रिफुल", "मसाला वेलची", "दगडफुल", 
  "तेजपान", "शहाजिरे", "जायफळ", "जायपत्री", "त्रिफळ", "नागकेशर", "कबाब चिनी",
  "हिंग", "मेथी", "राई", "जिरा", "पिंपळी", "सुंठ", "हिरवी वेलची", "गुलाब पाकळी", 
  "कसुरी मेथी", "ओवा", "खोबरा", "लसूण", "मीठ", "तेल"
];

const compressImage = (file: File): Promise<Blob> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        if (scaleSize < 1) { canvas.width = MAX_WIDTH; canvas.height = img.height * scaleSize; } 
        else { canvas.width = img.width; canvas.height = img.height; }
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => { if (blob) resolve(blob); else reject(new Error("Canvas to Blob failed")); }, "image/jpeg", 0.7);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const ecommerceVariantSchema = z.object({ weight: z.string().min(1, "Weight required"), price: z.coerce.number().min(1, "Price required") });

const editSchema = z.object({
  item_name: z.string().min(1, "Item name is required"), size: z.string().optional(),
  selling_price: z.coerce.number().min(0), purchase_price: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().min(0).default(0), is_pack: z.boolean().default(false),
  pieces_per_box: z.coerce.number().min(1).default(1), number_of_boxes: z.coerce.number().min(0).default(0).optional(),
  price_per_piece: z.coerce.number().min(0).optional(), show_on_web: z.boolean().default(true),
  description: z.string().optional(), max_order_qty: z.coerce.number().min(1).default(10), product_tags: z.string().optional(),
  ecommerce_variants: z.array(ecommerceVariantSchema).default([]), additional_images: z.array(z.string()).default([]), policy_id: z.string().nullable().optional()
});

type EditFormData = z.infer<typeof editSchema>;
type Policy = { id: string; policy_name: string; delivery_estimate: string; };
type MasalaTemplate = { id: string; template_name: string; template_ingredients: { item_id: number; base_qty: number; unit: string; items?: { item_name: string | null; selling_price: number | null; base_unit: string | null; } | null; }[]; };
type TempIngredient = { item_id: number; item_name: string; qty: number; unit: string; };
const getSafeItemName = (item: Item) => item.item_name || "Unnamed Item";

const CATEGORY_TABS = [ 
  { id: "ALL", label: "All Items", icon: Layers }, 
  { id: "FINISHED_PRODUCT", label: "Ready Items & Blends", icon: Package }, 
  { id: "RAW_MATERIAL", label: "Raw Spices", icon: Scale }, 
  { id: "WEB_CATEGORIES", label: "Web Categories", icon: Globe }, 
  { id: "MASALA_TEMPLATES", label: "Masala Recipes", icon: FlaskConical }, 
  { id: "SERVICE", label: "Services (Labour)", icon: Wrench } 
];

export default function ManageInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [templates, setTemplates] = useState<MasalaTemplate[]>([]);
  const [rawMaterials, setRawMaterials] = useState<Item[]>([]);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("Loading...");
  const { toast } = useToast();
  
  // Item Editing State
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [printingItem, setPrintingItem] = useState<Item | null>(null); 
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingTemplate, setEditingTemplate] = useState<MasalaTemplate | { id: 'new', template_name: '', template_ingredients: [] } | null>(null);
  const [tempIngredients, setTempIngredients] = useState<TempIngredient[]>([]);
  const [activeIngredientIds, setActiveIngredientIds] = useState<number[]>([]);
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [galleryFiles, setGalleryFiles] = useState<File[]>([]);
  const [galleryPreviews, setGalleryPreviews] = useState<string[]>([]);
  const [removeImageFlag, setRemoveImageFlag] = useState(false);
  
  // Category Editing State
  const [editingCategory, setEditingCategory] = useState<Category | 'new' | null>(null);
  const [catNameEn, setCatNameEn] = useState("");
  const [catNameMr, setCatNameMr] = useState("");
  const [catImageFile, setCatImageFile] = useState<File | null>(null);
  const [catImagePreview, setCatImagePreview] = useState<string | null>(null);
  const [catSelectedItems, setCatSelectedItems] = useState<number[]>([]);
  const [isSubmittingCat, setIsSubmittingCat] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const catImageInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, control, setValue, formState: { errors, isSubmitting } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { is_pack: false, pieces_per_box: 1, quantity: 0, show_on_web: true, ecommerce_variants: [], additional_images: [], max_order_qty: 10 }
  });

  const { fields: variantFields, append: appendVariant, remove: removeVariant } = useFieldArray({ control, name: "ecommerce_variants" });
  const watchedIsPack = useWatch({ control, name: "is_pack" });
  const watchedPieces = useWatch({ control, name: "pieces_per_box" });
  const watchedBoxes = useWatch({ control, name: "number_of_boxes" });
  const watchedShowOnWeb = useWatch({ control, name: "show_on_web" });
  const watchedAdditionalImages = useWatch({ control, name: "additional_images" });

  const sortedRawMaterials = useMemo(() => {
    return [...rawMaterials].sort((a, b) => {
      let idxA = STRICT_MASALA_SEQUENCE.findIndex(seq => getSafeItemName(a).includes(seq));
      let idxB = STRICT_MASALA_SEQUENCE.findIndex(seq => getSafeItemName(b).includes(seq));
      if (idxA === -1) idxA = 999; if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }, [rawMaterials]);

  useEffect(() => {
    if (watchedIsPack && watchedPieces && watchedBoxes !== undefined) setValue("quantity", watchedPieces * watchedBoxes);
  }, [watchedIsPack, watchedPieces, watchedBoxes, setValue]);

  useEffect(() => {
    const initializeTenantData = async () => {
      setIsLoading(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;
        const { data: profileData } = await supabase.from("profiles").select("tenant_id").eq("id", session.user.id).single();
        const profile = profileData as { tenant_id: string | null } | null;
        if (profile?.tenant_id) {
          setCurrentTenantId(profile.tenant_id);
          await fetchStoreDetails(profile.tenant_id);
          await fetchPolicies(profile.tenant_id);
          await fetchCategories(profile.tenant_id);
          await fetchItems(profile.tenant_id);
          await fetchTemplates(profile.tenant_id);
        }
      } catch (error) {} finally { setIsLoading(false); }
    };
    initializeTenantData();
  }, []);

  useEffect(() => {
    if (activeTab === "MASALA_TEMPLATES" || activeTab === "WEB_CATEGORIES") return; 
    const results = items.filter((item) => {
      const typeStr = String((item as any).item_type || "FINISHED_PRODUCT");
      const matchesSearch = item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) || (item.item_code && item.item_code.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesTab = activeTab === "ALL" || typeStr === activeTab;
      return matchesSearch && matchesTab;
    });
    setFilteredItems(results);
  }, [searchTerm, items, activeTab]);

  useEffect(() => {
    if (editingItem) {
      const isPack = (editingItem.pieces_per_box || 1) > 1;
      const pieces = editingItem.pieces_per_box || 1;
      const estimatedBoxes = Math.floor((editingItem.quantity || 0) / pieces);

      setEditImagePreview(editingItem.image_url || null);
      setEditImageFile(null);
      setRemoveImageFlag(false);
      setGalleryFiles([]);
      setGalleryPreviews([]);

      const ecoRaw = editingItem.ecommerce_items;
      const ecoData = Array.isArray(ecoRaw) ? ecoRaw[0] : ecoRaw;

      let safeVariants = [];
      if (ecoData?.variants) {
        safeVariants = typeof ecoData.variants === 'string' ? JSON.parse(ecoData.variants) : ecoData.variants;
        if (Array.isArray(safeVariants) && Array.isArray(safeVariants[0])) {
          safeVariants = safeVariants[0];
        }
      }

      reset({
        item_name: editingItem.item_name || "",
        size: editingItem.size || '',
        selling_price: Number(editingItem.selling_price || 0),
        purchase_price: Number(editingItem.purchase_price || 0),
        quantity: Number(editingItem.quantity || 0),
        is_pack: isPack,
        pieces_per_box: pieces,
        number_of_boxes: estimatedBoxes,
        price_per_piece: Number(editingItem.price_per_piece || 0),
        show_on_web: ecoData?.is_published ?? (editingItem.show_on_web ?? false),
        description: ecoData?.description || (editingItem as any).description || "",
        max_order_qty: Number(ecoData?.max_order_qty || (editingItem as any).max_order_qty || 10),
        product_tags: (ecoData?.product_tags || (editingItem as any).product_tags || []).join(', '),
        ecommerce_variants: safeVariants,
        additional_images: Array.isArray(ecoData?.additional_images) ? ecoData.additional_images : [],
        policy_id: ecoData?.policy_id || ""
      });
    }
  }, [editingItem, reset]);

  const fetchStoreDetails = async (tenantId: string) => {
    const { data } = await supabase.from("tenants").select("tenant_name").eq("id", tenantId).single();
    const tenantData = data as { tenant_name: string } | null;
    if (tenantData?.tenant_name) setStoreName(tenantData.tenant_name);
  };
  const fetchPolicies = async (tenantId: string) => {
    const { data } = await supabase.from("ecommerce_policies").select("*").eq("tenant_id", tenantId);
    if (data) setPolicies(data);
  };
  const fetchCategories = async (tenantId: string) => {
    const { data } = await supabase.from("ecommerce_categories").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: true });
    if (data) setCategories(data);
  };

  const fetchItems = async (tenantId: string) => {
    const { data, error } = await supabase.from("items").select("*, ecommerce_items(*)").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    if (error) toast({ title: "Error fetching inventory", description: error.message, variant: "destructive" });
    else { setItems(data || []); setFilteredItems(data || []); setRawMaterials((data || []).filter((item: Item) => (item as any).item_type === "RAW_MATERIAL")); }
  };

  const fetchTemplates = async (tenantId: string) => {
    const { data } = await (supabase as any).from("masala_templates").select(`id, template_name, template_ingredients (item_id, base_qty, unit, items (item_name, selling_price, base_unit))`).eq("tenant_id", tenantId).order("template_name", { ascending: true });
    if (data) setTemplates(data);
  };

  const toggleWebVisibility = async (item: Item, currentState: boolean) => {
    if (!currentTenantId) return;
    try {
      const updatedState = !currentState;
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ecommerce_items: [{ ...(i.ecommerce_items?.[0] || {} as any), is_published: updatedState }] } : i));
      const { error } = await (supabase as any).from("ecommerce_items").upsert({ tenant_id: currentTenantId, item_id: item.id, is_published: updatedState }, { onConflict: 'item_id' });
      if (error) throw error;
    } catch (error: any) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, ecommerce_items: [{ ...(i.ecommerce_items?.[0] || {} as any), is_published: currentState }] } : i));
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setEditImageFile(file); setEditImagePreview(URL.createObjectURL(file)); setRemoveImageFlag(false); }
  };

  const handleGalleryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArr = Array.from(e.target.files);
      setGalleryFiles(prev => [...prev, ...filesArr]);
      setGalleryPreviews(prev => [...prev, ...filesArr.map(f => URL.createObjectURL(f))]);
    }
  };

  const handleRemoveEditPhoto = () => {
    setEditImageFile(null); setEditImagePreview(null); setRemoveImageFlag(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpdate = async (data: EditFormData) => {
    if (!editingItem || !currentTenantId) return;
    try {
      const isPack = data.is_pack;
      let finalImageUrl = editingItem.image_url;

      if (removeImageFlag) { finalImageUrl = null; } 
      else if (editImageFile) {
        toast({ title: "Compressing primary image..." });
        const compressedBlob = await compressImage(editImageFile);
        const fileName = `${editingItem.item_code}-${Date.now()}.jpg`;
        const { error: uploadError } = await (supabase as any).storage.from("item-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);
        const { data: publicUrlData } = (supabase as any).storage.from("item-images").getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }

      let finalGalleryUrls = [...(data.additional_images || [])];
      if (galleryFiles.length > 0) {
        toast({ title: "Uploading gallery images..." });
        for (const file of galleryFiles) {
          const blob = await compressImage(file);
          const fName = `gallery-${editingItem.item_code}-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`;
          await (supabase as any).storage.from("item-images").upload(fName, blob, { contentType: "image/jpeg" });
          const { data: pUrl } = (supabase as any).storage.from("item-images").getPublicUrl(fName);
          finalGalleryUrls.push(pUrl.publicUrl);
        }
      }
      
      let parsedTags: string[] = [];
      if (data.product_tags && data.product_tags.trim() !== "") parsedTags = data.product_tags.split(',').map(s => s.trim()).filter(Boolean);

      const { error: coreError } = await (supabase as any)
        .from("items")
        .update({
          item_name: data.item_name, size: data.size || null,
          selling_price: data.selling_price, purchase_price: data.purchase_price,
          quantity: data.quantity, pieces_per_box: isPack ? data.pieces_per_box : 1,
          price_per_piece: isPack ? data.price_per_piece : data.selling_price, image_url: finalImageUrl,
        }).eq("id", editingItem.id).eq("tenant_id", currentTenantId);

      if (coreError) throw coreError;

      const { error: ecoError } = await (supabase as any)
        .from("ecommerce_items")
        .upsert({
          tenant_id: currentTenantId, item_id: editingItem.id, is_published: data.show_on_web,
          description: data.description || null, max_order_qty: data.max_order_qty,
          product_tags: parsedTags, variants: data.ecommerce_variants, 
          additional_images: finalGalleryUrls, policy_id: data.policy_id || null
        }, { onConflict: 'item_id' });

      if (ecoError) throw ecoError;

      toast({ title: "Item Updated", description: `${data.item_name} has been updated.` });
      setEditingItem(null); fetchItems(currentTenantId); 
    } catch (error: any) { toast({ title: "Update Failed", description: error.message, variant: "destructive" }); }
  };

  const handleDelete = async () => {
    if (!deletingItem || !currentTenantId) return;
    try {
      const { error } = await (supabase as any).from("items").delete().eq("item_code", deletingItem.item_code).eq("tenant_id", currentTenantId);
      if (error) throw error;
      toast({ title: "Item Deleted", description: "The item has been removed from inventory." });
      setDeletingItem(null); fetchItems(currentTenantId);
    } catch (error: any) { toast({ title: "Delete Failed", description: error.message, variant: "destructive" }); }
  };

  const handlePrintLabel = (item: Item) => {
    if (Number(item.quantity) <= 0 && (item as any).item_type !== 'SERVICE') { toast({ title: "No Stock", description: "Cannot print labels for 0 quantity.", variant: "destructive" }); return; }
    setPrintingItem(item); setTimeout(() => { window.print(); }, 100);
  };

  const getItemTypeBadge = (type: string) => {
    switch(type) {
      case "RAW_MATERIAL": return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border border-emerald-200 whitespace-nowrap">Raw Spice</span>;
      case "SERVICE": return <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border border-purple-200 whitespace-nowrap">Service</span>;
      default: return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border border-blue-200 whitespace-nowrap">Ready Blend</span>;
    }
  };

  const openTemplateEditor = (template: MasalaTemplate | 'new') => {
    const baseIngredients: TempIngredient[] = sortedRawMaterials.map(rm => ({
        item_id: rm.id, item_name: getSafeItemName(rm), qty: 0,
        unit: (rm as any).base_unit === 'kg' ? 'g' : ((rm as any).base_unit || 'g')
    }));

    if (template === 'new') {
      setEditingTemplate({ id: 'new', template_name: '', template_ingredients: [] });
      setTempIngredients(baseIngredients); setActiveIngredientIds([]);
    } else {
      setEditingTemplate(template);
      const existingMap = new Map<number, { qty: number, unit: string }>();
      const activeIds: number[] = [];
      for (const ing of template.template_ingredients) {
        if (Number(ing.base_qty) > 0) { existingMap.set(ing.item_id, { qty: Number(ing.base_qty), unit: ing.unit }); activeIds.push(ing.item_id); }
      }
      const mergedIngredients = baseIngredients.map(base => ({
          ...base, qty: existingMap.has(base.item_id) ? existingMap.get(base.item_id)!.qty : 0,
          unit: existingMap.has(base.item_id) ? existingMap.get(base.item_id)!.unit : base.unit
      }));
      setTempIngredients(mergedIngredients); setActiveIngredientIds(activeIds);
    }
  };

  const updateCustomIngredient = (itemId: number, quantity: number) => { setTempIngredients(prev => prev.map(ing => ing.item_id === itemId ? { ...ing, qty: quantity } : ing)); };
  const handleAddSpice = (itemId: number) => setActiveIngredientIds(prev => [...prev, itemId]);
  const handleRemoveSpice = (itemId: number) => { setActiveIngredientIds(prev => prev.filter(id => id !== itemId)); updateCustomIngredient(itemId, 0); };

  const saveTemplate = async () => {
    if (!editingTemplate || !currentTenantId) return;
    if (!editingTemplate.template_name.trim()) return toast({ title: "Name Required", variant: "destructive" });
    setIsSubmittingTemplate(true);
    try {
      let targetTemplateId = editingTemplate.id;
      if (targetTemplateId === 'new') {
        const { data, error } = await (supabase as any).from("masala_templates").insert({ tenant_id: currentTenantId, template_name: editingTemplate.template_name }).select().single();
        if (error) throw error; targetTemplateId = data.id;
      } else {
        const { error } = await (supabase as any).from("masala_templates").update({ template_name: editingTemplate.template_name }).eq("id", targetTemplateId);
        if (error) throw error;
      }
      const { data: existingRows } = await (supabase as any).from("template_ingredients").select("id, item_id").eq("template_id", targetTemplateId);
      const toInsert: any[] = []; const toUpdate: any[] = []; const idsToDelete: string[] = []; const existingMap = new Map<number, string>(); 
      
      if (existingRows) {
        for (const row of existingRows) { if (!existingMap.has(row.item_id)) existingMap.set(row.item_id, row.id); else idsToDelete.push(row.id); }
      }

      for (const ing of tempIngredients) {
        const isActiveAndValid = activeIngredientIds.includes(ing.item_id) && ing.qty > 0;
        if (existingMap.has(ing.item_id)) {
          if (isActiveAndValid) { toUpdate.push({ id: existingMap.get(ing.item_id), tenant_id: currentTenantId, template_id: targetTemplateId, item_id: ing.item_id, base_qty: ing.qty, unit: ing.unit }); } 
          else { idsToDelete.push(existingMap.get(ing.item_id)!); }
          existingMap.delete(ing.item_id); 
        } else if (isActiveAndValid) {
          toInsert.push({ tenant_id: currentTenantId, template_id: targetTemplateId, item_id: ing.item_id, base_qty: ing.qty, unit: ing.unit });
        }
      }

      for (const removedId of existingMap.values()) idsToDelete.push(removedId);
      if (idsToDelete.length > 0) await (supabase as any).from("template_ingredients").delete().in("id", idsToDelete);
      if (toUpdate.length > 0) { const { error: upError } = await (supabase as any).from("template_ingredients").upsert(toUpdate); if (upError) throw upError; }
      if (toInsert.length > 0) { const { error: inError } = await (supabase as any).from("template_ingredients").insert(toInsert); if (inError) throw inError; }

      toast({ title: "Recipe Saved Successfully!" }); setEditingTemplate(null); fetchTemplates(currentTenantId);
    } catch (err: any) { toast({ title: "Failed to save recipe", description: err.message, variant: "destructive" }); } 
    finally { setIsSubmittingTemplate(false); }
  };

  // CATEGORY MANAGEMENT
  const handleOpenCategory = (cat: Category | 'new') => {
    if (cat === 'new') {
      setCatNameEn(""); setCatNameMr(""); setCatImagePreview(null); setCatImageFile(null); setCatSelectedItems([]);
    } else {
      setCatNameEn(cat.name_en); setCatNameMr(cat.name_mr); setCatImagePreview(cat.image_url); setCatImageFile(null);
      // Find all items mapped to this category
      const assignedIds = items.filter(i => {
          const eco = Array.isArray(i.ecommerce_items) ? i.ecommerce_items[0] : i.ecommerce_items;
          return eco?.category_id === cat.id;
      }).map(i => i.id);
      setCatSelectedItems(assignedIds as any);
    }
    setEditingCategory(cat);
  }

  const handleCatImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setCatImageFile(file); setCatImagePreview(URL.createObjectURL(file)); }
  };

  const toggleCatItemSelection = (itemId: number) => {
    setCatSelectedItems(prev => prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId]);
  };

  const saveCategory = async () => {
    if (!currentTenantId) return;
    if (!catNameEn || !catNameMr) return toast({ title: "Both English and Marathi names are required", variant: "destructive" });
    
    setIsSubmittingCat(true);
    try {
      let finalImage = catImagePreview;
      if (catImageFile) {
        toast({ title: "Compressing category image..." });
        const blob = await compressImage(catImageFile);
        const fName = `cat-${Date.now()}.jpg`;
        await (supabase as any).storage.from('item-images').upload(fName, blob, { contentType: 'image/jpeg' });
        const { data } = (supabase as any).storage.from('item-images').getPublicUrl(fName);
        finalImage = data.publicUrl;
      }

      let catId = editingCategory !== 'new' ? editingCategory?.id : undefined;

      const catData = {
        tenant_id: currentTenantId,
        name_en: catNameEn,
        name_mr: catNameMr,
        image_url: finalImage,
        category_code: catNameEn.toUpperCase().replace(/\s+/g, '_')
      };

      if (catId) {
        await (supabase as any).from('ecommerce_categories').update(catData).eq('id', catId);
      } else {
        const { data } = await (supabase as any).from('ecommerce_categories').insert(catData).select().single();
        catId = data.id;
      }

      toast({ title: "Updating item mappings..." });
      
      // 1. Clear this category from all items first (so unselected items are removed)
      await (supabase as any).from('ecommerce_items').update({ category_id: null }).eq('category_id', catId).eq('tenant_id', currentTenantId);
      
      // 2. Set the category for all newly selected items
      if (catSelectedItems.length > 0) {
        await (supabase as any).from('ecommerce_items').update({ category_id: catId }).in('item_id', catSelectedItems).eq('tenant_id', currentTenantId);
      }

      toast({ title: "Category Saved Successfully!" });
      setEditingCategory(null);
      fetchCategories(currentTenantId);
      fetchItems(currentTenantId);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSubmittingCat(false);
    }
  }

  const activeSpices = tempIngredients.filter(ing => activeIngredientIds.includes(ing.item_id));
  const availableSpices = tempIngredients.filter(ing => !activeIngredientIds.includes(ing.item_id));

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fade-in pb-24 md:pb-12 font-sans print:hidden">
          
          <div className="flex items-center justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none truncate">Topology Management</h1>
              <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block truncate">Manage your master catalog, raw materials, blends, and e-commerce variants.</p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {activeTab !== "MASALA_TEMPLATES" && activeTab !== "WEB_CATEGORIES" && (
                <div className="relative w-full md:w-[320px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input placeholder="Search catalog..." className="pl-10 h-11 bg-white border-zinc-200 shadow-sm rounded-xl focus-visible:ring-zinc-900 transition-all font-medium text-sm w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
              )}
              {activeTab === "MASALA_TEMPLATES" && (
                <Button onClick={() => openTemplateEditor('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm font-semibold h-11 px-5 w-full sm:w-auto transition-transform active:scale-95">
                  <Plus className="h-4 w-4 mr-2" /> New Recipe
                </Button>
              )}
              {activeTab === "WEB_CATEGORIES" && (
                <Button onClick={() => handleOpenCategory('new')} className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-sm font-semibold h-11 px-5 w-full sm:w-auto transition-transform active:scale-95">
                  <Plus className="h-4 w-4 mr-2" /> New Category
                </Button>
              )}
            </div>
          </div>

          <div className="w-full overflow-x-auto scrollbar-none">
            <div className="flex gap-2.5 min-w-max pb-1">
              {CATEGORY_TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap border ${ isActive ? "bg-zinc-900 text-white border-zinc-900 shadow-md" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-300 shadow-sm" }`}>
                    <tab.icon className={`h-4 w-4 ${isActive ? 'text-zinc-300' : 'text-zinc-400'}`} /> {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-3 text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-900" />
              <span className="text-sm font-semibold tracking-wide">Loading topology...</span>
            </div>
          ) : activeTab === "WEB_CATEGORIES" ? (
              <div className="space-y-4">
                {categories.length === 0 ? (
                  <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50 rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-zinc-500">
                       <Globe className="h-12 w-12 mb-4 text-zinc-300" />
                       <p className="font-bold text-lg text-zinc-900">No Categories Found</p>
                       <p className="text-sm mt-1 text-center font-medium max-w-sm">Create visual categories to organize your storefront.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {categories.map(cat => (
                      <Card key={cat.id} className="rounded-3xl shadow-sm hover:shadow-md transition-shadow border-zinc-200 bg-white overflow-hidden group">
                        <CardContent className="p-4 flex flex-col items-center text-center h-full">
                          <div className="size-20 bg-zinc-50 rounded-full flex items-center justify-center border border-zinc-200 mb-3 overflow-hidden">
                            {cat.image_url ? (
                              <img src={cat.image_url} alt={cat.name_en} className="w-full h-full object-cover" />
                            ) : (
                              <ImageIcon className="h-8 w-8 text-zinc-300" />
                            )}
                          </div>
                          <h3 className="font-bold text-[15px] text-zinc-900 leading-tight">{cat.name_en}</h3>
                          <p className="text-[11px] font-semibold text-zinc-500 mt-1">{cat.name_mr}</p>
                          <Button variant="outline" size="sm" onClick={() => handleOpenCategory(cat)} className="mt-4 w-full rounded-xl text-xs font-semibold border-zinc-200 text-zinc-700">
                            <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
          ) : activeTab === "MASALA_TEMPLATES" ? (
             <div className="space-y-4">
                {templates.length === 0 ? (
                  <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50 rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-20 text-zinc-500">
                       <FlaskConical className="h-12 w-12 mb-4 text-zinc-300" />
                       <p className="font-bold text-lg text-zinc-900">No Recipes Configured</p>
                       <p className="text-sm mt-1 text-center font-medium max-w-sm">Create standard base recipes to instantly load complex ingredients during counter checkout.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {templates.map(t => (
                      <Card key={t.id} className="rounded-2xl shadow-sm hover:shadow-md transition-shadow border-zinc-200 bg-white overflow-hidden group">
                        <CardContent className="p-0 flex flex-col h-full">
                          <div className="p-5 flex-1">
                            <div className="flex justify-between items-start mb-4">
                              <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center border border-emerald-100 shrink-0">
                                <FlaskConical className="h-6 w-6" />
                              </div>
                            </div>
                            <h3 className="font-bold text-lg text-zinc-900 leading-tight mb-1.5">{t.template_name}</h3>
                            <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t.template_ingredients.length} configured spices</p>
                          </div>
                          <div className="border-t border-zinc-100 bg-zinc-50 p-3">
                             <Button variant="outline" size="sm" onClick={() => openTemplateEditor(t)} className="w-full rounded-xl text-xs font-semibold border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-100 text-zinc-700">
                               <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit Configuration
                             </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
             </div>
          ) : filteredItems.length === 0 ? (
             <Card className="border border-dashed border-zinc-300 shadow-none bg-zinc-50/50 rounded-2xl">
               <CardContent className="flex flex-col items-center justify-center py-20 text-zinc-500">
                  <Package className="h-12 w-12 mb-4 text-zinc-300" />
                  <p className="font-bold text-lg text-zinc-900">No items found</p>
                  <p className="text-sm mt-1 text-center font-medium">We couldn't find anything matching your search in this category.</p>
               </CardContent>
             </Card>
          ) : (
            <div>
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {filteredItems.map((item) => {
                  const typeStr = String((item as any).item_type || "FINISHED_PRODUCT");
                  const isService = typeStr === "SERVICE";
                  const isRaw = typeStr === "RAW_MATERIAL";
                  const ecoData = item.ecommerce_items?.[0];
                  const isPublishedOnWeb = ecoData?.is_published ?? (item.show_on_web ?? false);
                  
                  return (
                    <Card key={item.id} className="border-zinc-200 shadow-sm rounded-[24px] overflow-hidden bg-white">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex gap-4">
                          <button onClick={() => item.image_url && setPreviewImage(item.image_url)} className={`h-20 w-20 rounded-[18px] border border-zinc-200 overflow-hidden flex items-center justify-center shrink-0 bg-zinc-50 ${item.image_url ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}>
                            {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-zinc-300" />}
                          </button>
                          <div className="flex-1 min-w-0 flex flex-col justify-center">
                             <div className="mb-2">{getItemTypeBadge(typeStr)}</div>
                             <h3 className="font-bold text-base text-zinc-900 truncate leading-tight">{item.item_name}</h3>
                             <p className="text-[11px] text-zinc-500 font-mono mt-1 font-medium">{item.item_code}</p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-3 text-xs bg-zinc-50 border border-zinc-100 p-4 rounded-2xl">
                          <div className="flex flex-col col-span-2">
                             <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Selling Rate</span>
                             <span className="font-bold text-lg text-zinc-900">₹{item.selling_price} <span className="text-xs font-semibold text-zinc-500">/ {(item as any).base_unit || 'unit'}</span></span>
                          </div>
                          {!isRaw && !isService && (
                            <div className="flex flex-col col-span-1">
                              <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Variant</span>
                              <span className="font-semibold text-zinc-800 truncate">{item.size || 'N/A'}</span>
                            </div>
                          )}
                          {!isService && (
                            <div className="flex flex-col col-span-1">
                                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Stock</span>
                                <span className={`font-bold ${Number(item.quantity) < 5 ? 'text-rose-600' : 'text-zinc-900'}`}>{item.quantity} {(item as any).base_unit || 'units'}</span>
                            </div>
                          )}
                        </div>
                        <div className="flex justify-between items-center pt-2">
                            <div className="flex items-center gap-3">
                              {!isService && Number(item.quantity) < 5 && ( <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg uppercase tracking-wider"><AlertTriangle className="h-3 w-3" /> Low Stock</span> )}
                            </div>
                            <div className="flex gap-2">
                              {!isService && <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-zinc-200 text-zinc-600 shadow-sm" onClick={() => handlePrintLabel(item)}><Printer className="h-4 w-4" /></Button>}
                              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-zinc-200 text-zinc-600 shadow-sm" onClick={() => setEditingItem(item)}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm" onClick={() => setDeletingItem(item)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              <Card className="hidden md:block shadow-sm border-zinc-200 rounded-[24px] overflow-hidden bg-white w-full">
                <CardContent className="p-0">
                  <div className="overflow-x-auto w-full">
                    <Table className="w-full">
                      <TableHeader className="bg-zinc-50/80 border-b border-zinc-200">
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-20 text-center py-4">Photo</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4">Identity</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4">Item Name</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4">Variant</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4 text-center">Web</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4 text-right">Selling Price</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4 text-center">Stock Level</TableHead>
                          <TableHead className="font-bold text-zinc-500 uppercase tracking-wider text-[11px] py-4 text-right pr-6">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                          {filteredItems.map((item) => {
                            const typeStr = String((item as any).item_type || "FINISHED_PRODUCT");
                            const isService = typeStr === "SERVICE";
                            const ecoData = item.ecommerce_items?.[0];
                            const isPublishedOnWeb = ecoData?.is_published ?? (item.show_on_web ?? false);
                            
                            return (
                              <TableRow key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/60 transition-colors">
                                <TableCell className="p-4 text-center">
                                   <button onClick={() => item.image_url && setPreviewImage(item.image_url)} className={`h-12 w-12 mx-auto rounded-xl border border-zinc-200 overflow-hidden flex items-center justify-center bg-white shadow-sm ${item.image_url ? 'cursor-pointer hover:border-zinc-400 transition-colors' : ''}`}>
                                     {item.image_url ? <img src={item.image_url} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-4 w-4 text-zinc-300" />}
                                   </button>
                                </TableCell>
                                <TableCell className="p-4 align-middle">
                                  <div className="flex flex-col items-start gap-2">
                                    {getItemTypeBadge(typeStr)}
                                    <span className="font-mono text-[11px] font-semibold text-zinc-400 tracking-wide">{item.item_code}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="p-4 align-middle"><span className="font-bold text-[15px] text-zinc-900">{item.item_name}</span></TableCell>
                                <TableCell className="p-4 align-middle">
                                  {isService ? <span className="text-xs text-zinc-400 font-semibold">—</span> : <span className="inline-flex text-xs font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 px-3 py-1 rounded-lg">{item.size || 'N/A'}</span>}
                                </TableCell>
                                <TableCell className="p-4 align-middle text-center">
                                   <Switch checked={isPublishedOnWeb} onCheckedChange={() => toggleWebVisibility(item, isPublishedOnWeb)} className="scale-90 data-[state=checked]:bg-zinc-900" />
                                </TableCell>
                                <TableCell className="p-4 align-middle text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-[15px] text-zinc-900">₹{item.selling_price}</span>
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">/ {(item as any).base_unit || 'unit'}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="p-4 align-middle text-center">
                                  {isService ? <span className="text-xs text-zinc-400 font-semibold">—</span> : (
                                    <div className="flex flex-col items-center">
                                        <span className={`font-bold text-[15px] ${Number(item.quantity) < 5 ? 'text-rose-600' : 'text-zinc-900'}`}>{item.quantity}</span>
                                        {Number(item.quantity) < 5 && <span className="text-[9px] text-rose-500 font-bold uppercase tracking-widest mt-0.5">Low</span>}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="p-4 align-middle text-right pr-6">
                                  <div className="flex justify-end gap-2.5">
                                    {!isService && <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg text-zinc-500 border-zinc-200 shadow-sm hover:bg-white hover:text-zinc-900 hover:border-zinc-300" onClick={() => handlePrintLabel(item)}><Printer className="h-4 w-4" /></Button>}
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg text-zinc-500 border-zinc-200 shadow-sm hover:bg-white hover:text-zinc-900 hover:border-zinc-300" onClick={() => setEditingItem(item)}><Pencil className="h-4 w-4" /></Button>
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg text-zinc-400 border-transparent hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-none transition-colors" onClick={() => setDeletingItem(item)}><Trash2 className="h-4 w-4" /></Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>

      {/* CATEGORY EDIT MODAL */}
      <Dialog open={!!editingCategory} onOpenChange={(open) => !open && setEditingCategory(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col rounded-[24px] p-0 border-zinc-200 shadow-2xl bg-zinc-50">
           <div className="px-6 py-5 border-b border-zinc-200 bg-white shrink-0 z-10">
              <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900">
                {editingCategory === 'new' ? 'Create Web Category' : 'Edit Category'}
              </DialogTitle>
           </div>
           
           <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="flex items-center gap-5 bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm">
                 <div className="size-24 rounded-full border-2 border-dashed border-zinc-300 bg-zinc-50 flex items-center justify-center shrink-0 overflow-hidden relative group">
                    {catImagePreview ? (
                      <img src={catImagePreview} className="w-full h-full object-cover" />
                    ) : (
                      <ImagePlus className="h-8 w-8 text-zinc-300" />
                    )}
                    <Label className="absolute inset-0 bg-black/40 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 cursor-pointer transition-opacity">
                       <span className="text-[10px] font-black uppercase">Upload</span>
                       <Input ref={catImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleCatImageChange} />
                    </Label>
                 </div>
                 <div className="flex-1 space-y-4">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">English Name</Label>
                      <Input value={catNameEn} onChange={(e) => setCatNameEn(e.target.value)} placeholder="e.g. Ready Masale" className="h-11 rounded-xl bg-zinc-50 font-bold" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Marathi Name</Label>
                      <Input value={catNameMr} onChange={(e) => setCatNameMr(e.target.value)} placeholder="e.g. तयार मसाले" className="h-11 rounded-xl bg-zinc-50 font-bold" />
                    </div>
                 </div>
              </div>

              <div className="bg-white p-5 rounded-3xl border border-zinc-200 shadow-sm flex flex-col max-h-[400px]">
                 <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider mb-3">Assign Items to Category</Label>
                 <div className="overflow-y-auto pr-2 space-y-2 no-scrollbar">
                    {items.map(item => {
                       const isSelected = catSelectedItems.includes(item.id as any);
                       return (
                         <div key={item.id} onClick={() => toggleCatItemSelection(item.id as any)} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-zinc-200 hover:bg-zinc-50'}`}>
                           {isSelected ? <CheckSquare className="size-5 text-blue-600 shrink-0" /> : <Square className="size-5 text-zinc-300 shrink-0" />}
                           <div className="size-10 bg-white rounded-lg border border-zinc-200 shrink-0 flex items-center justify-center p-1">
                              {item.image_url ? <img src={item.image_url} className="w-full h-full object-contain" /> : <ImageIcon className="size-4 text-zinc-300" />}
                           </div>
                           <div className="flex flex-col flex-1 min-w-0">
                              <span className="text-sm font-bold text-zinc-900 truncate">{item.item_name}</span>
                              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">₹{item.selling_price}</span>
                           </div>
                         </div>
                       )
                    })}
                 </div>
              </div>
           </div>
           
           <DialogFooter className="border-t border-zinc-200 bg-white p-5 shrink-0 gap-3 sm:gap-0">
              <Button variant="outline" onClick={() => setEditingCategory(null)} className="h-12 rounded-xl font-bold border-zinc-200 w-full sm:w-auto text-zinc-700">Cancel</Button>
              <Button onClick={saveCategory} disabled={isSubmittingCat} className="h-12 rounded-xl bg-blue-600 hover:bg-blue-700 font-bold text-white shadow-sm w-full sm:w-auto active:scale-95 transition-transform">
                {isSubmittingCat ? 'Saving...' : 'Save Category'}
              </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* RECIPE EDIT MODAL */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col rounded-[24px] p-0 border-zinc-200 shadow-2xl bg-zinc-50">
           <div className="px-6 py-5 border-b border-zinc-200 bg-white shrink-0 z-10 flex justify-between items-center">
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900">{editingTemplate?.id === 'new' ? 'Create New Recipe' : 'Edit Recipe'}</DialogTitle>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Strict Sequence Configuration</p>
              </div>
           </div>
           
           <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="space-y-1.5 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Recipe Name</Label>
                <Input value={editingTemplate?.template_name || ''} onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, template_name: e.target.value } : null)} className="h-12 rounded-xl border-zinc-200 shadow-inner font-bold focus-visible:ring-zinc-900 bg-zinc-50" placeholder="e.g. Special Malvani Mix" />
              </div>

              <div className="space-y-3">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">Active Ingredients (Per KG)</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                   {activeSpices.length === 0 ? (
                      <p className="text-xs text-center text-zinc-400 py-8 font-semibold col-span-full border border-dashed border-zinc-300 rounded-2xl">No active spices. Add from the list below.</p>
                   ) : (
                      activeSpices.map((ing) => (
                        <div key={ing.item_id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm">
                          <div className="min-w-0 flex-1 pl-2"><p className="truncate text-sm font-bold text-zinc-900">{ing.item_name}</p></div>
                          <div className="flex items-center gap-1.5">
                            <div className="flex items-center gap-1.5 bg-zinc-50 rounded-xl p-1 border border-zinc-100">
                              <Input type="number" step="0.001" inputMode="decimal" value={ing.qty} onChange={(e) => updateCustomIngredient(ing.item_id, Number(e.target.value))} className="h-10 w-[72px] rounded-lg border-zinc-200 text-center font-bold text-[15px] shadow-inner focus-visible:ring-1 focus-visible:ring-emerald-500 bg-white" />
                              <span className="text-[11px] font-bold text-zinc-500 w-5">{ing.unit}</span>
                            </div>
                            <button onClick={() => handleRemoveSpice(ing.item_id)} className="p-2 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"><X className="h-4 w-4" /></button>
                          </div>
                        </div>
                      ))
                   )}
                </div>
              </div>

              {availableSpices.length > 0 && (
                <div className="space-y-3 pt-6 border-t border-zinc-200">
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">Available Spices to Add</Label>
                  <div className="flex flex-wrap gap-2">
                    {availableSpices.map(ing => (
                      <button key={ing.item_id} onClick={() => handleAddSpice(ing.item_id)} className="flex items-center gap-1.5 px-3 py-2 bg-white border border-zinc-200 rounded-xl text-xs font-bold text-zinc-700 hover:border-zinc-400 hover:bg-zinc-50 shadow-sm active:scale-95 transition-all">
                        <Plus className="h-3 w-3 text-zinc-400" /> {ing.item_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
           </div>
           
           <DialogFooter className="border-t border-zinc-200 bg-white p-5 shrink-0 gap-3 sm:gap-0">
              <Button variant="outline" onClick={() => setEditingTemplate(null)} className="h-12 rounded-xl font-bold border-zinc-200 bg-white w-full sm:w-auto text-zinc-700">Cancel</Button>
              <Button onClick={saveTemplate} disabled={isSubmittingTemplate} className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-sm w-full sm:w-auto active:scale-95 transition-transform">
                {isSubmittingTemplate ? 'Saving Configuration...' : 'Save Strict Recipe'}
              </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md p-2 bg-transparent border-0 shadow-none">
           {previewImage && (
              <div className="relative rounded-[24px] overflow-hidden bg-zinc-900/50 backdrop-blur-md shadow-2xl border border-white/10">
                 <img src={previewImage} alt="Product preview" className="w-full h-auto object-contain max-h-[80vh] rounded-[24px]" />
              </div>
           )}
        </DialogContent>
      </Dialog>

      {/* DUAL TABLE EDIT MODAL */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-xl max-h-[90dvh] overflow-y-auto rounded-[24px] p-0 border-zinc-200 shadow-2xl bg-zinc-50">
          <div className="px-6 py-5 border-b border-zinc-200 bg-white sticky top-0 z-20 shadow-sm">
            <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900">Edit {editingItem?.item_name}</DialogTitle>
          </div>
          
          <form onSubmit={handleSubmit(handleUpdate)} className="space-y-6 p-6 pt-4">
            
            {/* Primary Image */}
            {String((editingItem as any)?.item_type) !== "SERVICE" && (
              <div className="flex items-center gap-4 p-4 border border-zinc-200 rounded-2xl bg-white shadow-sm">
                 <div className="h-16 w-16 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-50 flex items-center justify-center shrink-0 shadow-inner">
                    {editImagePreview ? <img src={editImagePreview} alt="Preview" className="h-full w-full object-cover" /> : <ImageIcon className="h-6 w-6 text-zinc-300" />}
                 </div>
                 <div className="flex flex-col gap-2 flex-1">
                    <Label htmlFor="edit-image" className="cursor-pointer bg-white border border-zinc-200 text-zinc-700 text-xs font-bold px-3 py-2.5 rounded-xl text-center shadow-sm flex items-center justify-center gap-2">
                       <UploadCloud className="h-4 w-4" /> Primary Photo
                    </Label>
                    <Input ref={fileInputRef} id="edit-image" type="file" accept="image/*" className="hidden" onChange={handleEditImageChange} />
                    {editImagePreview && <button type="button" onClick={handleRemoveEditPhoto} className="text-[11px] font-bold text-rose-500 uppercase tracking-wider mt-1">Remove Photo</button>}
                 </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Item Name</Label>
                <Input className="h-12 rounded-xl bg-white font-bold" {...register("item_name")} />
                {errors.item_name && <p className="text-xs font-semibold text-rose-500">{errors.item_name.message}</p>}
              </div>

              {String((editingItem as any)?.item_type) !== "SERVICE" && (
                <div className="space-y-1.5">
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Variant / Weight</Label>
                  <Input placeholder="e.g. 1 kg, 500 g, Large" className="h-12 rounded-xl bg-white font-bold text-sm" {...register("size")} />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {String((editingItem as any)?.item_type) !== "SERVICE" && (
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">POS Buy Price (₹)</Label>
                    <Input type="number" inputMode="decimal" className="h-12 rounded-xl bg-white font-bold" {...register("purchase_price")} />
                  </div>
                )}
                <div className={`space-y-1.5 ${String((editingItem as any)?.item_type) === "SERVICE" ? "col-span-2" : ""}`}>
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">POS Sell Rate (₹)</Label>
                  <div className="relative">
                    <Input type="number" inputMode="decimal" className="h-12 rounded-xl bg-emerald-50 text-emerald-800 font-bold border-emerald-200" {...register("selling_price")} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600/50">per {(editingItem as any)?.base_unit || 'unit'}</span>
                  </div>
                </div>
              </div>

              {/* NEW E-COMMERCE SECTION */}
              <div className="space-y-5 pt-6 border-t border-zinc-200 mt-6 bg-blue-50/40 -mx-6 px-6 pb-6 shadow-inner">
                  <div className="flex items-center justify-between pt-2">
                      <div className="flex items-center gap-2">
                        <Globe className="h-5 w-5 text-blue-600" />
                        <h3 className="text-base font-black text-blue-900">E-Commerce Settings</h3>
                      </div>
                      <Switch checked={watchedShowOnWeb} onCheckedChange={(val) => setValue("show_on_web", val)} className="data-[state=checked]:bg-blue-600" />
                  </div>
                  
                  {/* Delivery Policy Dropdown */}
                  <div className="space-y-2 pt-2">
                    <Label className="text-[11px] font-bold text-blue-900/60 uppercase tracking-wider flex items-center gap-1"><ShieldAlert className="h-3.5 w-3.5"/> Delivery & Rules Policy</Label>
                    <select {...register("policy_id")} className="w-full h-12 rounded-xl border border-blue-200/60 bg-white px-3 font-bold text-sm outline-none text-zinc-700 shadow-sm focus:ring-2 focus:ring-blue-500">
                       <option value="">No special policy selected...</option>
                       {policies.map(p => <option key={p.id} value={p.id}>{p.policy_name} ({p.delivery_estimate})</option>)}
                    </select>
                  </div>

                  {/* Dynamic Weight Variants */}
                  <div className="space-y-3 pt-4 border-t border-blue-200/60">
                    <div className="flex justify-between items-center">
                       <Label className="text-[12px] font-black text-blue-900">Size/Weight Variants</Label>
                       <Button type="button" variant="outline" size="sm" onClick={() => appendVariant({ weight: '', price: 0 })} className="h-8 text-xs font-bold rounded-lg border-blue-200 text-blue-700 hover:bg-blue-100">
                          <Plus className="h-3.5 w-3.5 mr-1"/> Add Variant
                       </Button>
                    </div>
                    {variantFields.length === 0 && <p className="text-xs text-blue-900/50 font-semibold italic pb-2">No web variants added yet.</p>}
                    
                    {variantFields.map((field, index) => (
                       <div key={field.id} className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-blue-100 shadow-sm animate-in fade-in zoom-in-95">
                          <div className="flex-1 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">Weight</span>
                            <Input placeholder="e.g. 500g" {...register(`ecommerce_variants.${index}.weight`)} className="h-11 rounded-xl bg-transparent text-sm font-bold pl-14 border-0 shadow-none focus-visible:ring-0" />
                          </div>
                          <div className="w-px h-6 bg-zinc-100 shrink-0" />
                          <div className="w-28 relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">₹</span>
                            <Input type="number" placeholder="Price" {...register(`ecommerce_variants.${index}.price`)} className="h-11 rounded-xl bg-transparent text-sm font-bold pl-7 border-0 shadow-none focus-visible:ring-0 text-emerald-600" />
                          </div>
                          <Button type="button" variant="ghost" size="icon" onClick={() => removeVariant(index)} className="text-rose-500 hover:bg-rose-50 rounded-xl h-10 w-10 shrink-0"><Trash2 className="h-4 w-4"/></Button>
                       </div>
                    ))}
                  </div>

                  {/* Multiple Image Gallery */}
                  <div className="space-y-3 pt-4 border-t border-blue-200/60">
                     <Label className="text-[12px] font-black text-blue-900 flex justify-between items-center">
                        Image Gallery 
                        {watchedAdditionalImages.length > 0 && (
                          <button type="button" onClick={() => setValue("additional_images", [])} className="text-[10px] text-rose-500 uppercase tracking-widest font-bold">Clear Existing</button>
                        )}
                     </Label>
                     
                     <div className="flex flex-wrap gap-3">
                        {watchedAdditionalImages.map((url, i) => (
                           <div key={i} className="h-16 w-16 rounded-xl border border-zinc-200 overflow-hidden shadow-sm relative group bg-white">
                              <img src={url} alt="" className="h-full w-full object-cover" />
                           </div>
                        ))}
                        {galleryPreviews.map((url, i) => (
                           <div key={`new-${i}`} className="h-16 w-16 rounded-xl border border-blue-400 overflow-hidden shadow-sm relative group bg-white">
                              <img src={url} alt="" className="h-full w-full object-cover" />
                              <div className="absolute inset-0 bg-blue-500/20 flex items-center justify-center"><Loader2 className="h-4 w-4 text-white animate-spin"/></div>
                           </div>
                        ))}
                        
                        <Label className="h-16 w-16 rounded-xl border border-dashed border-blue-400 bg-white hover:bg-blue-50 cursor-pointer flex flex-col items-center justify-center text-blue-600 shadow-sm transition-colors">
                           <ImagePlus className="h-5 w-5 mb-1" />
                           <span className="text-[9px] font-black uppercase">Add</span>
                           <Input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryChange} />
                        </Label>
                     </div>
                  </div>

                  <div className="space-y-1.5 pt-2">
                    <Label className="text-[11px] font-bold text-blue-900/60 uppercase tracking-wider">Web Description</Label>
                    <textarea 
                      className="min-h-[80px] w-full rounded-xl border-blue-200/60 shadow-inner bg-white focus-visible:ring-blue-500 font-medium text-sm p-3 border outline-none" 
                      placeholder="Detailed e-commerce description..."
                      {...register("description")} 
                    />
                  </div>
              </div>
            </div>
            {String((editingItem as any)?.item_type) !== "SERVICE" && (
                <div className="space-y-4 pt-4 border-t border-zinc-200">
                  <div className="flex items-center justify-between border border-zinc-200 p-4 rounded-2xl bg-white shadow-sm mt-4">
                    <div className="space-y-0.5 flex flex-col">
                        <Label className="text-sm font-bold text-zinc-900 flex items-center gap-2"><Package className="h-4 w-4 text-zinc-500"/> Bulk Pack Setup</Label>
                        <span className="text-[11px] font-semibold text-zinc-500">Track POS inventory in master boxes</span>
                    </div>
                    <Switch 
                      checked={watchedIsPack}
                      onCheckedChange={(val) => {
                        setValue("is_pack", val);
                        if(!val) { setValue("pieces_per_box", 1); setValue("price_per_piece", undefined); }
                      }}
                      className="data-[state=checked]:bg-zinc-900"
                    />
                  </div>

                  {watchedIsPack ? (
                      <div className="space-y-4 border border-zinc-200 p-4 bg-white rounded-2xl shadow-sm">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Units per Pack</Label>
                                <Input type="number" inputMode="numeric" className="h-12 rounded-xl bg-white font-bold" {...register("pieces_per_box")} />
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total Packs</Label>
                                <Input type="number" inputMode="numeric" className="h-12 rounded-xl bg-white font-bold" {...register("number_of_boxes")} />
                              </div>
                          </div>
                          <div className="text-xs font-bold text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-200 text-center">
                             Total Inventory: {watchedBoxes || 0} packs × {watchedPieces || 1} units = <span className="text-zinc-900">{watchedIsPack && watchedBoxes ? (watchedBoxes * (watchedPieces || 1)) : 0} units</span>
                          </div>
                      </div>
                  ) : (
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Stock Quantity ({(editingItem as any)?.base_unit || 'units'})</Label>
                        <Input type="number" inputMode="decimal" className="h-12 rounded-xl border-zinc-200 shadow-inner focus-visible:ring-zinc-900 font-bold text-xl text-zinc-900 bg-white" {...register("quantity")} />
                      </div>
                  )}
                  {watchedIsPack && <input type="hidden" {...register("quantity")} />}
                </div>
              )}
            <div className="flex gap-3 pt-6 border-t border-zinc-200 sticky bottom-0 bg-zinc-50 pb-2 -mx-6 px-6 shadow-[0_-10px_20px_rgba(250,250,250,1)]">
              <Button type="button" variant="outline" className="h-12 rounded-xl font-bold bg-white w-full" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="h-12 rounded-xl font-bold bg-zinc-900 text-white w-full active:scale-95 transition-transform">
                  {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin"/> : "Save All Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent className="rounded-[24px] border-zinc-200 shadow-2xl p-0 overflow-hidden sm:max-w-sm">
          <div className="p-6 bg-white">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mb-4"><Trash2 className="h-5 w-5 text-rose-500" /></div>
            <AlertDialogTitle className="text-lg font-bold text-zinc-900 mb-1">Delete Item</AlertDialogTitle>
            <AlertDialogDescription className="font-semibold text-zinc-500 text-sm mt-2">This will permanently remove <span className="font-bold text-zinc-800">{deletingItem?.item_name}</span>. This action cannot be undone.</AlertDialogDescription>
          </div>
          <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="h-12 rounded-xl font-bold border-zinc-200 text-zinc-700 w-full mt-0 bg-white">Keep Item</AlertDialogCancel>
            <Button onClick={handleDelete} className="h-12 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white w-full shadow-sm">Yes, Delete</Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {printingItem && (
        <div id="printable-labels" className="hidden print:block">
          <style type="text/css" media="print">
            {`
              body * { visibility: hidden; }
              #printable-labels, #printable-labels * { visibility: visible; }
              #printable-labels { position: absolute; left: 0; top: 0; width: 100%; margin: 0; padding: 0; background-color: white; }
              @page { size: auto; margin: 5mm; }
            `}
          </style>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: printingItem.pieces_per_box > 1 ? Math.ceil(printingItem.quantity / printingItem.pieces_per_box) : printingItem.quantity }).map((_, i) => (
              <div key={i} className="border border-black bg-white p-1 flex flex-col items-center text-center h-[160px] justify-between break-inside-avoid">
                <div className="w-full">
                  <div className="font-bold text-[10px] text-black uppercase truncate">{storeName}</div>
                  <div className="text-[10px] font-bold text-gray-900 truncate mt-1">{printingItem.item_name}</div>
                  <div className="text-[9px] text-gray-700 mt-0.5">{printingItem.brand_name || 'Generic'} - {printingItem.size || (printingItem as any).base_unit}</div>
                </div>
                <div className="font-extrabold text-xl text-black">₹{printingItem.selling_price}</div>
                <div className="w-full flex justify-center overflow-hidden">
                  <Barcode value={printingItem.item_code} height={35} width={1.4} fontSize={11} displayValue={true} margin={2} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppLayout>
  );
}