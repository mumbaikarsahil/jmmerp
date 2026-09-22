import React, { useState, useEffect, useRef, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Barcode from "react-barcode"; 
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import type { Database } from "@/lib/supabase";
import { 
  Search, Pencil, Trash2, Printer, Loader2, Package, 
  AlertTriangle, Image as ImageIcon, Globe, UploadCloud,
  Scale, Wrench, Layers, FlaskConical, Plus
} from "lucide-react";

export type Item = Database["public"]["Tables"]["items"]["Row"];

// EXACT SEQUENCE BASED ON JMM PHYSICAL BILL BOOK
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
        if (scaleSize < 1) {
          canvas.width = MAX_WIDTH;
          canvas.height = img.height * scaleSize;
        } else {
          canvas.width = img.width;
          canvas.height = img.height;
        }
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) resolve(blob);
          else reject(new Error("Canvas to Blob failed"));
        }, "image/jpeg", 0.7);
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const editSchema = z.object({
  item_name: z.string().min(1, "Item name is required"),
  size: z.string().optional(),
  selling_price: z.coerce.number().min(0),
  purchase_price: z.coerce.number().min(0).default(0),
  quantity: z.coerce.number().min(0).default(0),
  is_pack: z.boolean().default(false),
  pieces_per_box: z.coerce.number().min(1).default(1),
  number_of_boxes: z.coerce.number().min(0).default(0).optional(),
  price_per_piece: z.coerce.number().min(0).optional(),
  show_on_web: z.boolean().default(true),
});

type EditFormData = z.infer<typeof editSchema>;

type MasalaTemplate = {
  id: string;
  template_name: string;
  template_ingredients: {
    item_id: number;
    base_qty: number;
    unit: string;
    items?: { item_name: string | null; selling_price: number | null; base_unit: string | null; } | null;
  }[];
};

type TempIngredient = {
  item_id: number;
  item_name: string;
  qty: number;
  unit: string;
};

const getSafeItemName = (item: Item) => item.item_name || "Unnamed Item";

const CATEGORY_TABS = [
  { id: "ALL", label: "All Items", icon: Layers },
  { id: "FINISHED_PRODUCT", label: "Ready Items & Blends", icon: Package },
  { id: "RAW_MATERIAL", label: "Raw Spices", icon: Scale },
  { id: "MASALA_TEMPLATES", label: "Masala Recipes", icon: FlaskConical },
  { id: "SERVICE", label: "Services (Labour)", icon: Wrench },
];

export default function ManageInventory() {
  const [items, setItems] = useState<Item[]>([]);
  const [filteredItems, setFilteredItems] = useState<Item[]>([]);
  const [templates, setTemplates] = useState<MasalaTemplate[]>([]);
  const [rawMaterials, setRawMaterials] = useState<Item[]>([]);
  
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("ALL");
  
  const [currentTenantId, setCurrentTenantId] = useState<string | null>(null);
  const [storeName, setStoreName] = useState("Loading...");
  const { toast } = useToast();

  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [deletingItem, setDeletingItem] = useState<Item | null>(null);
  const [printingItem, setPrintingItem] = useState<Item | null>(null); 
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  // Template Editing States
  const [editingTemplate, setEditingTemplate] = useState<MasalaTemplate | { id: 'new', template_name: '', template_ingredients: [] } | null>(null);
  const [tempIngredients, setTempIngredients] = useState<TempIngredient[]>([]);
  const [isSubmittingTemplate, setIsSubmittingTemplate] = useState(false);
  
  // Photo Edit States
  const [editImageFile, setEditImageFile] = useState<File | null>(null);
  const [editImagePreview, setEditImagePreview] = useState<string | null>(null);
  const [removeImageFlag, setRemoveImageFlag] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, control, setValue, formState: { errors, isSubmitting } } = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { is_pack: false, pieces_per_box: 1, quantity: 0, show_on_web: true }
  });

  const watchedIsPack = useWatch({ control, name: "is_pack" });
  const watchedPieces = useWatch({ control, name: "pieces_per_box" });
  const watchedBoxes = useWatch({ control, name: "number_of_boxes" });
  const watchedShowOnWeb = useWatch({ control, name: "show_on_web" });

  // Compute strictly sorted raw materials once
  const sortedRawMaterials = useMemo(() => {
    return [...rawMaterials].sort((a, b) => {
      let idxA = STRICT_MASALA_SEQUENCE.findIndex(seq => getSafeItemName(a).includes(seq));
      let idxB = STRICT_MASALA_SEQUENCE.findIndex(seq => getSafeItemName(b).includes(seq));
      if (idxA === -1) idxA = 999;
      if (idxB === -1) idxB = 999;
      return idxA - idxB;
    });
  }, [rawMaterials]);

  useEffect(() => {
    if (watchedIsPack && watchedPieces && watchedBoxes !== undefined) {
      const total = watchedPieces * watchedBoxes;
      setValue("quantity", total);
    }
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
          await fetchItems(profile.tenant_id);
          await fetchTemplates(profile.tenant_id);
        }
      } catch (error) {} finally { setIsLoading(false); }
    };
    initializeTenantData();
  }, []);

  useEffect(() => {
    if (activeTab === "MASALA_TEMPLATES") return; 
    const results = items.filter((item) => {
      const typeStr = String((item as any).item_type || "FINISHED_PRODUCT");
      const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                            (item.item_code && item.item_code.toLowerCase().includes(searchTerm.toLowerCase()));
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

      reset({
        item_name: editingItem.item_name,
        size: editingItem.size || '',
        selling_price: Number(editingItem.selling_price || 0),
        purchase_price: Number(editingItem.purchase_price || 0),
        quantity: Number(editingItem.quantity || 0),
        is_pack: isPack,
        pieces_per_box: pieces,
        number_of_boxes: estimatedBoxes,
        price_per_piece: Number(editingItem.price_per_piece || 0),
        show_on_web: editingItem.show_on_web ?? true,
      });
    }
  }, [editingItem, reset]);

  const fetchStoreDetails = async (tenantId: string) => {
    const { data: tenantData } = await supabase.from("tenants").select("tenant_name").eq("id", tenantId).single();
    const tenant = tenantData as { tenant_name: string } | null;
    if (tenant?.tenant_name) setStoreName(tenant.tenant_name);
  };

  const fetchItems = async (tenantId: string) => {
    const { data, error } = await supabase.from("items").select("*").eq("tenant_id", tenantId).order("created_at", { ascending: false });
    if (error) toast({ title: "Error fetching inventory", description: error.message, variant: "destructive" });
    else { 
      setItems(data || []); 
      setFilteredItems(data || []); 
      setRawMaterials((data || []).filter((item: Item) => (item as any).item_type === "RAW_MATERIAL"));
    }
  };

  const fetchTemplates = async (tenantId: string) => {
    const { data } = await (supabase as any).from("masala_templates").select(`id, template_name, template_ingredients (item_id, base_qty, unit, items (item_name, selling_price, base_unit))`).eq("tenant_id", tenantId).order("template_name", { ascending: true });
    if (data) setTemplates(data);
  };

  const toggleWebVisibility = async (item: Item, currentState: boolean) => {
    if (!currentTenantId) return;
    try {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, show_on_web: !currentState } : i));
      const { error } = await (supabase as any).from("items").update({ show_on_web: !currentState }).eq("id", item.id).eq("tenant_id", currentTenantId);
      if (error) throw error;
    } catch (error: any) {
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, show_on_web: currentState } : i));
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleEditImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) { setEditImageFile(file); setEditImagePreview(URL.createObjectURL(file)); setRemoveImageFlag(false); }
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

      if (removeImageFlag) {
        finalImageUrl = null;
      } else if (editImageFile) {
        toast({ title: "Compressing & Uploading image..." });
        const compressedBlob = await compressImage(editImageFile);
        const fileName = `${editingItem.item_code}-${Date.now()}.jpg`;
        const { error: uploadError } = await (supabase as any).storage.from("item-images").upload(fileName, compressedBlob, { contentType: "image/jpeg" });
        if (uploadError) throw new Error("Image upload failed: " + uploadError.message);
        const { data: publicUrlData } = (supabase as any).storage.from("item-images").getPublicUrl(fileName);
        finalImageUrl = publicUrlData.publicUrl;
      }
      
      const { error } = await (supabase as any)
        .from("items")
        .update({
          item_name: data.item_name,
          size: data.size || null,
          selling_price: data.selling_price,
          purchase_price: data.purchase_price,
          quantity: data.quantity,
          pieces_per_box: isPack ? data.pieces_per_box : 1,
          price_per_piece: isPack ? data.price_per_piece : data.selling_price,
          show_on_web: data.show_on_web,
          image_url: finalImageUrl
        })
        .eq("id", editingItem.id)
        .eq("tenant_id", currentTenantId);

      if (error) throw error;
      toast({ title: "Item Updated", description: `${data.item_name} has been updated.` });
      setEditingItem(null);
      fetchItems(currentTenantId); 
    } catch (error: any) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletingItem || !currentTenantId) return;
    try {
      const { error } = await (supabase as any).from("items").delete().eq("item_code", deletingItem.item_code).eq("tenant_id", currentTenantId);
      if (error) throw error;
      toast({ title: "Item Deleted", description: "The item has been removed from inventory." });
      setDeletingItem(null);
      fetchItems(currentTenantId);
    } catch (error: any) {
      toast({ title: "Delete Failed", description: error.message, variant: "destructive" });
    }
  };

  const handlePrintLabel = (item: Item) => {
    if (Number(item.quantity) <= 0 && (item as any).item_type !== 'SERVICE') {
        toast({ title: "No Stock", description: "Cannot print labels for 0 quantity.", variant: "destructive" });
        return;
    }
    setPrintingItem(item);
    setTimeout(() => { window.print(); }, 100);
  };

  const getItemTypeBadge = (type: string) => {
    switch(type) {
      case "RAW_MATERIAL": return <span className="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border border-emerald-200 whitespace-nowrap">Raw Spice</span>;
      case "SERVICE": return <span className="bg-purple-100 text-purple-700 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border border-purple-200 whitespace-nowrap">Service</span>;
      default: return <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border border-blue-200 whitespace-nowrap">Ready Blend</span>;
    }
  };

  // --- STRICT SEQUENCE TEMPLATE MANAGEMENT ---
  const openTemplateEditor = (template: MasalaTemplate | 'new') => {
    // 1. Build the base array of all strict ingredients (qty = 0)
    const baseIngredients: TempIngredient[] = sortedRawMaterials.map(rm => ({
        item_id: rm.id,
        item_name: getSafeItemName(rm),
        qty: 0,
        unit: (rm as any).base_unit === 'kg' ? 'g' : ((rm as any).base_unit || 'g')
    }));

    if (template === 'new') {
      setEditingTemplate({ id: 'new', template_name: '', template_ingredients: [] });
      setTempIngredients(baseIngredients);
    } else {
      setEditingTemplate(template);
      
      // 2. Map existing saved quantities over the strict base ingredients
      const existingMap = new Map<number, { qty: number, unit: string }>();
      for (const ing of template.template_ingredients) {
        existingMap.set(ing.item_id, { qty: Number(ing.base_qty), unit: ing.unit });
      }

      const mergedIngredients = baseIngredients.map(base => ({
          ...base,
          qty: existingMap.has(base.item_id) ? existingMap.get(base.item_id)!.qty : 0,
          unit: existingMap.has(base.item_id) ? existingMap.get(base.item_id)!.unit : base.unit
      }));
      
      setTempIngredients(mergedIngredients);
    }
  };

  const updateCustomIngredient = (itemId: number, quantity: number) => {
    setTempIngredients(prev => prev.map(ing => ing.item_id === itemId ? { ...ing, qty: quantity } : ing));
  };

  const saveTemplate = async () => {
    if (!editingTemplate || !currentTenantId) return;
    if (!editingTemplate.template_name.trim()) return toast({ title: "Name Required", variant: "destructive" });
    
    setIsSubmittingTemplate(true);
    try {
      let targetTemplateId = editingTemplate.id;

      if (targetTemplateId === 'new') {
        const { data, error } = await (supabase as any).from("masala_templates").insert({
          tenant_id: currentTenantId,
          template_name: editingTemplate.template_name
        }).select().single();
        if (error) throw error;
        targetTemplateId = data.id;
      } else {
        const { error } = await (supabase as any).from("masala_templates").update({
          template_name: editingTemplate.template_name
        }).eq("id", targetTemplateId);
        if (error) throw error;
      }

      const { data: existingRows } = await (supabase as any)
        .from("template_ingredients")
        .select("id, item_id")
        .eq("template_id", targetTemplateId);

      const toInsert: any[] = [];
      const toUpdate: any[] = [];
      const idsToDelete: string[] = [];

      const existingMap = new Map<number, string>();
      
      if (existingRows) {
        for (const row of existingRows) {
          if (!existingMap.has(row.item_id)) {
            existingMap.set(row.item_id, row.id);
          } else {
            idsToDelete.push(row.id); 
          }
        }
      }

      for (const ing of tempIngredients) {
        // We save ALL items, even if qty is 0, as per strict physical bill book requirements.
        if (existingMap.has(ing.item_id)) {
          toUpdate.push({
            id: existingMap.get(ing.item_id), 
            tenant_id: currentTenantId,
            template_id: targetTemplateId,
            item_id: ing.item_id,
            base_qty: ing.qty,
            unit: ing.unit
          });
          existingMap.delete(ing.item_id); 
        } else {
          toInsert.push({
            tenant_id: currentTenantId,
            template_id: targetTemplateId,
            item_id: ing.item_id,
            base_qty: ing.qty,
            unit: ing.unit
          });
        }
      }

      for (const removedId of existingMap.values()) {
        idsToDelete.push(removedId);
      }

      if (idsToDelete.length > 0) {
        await (supabase as any).from("template_ingredients").delete().in("id", idsToDelete);
      }
      if (toUpdate.length > 0) {
        const { error: upError } = await (supabase as any).from("template_ingredients").upsert(toUpdate);
        if (upError) throw upError;
      }
      if (toInsert.length > 0) {
        const { error: inError } = await (supabase as any).from("template_ingredients").insert(toInsert);
        if (inError) throw inError;
      }

      toast({ title: "Recipe Saved Successfully!" });
      setEditingTemplate(null);
      fetchTemplates(currentTenantId);

    } catch (err: any) {
      console.error(err);
      toast({ title: "Failed to save recipe", description: err.message, variant: "destructive" });
    } finally {
      setIsSubmittingTemplate(false);
    }
  };

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8 animate-fade-in pb-24 md:pb-12 font-sans print:hidden">
          
          {/* --- SOFTWARE-STYLE HEADER --- */}
          <div className="flex items-center justify-between gap-4 pb-3 sm:pb-4 border-b border-zinc-100">
            <div className="flex flex-col justify-center min-w-0">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-zinc-900 leading-none truncate">
                Topology Management
              </h1>
              <p className="text-[11px] sm:text-xs font-semibold text-zinc-500 mt-1.5 hidden sm:block truncate">
                Manage your master catalog, raw materials, blends, and pricing.
              </p>
            </div>
            
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto">
              {activeTab !== "MASALA_TEMPLATES" && (
                <div className="relative w-full md:w-[320px]">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                  <Input
                    placeholder="Search catalog..."
                    className="pl-10 h-11 bg-white border-zinc-200 shadow-sm rounded-xl focus-visible:ring-zinc-900 transition-all font-medium text-sm w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              )}
              {activeTab === "MASALA_TEMPLATES" && (
                <Button onClick={() => openTemplateEditor('new')} className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl shadow-sm font-semibold h-11 px-5 w-full sm:w-auto transition-transform active:scale-95">
                  <Plus className="h-4 w-4 mr-2" /> New Recipe
                </Button>
              )}
            </div>
          </div>

          {/* --- CATEGORY TABS --- */}
          <div className="w-full overflow-x-auto scrollbar-none">
            <div className="flex gap-2.5 min-w-max pb-1">
              {CATEGORY_TABS.map(tab => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-[13px] font-bold transition-all whitespace-nowrap border ${
                      isActive 
                        ? "bg-zinc-900 text-white border-zinc-900 shadow-md" 
                        : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-900 hover:border-zinc-300 shadow-sm"
                    }`}
                  >
                    <tab.icon className={`h-4 w-4 ${isActive ? 'text-zinc-300' : 'text-zinc-400'}`} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* --- CONTENT AREA --- */}
          {isLoading ? (
            <div className="flex flex-col justify-center items-center h-64 gap-3 text-zinc-400">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-900" />
              <span className="text-sm font-semibold tracking-wide">Loading topology...</span>
            </div>
          ) : activeTab === "MASALA_TEMPLATES" ? (
             // MASALA RECIPES TAB
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
              {/* --- MOBILE VIEW (ITEMS) --- */}
              <div className="grid grid-cols-1 gap-4 md:hidden">
                {filteredItems.map((item) => {
                  const typeStr = String((item as any).item_type || "FINISHED_PRODUCT");
                  const isService = typeStr === "SERVICE";
                  const isRaw = typeStr === "RAW_MATERIAL";
                  
                  return (
                    <Card key={item.id} className="border-zinc-200 shadow-sm rounded-[24px] overflow-hidden bg-white">
                      <CardContent className="p-5 space-y-4">
                        <div className="flex gap-4">
                          <button 
                            onClick={() => item.image_url && setPreviewImage(item.image_url)}
                            className={`h-20 w-20 rounded-[18px] border border-zinc-200 overflow-hidden flex items-center justify-center shrink-0 bg-zinc-50 ${item.image_url ? 'cursor-pointer active:scale-95 transition-transform' : ''}`}
                          >
                            {item.image_url ? (
                              <img src={item.image_url} alt={item.item_name} className="h-full w-full object-cover" />
                            ) : (
                              <ImageIcon className="h-6 w-6 text-zinc-300" />
                            )}
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
                                <span className={`font-bold ${Number(item.quantity) < 5 ? 'text-rose-600' : 'text-zinc-900'}`}>
                                  {item.quantity} {(item as any).base_unit || 'units'}
                                </span>
                            </div>
                          )}
                        </div>

                        <div className="flex justify-between items-center pt-2">
                            <div className="flex items-center">
                              {!isService && Number(item.quantity) < 5 && (
                                <span className="text-[10px] font-bold text-rose-600 flex items-center gap-1.5 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-lg uppercase tracking-wider">
                                    <AlertTriangle className="h-3 w-3" /> Low Stock
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {!isService && (
                                <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-zinc-200 text-zinc-600 shadow-sm" onClick={() => handlePrintLabel(item)}>
                                  <Printer className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-zinc-200 text-zinc-600 shadow-sm" onClick={() => setEditingItem(item)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="outline" size="icon" className="h-11 w-11 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50 shadow-sm" onClick={() => setDeletingItem(item)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* --- DESKTOP VIEW (ITEMS) --- */}
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
                            
                            return (
                              <TableRow key={item.id} className="border-b border-zinc-100 hover:bg-zinc-50/60 transition-colors">
                                <TableCell className="p-4 text-center">
                                   <button 
                                    onClick={() => item.image_url && setPreviewImage(item.image_url)}
                                    className={`h-12 w-12 mx-auto rounded-xl border border-zinc-200 overflow-hidden flex items-center justify-center bg-white shadow-sm ${item.image_url ? 'cursor-pointer hover:border-zinc-400 transition-colors' : ''}`}
                                   >
                                     {item.image_url ? (
                                       <img src={item.image_url} alt={item.item_name} className="h-full w-full object-cover" />
                                     ) : (
                                       <ImageIcon className="h-4 w-4 text-zinc-300" />
                                     )}
                                   </button>
                                </TableCell>
                                <TableCell className="p-4 align-middle">
                                  <div className="flex flex-col items-start gap-2">
                                    {getItemTypeBadge(typeStr)}
                                    <span className="font-mono text-[11px] font-semibold text-zinc-400 tracking-wide">{item.item_code}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="p-4 align-middle">
                                   <span className="font-bold text-[15px] text-zinc-900">{item.item_name}</span>
                                </TableCell>
                                <TableCell className="p-4 align-middle">
                                  {isService ? (
                                    <span className="text-xs text-zinc-400 font-semibold">—</span>
                                  ) : (
                                    <span className="inline-flex text-xs font-semibold text-zinc-700 bg-zinc-100 border border-zinc-200 px-3 py-1 rounded-lg">
                                        {item.size || 'N/A'}
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className="p-4 align-middle text-center">
                                   <Switch checked={item.show_on_web ?? true} onCheckedChange={() => toggleWebVisibility(item, item.show_on_web ?? true)} className="scale-90 data-[state=checked]:bg-zinc-900" />
                                </TableCell>
                                <TableCell className="p-4 align-middle text-right">
                                  <div className="flex flex-col items-end">
                                    <span className="font-bold text-[15px] text-zinc-900">₹{item.selling_price}</span>
                                    <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mt-0.5">/ {(item as any).base_unit || 'unit'}</span>
                                  </div>
                                </TableCell>
                                <TableCell className="p-4 align-middle text-center">
                                  {isService ? (
                                    <span className="text-xs text-zinc-400 font-semibold">—</span>
                                  ) : (
                                    <div className="flex flex-col items-center">
                                        <span className={`font-bold text-[15px] ${Number(item.quantity) < 5 ? 'text-rose-600' : 'text-zinc-900'}`}>
                                            {item.quantity}
                                        </span>
                                        {Number(item.quantity) < 5 && (
                                            <span className="text-[9px] text-rose-500 font-bold uppercase tracking-widest mt-0.5">Low</span>
                                        )}
                                    </div>
                                  )}
                                </TableCell>
                                <TableCell className="p-4 align-middle text-right pr-6">
                                  <div className="flex justify-end gap-2.5">
                                    {!isService && (
                                      <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg text-zinc-500 border-zinc-200 shadow-sm hover:bg-white hover:text-zinc-900 hover:border-zinc-300" onClick={() => handlePrintLabel(item)}>
                                        <Printer className="h-4 w-4" />
                                      </Button>
                                    )}
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg text-zinc-500 border-zinc-200 shadow-sm hover:bg-white hover:text-zinc-900 hover:border-zinc-300" onClick={() => setEditingItem(item)}>
                                      <Pencil className="h-4 w-4" />
                                    </Button>
                                    <Button variant="outline" size="icon" className="h-9 w-9 rounded-lg text-zinc-400 border-transparent hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 shadow-none transition-colors" onClick={() => setDeletingItem(item)}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
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

      {/* EDIT TEMPLATE MODAL (STRICT SEQUENCE iPAD GRID) */}
      <Dialog open={!!editingTemplate} onOpenChange={(open) => !open && setEditingTemplate(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-4xl max-h-[90dvh] overflow-hidden flex flex-col rounded-[24px] p-0 border-zinc-200 shadow-2xl bg-zinc-50">
           <div className="px-6 py-5 border-b border-zinc-200 bg-white shrink-0 z-10 flex justify-between items-center">
              <div>
                <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900">
                  {editingTemplate?.id === 'new' ? 'Create New Recipe' : 'Edit Recipe'}
                </DialogTitle>
                <p className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mt-1">Strict Sequence Configuration</p>
              </div>
           </div>
           
           <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="space-y-1.5 bg-white p-5 rounded-2xl border border-zinc-200 shadow-sm">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Recipe Name</Label>
                <Input 
                  value={editingTemplate?.template_name || ''} 
                  onChange={(e) => setEditingTemplate(prev => prev ? { ...prev, template_name: e.target.value } : null)}
                  className="h-12 rounded-xl border-zinc-200 shadow-inner font-bold focus-visible:ring-zinc-900 bg-zinc-50"
                  placeholder="e.g. Special Malvani Mix"
                />
              </div>

              <div className="space-y-3">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider pl-1">Strict Bill Sequence Quantities (Per KG)</Label>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                   {tempIngredients.length === 0 ? (
                      <p className="text-xs text-center text-zinc-400 py-8 font-semibold col-span-full">No spices available in DB.</p>
                   ) : (
                      tempIngredients.map((ing) => (
                        <div key={ing.item_id} className="flex items-center justify-between rounded-2xl border border-zinc-200 bg-white p-2.5 shadow-sm hover:border-zinc-300 transition-colors">
                          <div className="min-w-0 flex-1 pl-2">
                            <p className="truncate text-sm font-bold text-zinc-900">{ing.item_name}</p>
                          </div>
                          <div className="flex items-center gap-1.5 bg-zinc-50 rounded-xl p-1 border border-zinc-100">
                            <Input 
                              type="number" 
                              step="0.001" 
                              inputMode="decimal"
                              value={ing.qty} 
                              onChange={(e) => updateCustomIngredient(ing.item_id, Number(e.target.value))} 
                              className="h-10 w-[72px] rounded-lg border-zinc-200 text-center font-bold text-[15px] shadow-inner focus-visible:ring-1 focus-visible:ring-emerald-500 bg-white" 
                            />
                            <span className="text-[11px] font-bold text-zinc-500 w-5">{ing.unit}</span>
                          </div>
                        </div>
                      ))
                   )}
                </div>
              </div>
           </div>
           
           <DialogFooter className="border-t border-zinc-200 bg-white p-5 shrink-0 gap-3 sm:gap-0">
              <Button variant="outline" onClick={() => setEditingTemplate(null)} className="h-12 rounded-xl font-bold border-zinc-200 bg-white w-full sm:w-auto text-zinc-700">Cancel</Button>
              <Button onClick={saveTemplate} disabled={isSubmittingTemplate} className="h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 font-bold text-white shadow-sm w-full sm:w-auto active:scale-95 transition-transform">
                {isSubmittingTemplate ? 'Saving Configuration...' : 'Save Strict Recipe'}
              </Button>
           </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* IMAGE PREVIEW MODAL */}
      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md p-2 bg-transparent border-0 shadow-none">
           {previewImage && (
              <div className="relative rounded-[24px] overflow-hidden bg-zinc-900/50 backdrop-blur-md shadow-2xl border border-white/10">
                 <img src={previewImage} alt="Product preview" className="w-full h-auto object-contain max-h-[80vh] rounded-[24px]" />
              </div>
           )}
        </DialogContent>
      </Dialog>

      {/* EDIT ITEM MODAL */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md max-h-[90dvh] overflow-y-auto rounded-[24px] p-0 border-zinc-200 shadow-2xl bg-zinc-50">
          <div className="px-6 py-5 border-b border-zinc-200 bg-white sticky top-0 z-10">
            <DialogTitle className="text-lg font-bold tracking-tight text-zinc-900">Edit {editingItem?.item_name}</DialogTitle>
            <p className="text-xs font-semibold text-zinc-500 mt-1">Refine properties and stock details for {editingItem?.item_code}</p>
          </div>
          
          <form onSubmit={handleSubmit(handleUpdate)} className="space-y-6 p-6 pt-4">
            
            {/* IMAGE EDIT SECTION */}
            {String((editingItem as any)?.item_type) !== "SERVICE" && (
              <div className="flex items-center gap-4 p-4 border border-zinc-200 rounded-2xl bg-white shadow-sm">
                 <div className="h-16 w-16 rounded-xl border border-zinc-200 overflow-hidden bg-zinc-50 flex items-center justify-center shrink-0 shadow-inner">
                    {editImagePreview ? (
                       <img src={editImagePreview} alt="Preview" className="h-full w-full object-cover" />
                    ) : (
                       <ImageIcon className="h-6 w-6 text-zinc-300" />
                    )}
                 </div>
                 <div className="flex flex-col gap-2 flex-1">
                    <Label htmlFor="edit-image" className="cursor-pointer bg-white border border-zinc-200 text-zinc-700 hover:text-zinc-900 hover:border-zinc-300 text-xs font-bold px-3 py-2.5 rounded-xl text-center shadow-sm transition-colors flex items-center justify-center gap-2">
                       <UploadCloud className="h-4 w-4" />
                       {editImagePreview ? "Change Photo" : "Upload Photo"}
                    </Label>
                    <Input ref={fileInputRef} id="edit-image" type="file" accept="image/*" className="hidden" onChange={handleEditImageChange} />
                    {editImagePreview && (
                       <button type="button" onClick={handleRemoveEditPhoto} className="text-[11px] font-bold text-rose-500 hover:text-rose-700 text-center uppercase tracking-wider mt-1">
                          Remove Photo
                       </button>
                    )}
                 </div>
              </div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="item_name" className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Item Name</Label>
                <Input id="item_name" className="h-12 rounded-xl border-zinc-200 shadow-inner bg-white focus-visible:ring-zinc-900 font-bold" {...register("item_name")} />
                {errors.item_name && <p className="text-xs font-semibold text-rose-500">{errors.item_name.message}</p>}
              </div>

              {String((editingItem as any)?.item_type) !== "SERVICE" && (
                <div className="space-y-1.5">
                  <Label htmlFor="size" className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Variant / Weight</Label>
                  <Input 
                    id="size" 
                    placeholder="e.g. 1 kg, 500 g, Large" 
                    className="h-12 rounded-xl border-zinc-200 bg-white font-bold text-sm shadow-inner focus-visible:ring-zinc-900" 
                    {...register("size")} 
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                {String((editingItem as any)?.item_type) !== "SERVICE" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="purchase_price" className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Buy Price (₹)</Label>
                    <Input id="purchase_price" type="number" inputMode="decimal" className="h-12 rounded-xl border-zinc-200 shadow-inner bg-white focus-visible:ring-zinc-900 font-bold" {...register("purchase_price")} />
                  </div>
                )}
                <div className={`space-y-1.5 ${String((editingItem as any)?.item_type) === "SERVICE" ? "col-span-2" : ""}`}>
                  <Label htmlFor="selling_price" className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Sell Rate (₹)</Label>
                  <div className="relative">
                    <Input id="selling_price" type="number" inputMode="decimal" className="h-12 rounded-xl border-emerald-200 bg-emerald-50 text-emerald-800 shadow-inner focus-visible:ring-emerald-500 font-bold" {...register("selling_price")} />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-600/50">per {(editingItem as any)?.base_unit || 'unit'}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between border border-zinc-200 p-4 rounded-2xl bg-white shadow-sm">
                <div className="space-y-0.5 flex flex-col">
                    <Label className="text-sm font-bold text-zinc-900 flex items-center gap-2"><Globe className="h-4 w-4 text-zinc-500"/> Website Catalog</Label>
                    <span className="text-[11px] font-semibold text-zinc-500">Show on public storefront</span>
                </div>
                <Switch 
                  checked={watchedShowOnWeb}
                  onCheckedChange={(val) => setValue("show_on_web", val)}
                  className="data-[state=checked]:bg-zinc-900"
                />
              </div>

              {String((editingItem as any)?.item_type) !== "SERVICE" && (
                <>
                  <div className="flex items-center justify-between border border-zinc-200 p-4 rounded-2xl bg-white shadow-sm">
                    <div className="space-y-0.5 flex flex-col">
                        <Label className="text-sm font-bold text-zinc-900 flex items-center gap-2"><Package className="h-4 w-4 text-zinc-500"/> Bulk Pack Setup</Label>
                        <span className="text-[11px] font-semibold text-zinc-500">Track inventory in master boxes</span>
                    </div>
                    <Switch 
                      checked={watchedIsPack}
                      onCheckedChange={(val) => {
                        setValue("is_pack", val);
                        if(!val) {
                            setValue("pieces_per_box", 1);
                            setValue("price_per_piece", undefined);
                        }
                      }}
                      className="data-[state=checked]:bg-zinc-900"
                    />
                  </div>

                  {watchedIsPack ? (
                      <div className="space-y-4 border border-zinc-200 p-4 bg-white rounded-2xl shadow-sm">
                          <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1.5">
                                <Label htmlFor="pieces_per_box" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Units per Pack</Label>
                                <Input id="pieces_per_box" type="number" inputMode="numeric" className="h-12 rounded-xl border-zinc-200 shadow-inner focus-visible:ring-zinc-900 font-bold" {...register("pieces_per_box")} />
                              </div>
                              <div className="space-y-1.5">
                                <Label htmlFor="number_of_boxes" className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Total Packs</Label>
                                <Input id="number_of_boxes" type="number" inputMode="numeric" className="h-12 rounded-xl border-zinc-200 shadow-inner focus-visible:ring-zinc-900 font-bold" {...register("number_of_boxes")} />
                              </div>
                          </div>
                          <div className="text-xs font-bold text-zinc-700 bg-zinc-50 p-3 rounded-xl border border-zinc-200 text-center shadow-inner">
                             Total Inventory: {watchedBoxes || 0} packs × {watchedPieces || 1} units = <span className="text-zinc-900">{watchedIsPack && watchedBoxes ? (watchedBoxes * (watchedPieces || 1)) : 0} units</span>
                          </div>
                      </div>
                  ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="quantity" className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Total Stock Quantity ({(editingItem as any)?.base_unit || 'units'})</Label>
                        <Input id="quantity" type="number" inputMode="decimal" className="h-12 rounded-xl border-zinc-200 shadow-inner focus-visible:ring-zinc-900 font-bold text-xl text-zinc-900 bg-white" {...register("quantity")} />
                      </div>
                  )}
                  {watchedIsPack && <input type="hidden" {...register("quantity")} />}
                </>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-6 mt-4 border-t border-zinc-200">
              <Button type="button" variant="outline" className="h-12 rounded-xl font-bold border-zinc-200 text-zinc-700 w-full sm:w-auto bg-white shadow-sm" onClick={() => setEditingItem(null)}>Cancel</Button>
              <Button type="submit" disabled={isSubmitting} className="h-12 rounded-xl font-bold bg-zinc-900 text-white w-full shadow-md hover:bg-zinc-800 active:scale-95 transition-transform">
                  {isSubmitting ? "Saving Data..." : "Confirm Changes"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE CONFIRMATION */}
      <AlertDialog open={!!deletingItem} onOpenChange={(open) => !open && setDeletingItem(null)}>
        <AlertDialogContent className="rounded-[24px] border-zinc-200 shadow-2xl p-0 overflow-hidden sm:max-w-sm">
          <div className="p-6 bg-white">
            <div className="w-12 h-12 rounded-full bg-rose-50 border border-rose-100 flex items-center justify-center mb-4">
              <Trash2 className="h-5 w-5 text-rose-500" />
            </div>
            <AlertDialogTitle className="text-lg font-bold text-zinc-900 mb-1">Delete Item</AlertDialogTitle>
            <AlertDialogDescription className="font-semibold text-zinc-500 text-sm mt-2">
              This will permanently remove <span className="font-bold text-zinc-800">{deletingItem?.item_name}</span> from the topology. This action cannot be undone.
            </AlertDialogDescription>
          </div>
          <div className="p-4 bg-zinc-50 border-t border-zinc-100 flex flex-col sm:flex-row gap-3">
            <AlertDialogCancel className="h-12 rounded-xl font-bold border-zinc-200 text-zinc-700 w-full mt-0 bg-white">Keep Item</AlertDialogCancel>
            <Button onClick={handleDelete} className="h-12 rounded-xl font-bold bg-rose-600 hover:bg-rose-700 text-white w-full shadow-sm">
              Yes, Delete
            </Button>
          </div>
        </AlertDialogContent>
      </AlertDialog>

      {/* --- DYNAMIC PRINT AREA --- */}
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