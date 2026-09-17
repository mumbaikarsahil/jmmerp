import React, { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { 
  Factory, Scale, ArrowRight, CheckCircle2, 
  AlertTriangle, FlaskConical, Beaker, Save 
} from "lucide-react";

// --- TYPES ---
type Ingredient = {
  item_id: number;
  item_name: string;
  base_qty: number;
  unit: string;
};

type MasalaTemplate = {
  id: string;
  template_name: string;
  output_item_id: number;
  ingredients: Ingredient[];
  total_base_weight: number; // Sum of all base_qty in the recipe
};

export default function Production() {
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<MasalaTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<MasalaTemplate | null>(null);
  
  // Factory floor inputs
  const [batchMultiplier, setBatchMultiplier] = useState<number | "">(""); 
  const [actualOutput, setActualOutput] = useState<number | "">("");
  const [isLoading, setIsLoading] = useState(false);
  
  const { toast } = useToast();

  // --- FETCH DATA ---
  useEffect(() => {
    const initialize = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const { data: profileData } = await supabase.from("profiles").select("tenant_id").eq("id", session.user.id).single();
      const profile = profileData as { tenant_id: string | null } | null;
      
      if (profile?.tenant_id) {
        setTenantId(profile.tenant_id);
        fetchTemplates(profile.tenant_id);
      }
    };
    
    initialize();
  }, []);

  const fetchTemplates = async (currentTenantId: string) => {
    try {
      // Fetch templates and their linked ingredients + item names in one query
      const { data: templateData, error } = await (supabase as any)
        .from("masala_templates")
        .select(`
          id, 
          template_name,
          template_ingredients (
            item_id,
            base_qty,
            unit,
            items ( item_name, id )
          )
        `)
        .eq("tenant_id", currentTenantId);

      if (error) throw error;

      // Transform raw join data into a clean, typed array
      const formattedTemplates: MasalaTemplate[] = templateData.map((t: any) => {
        const ingredients = t.template_ingredients.map((ing: any) => ({
          item_id: ing.item_id,
          item_name: ing.items.item_name,
          base_qty: Number(ing.base_qty),
          unit: ing.unit || "kg"
        }));

        const totalWeight = ingredients.reduce((sum: number, ing: any) => sum + ing.base_qty, 0);

        return {
          id: t.id,
          template_name: t.template_name,
          output_item_id: 0, // In a full setup, link this to the finished Items table ID
          ingredients,
          total_base_weight: totalWeight
        };
      });

      setTemplates(formattedTemplates);
    } catch (error: any) {
      toast({ title: "Failed to load recipes", description: error.message, variant: "destructive" });
    }
  };

  // --- CALCULATIONS ---
  const totalInputWeight = selectedTemplate && typeof batchMultiplier === 'number' 
    ? selectedTemplate.total_base_weight * batchMultiplier 
    : 0;

  const weightLoss = typeof actualOutput === 'number' && actualOutput > 0
    ? totalInputWeight - actualOutput
    : 0;

  const lossPercentage = totalInputWeight > 0 
    ? ((weightLoss / totalInputWeight) * 100).toFixed(1) 
    : "0.0";

  // --- BATCH COMMIT LOGIC ---
  const handleCommitBatch = async () => {
    if (!tenantId || !selectedTemplate) return;
    if (typeof batchMultiplier !== 'number' || batchMultiplier <= 0) return toast({ variant: "destructive", title: "Invalid Input", description: "Please enter a valid batch multiplier." });
    if (typeof actualOutput !== 'number' || actualOutput <= 0) return toast({ variant: "destructive", title: "Invalid Output", description: "Please enter the final powder weight." });
    if (actualOutput > totalInputWeight) return toast({ variant: "destructive", title: "Warning", description: "Final output cannot be heavier than raw input." });

    setIsLoading(true);

    try {
      const batchNumber = `BATCH-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

      // 1. Log PRODUCTION_CONSUMPTION for all raw ingredients
      const consumptionTransactions = selectedTemplate.ingredients.map(ing => ({
        tenant_id: tenantId,
        item_id: ing.item_id,
        transaction_type: 'PRODUCTION_CONSUMPTION',
        quantity: ing.base_qty * batchMultiplier,
        unit: ing.unit,
        reference_type: 'PRODUCTION_BATCH',
        reference_id: batchNumber,
        notes: `Consumed for ${selectedTemplate.template_name}`
      }));

      // 2. Log PRODUCTION_OUTPUT for the finished product
      // Note: In production, ensure output_item_id correctly maps to your finished goods item ID
      const outputTransaction = {
        tenant_id: tenantId,
        item_id: selectedTemplate.output_item_id || 9999, // Fallback ID for demonstration
        transaction_type: 'PRODUCTION_OUTPUT',
        quantity: actualOutput,
        unit: 'kg',
        reference_type: 'PRODUCTION_BATCH',
        reference_id: batchNumber,
        notes: `Grinding loss: ${weightLoss.toFixed(2)}kg (${lossPercentage}%)`
      };

      // 3. Bulk insert into ledger
      const { error: txError } = await (supabase as any)
        .from("stock_transactions")
        .insert([...consumptionTransactions, outputTransaction]);

      if (txError) throw txError;

      // Reset form on success
      toast({ title: "Batch Logged Successfully", description: `${actualOutput}kg of ${selectedTemplate.template_name} added to inventory.` });
      setSelectedTemplate(null);
      setBatchMultiplier("");
      setActualOutput("");

    } catch (error: any) {
      toast({ title: "Batch Error", description: error.message, variant: "destructive" });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6 pb-12 font-sans px-4 sm:px-6">
        
        {/* --- HEADER --- */}
        <div className="pt-4">
          <h1 className="text-3xl font-black tracking-tight text-zinc-900 flex items-center">
            <Factory className="h-8 w-8 mr-3 text-zinc-700" /> Factory Floor
          </h1>
          <p className="text-zinc-500 font-medium mt-1">Select a recipe, weigh raw materials, and log output.</p>
        </div>

        {/* --- STEP 1: SELECT RECIPE --- */}
        {!selectedTemplate ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
            {templates.length === 0 ? (
              <div className="col-span-full p-8 text-center bg-zinc-50 rounded-2xl border-2 border-dashed border-zinc-200">
                <FlaskConical className="h-10 w-10 mx-auto text-zinc-300 mb-3" />
                <h3 className="font-bold text-zinc-700">No Recipes Found</h3>
                <p className="text-sm text-zinc-500">Create Masala Templates in the CRM to start production.</p>
              </div>
            ) : (
              templates.map((template) => (
                <button
                  key={template.id}
                  onClick={() => setSelectedTemplate(template)}
                  className="flex flex-col items-start p-6 bg-white border-2 border-zinc-200 hover:border-zinc-900 hover:shadow-md rounded-2xl transition-all text-left group"
                >
                  <div className="bg-zinc-100 p-3 rounded-xl group-hover:bg-zinc-900 transition-colors mb-4">
                    <Beaker className="h-6 w-6 text-zinc-600 group-hover:text-white" />
                  </div>
                  <h3 className="text-xl font-black text-zinc-900">{template.template_name}</h3>
                  <p className="text-sm font-semibold text-zinc-500 mt-1">
                    {template.ingredients.length} Ingredients • Base: {template.total_base_weight}kg
                  </p>
                </button>
              ))
            )}
          </div>
        ) : (
          
          /* --- STEP 2: BATCH PRODUCTION UI --- */
          <div className="space-y-6 mt-6 animate-in slide-in-from-bottom-4 duration-300">
            
            {/* Active Recipe Header */}
            <div className="flex items-center justify-between bg-zinc-900 p-4 rounded-2xl shadow-sm">
              <div className="flex items-center">
                <div className="bg-white/10 p-2 rounded-xl mr-3">
                  <FlaskConical className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{selectedTemplate.template_name}</h2>
                  <p className="text-zinc-400 text-xs font-semibold">Active Production Batch</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setSelectedTemplate(null)} className="text-white hover:bg-white/10">
                Change Recipe
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {/* RAW MATERIAL INPUT */}
              <Card className="border-2 border-amber-200 bg-amber-50/30 shadow-sm rounded-2xl overflow-hidden">
                <div className="bg-amber-100/50 p-4 border-b border-amber-200 flex items-center justify-between">
                  <CardTitle className="text-amber-900 flex items-center text-lg">
                    <Scale className="h-5 w-5 mr-2" /> 1. Raw Input
                  </CardTitle>
                </div>
                <CardContent className="p-5 space-y-5">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-amber-700 uppercase tracking-wider">Batch Multiplier</label>
                    <Input 
                      type="number" 
                      value={batchMultiplier}
                      onChange={(e) => setBatchMultiplier(e.target.value ? Number(e.target.value) : "")}
                      className="h-16 text-3xl font-black border-amber-300 shadow-inner bg-white text-amber-950" 
                      placeholder="e.g. 5" 
                    />
                    <p className="text-xs font-bold text-amber-600/80">How many times are you multiplying the base recipe?</p>
                  </div>

                  {typeof batchMultiplier === 'number' && batchMultiplier > 0 && (
                    <div className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm">
                      <h4 className="text-xs font-black text-amber-800 uppercase mb-3 border-b border-amber-100 pb-2">Materials to be Consumed:</h4>
                      <ul className="space-y-2 text-sm font-semibold text-zinc-700">
                        {selectedTemplate.ingredients.map((ing) => (
                          <li key={ing.item_id} className="flex justify-between">
                            <span>{ing.item_name}</span>
                            <span className="font-mono bg-amber-100 px-2 rounded">{ing.base_qty * batchMultiplier} {ing.unit}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 pt-3 border-t border-amber-200 flex justify-between items-center text-amber-900 font-black">
                        <span>Total Raw Input:</span>
                        <span className="text-xl">{totalInputWeight} kg</span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* FINAL POWDER OUTPUT */}
              <Card className={`border-2 shadow-sm rounded-2xl transition-colors duration-300 ${totalInputWeight > 0 ? 'border-emerald-200 bg-emerald-50/30' : 'border-zinc-200 bg-zinc-50/50 opacity-50 pointer-events-none'}`}>
                <div className={`${totalInputWeight > 0 ? 'bg-emerald-100/50 border-emerald-200' : 'bg-zinc-100 border-zinc-200'} p-4 border-b flex items-center justify-between`}>
                  <CardTitle className={`${totalInputWeight > 0 ? 'text-emerald-900' : 'text-zinc-500'} flex items-center text-lg`}>
                    <ArrowRight className="h-5 w-5 mr-2" /> 2. Final Output
                  </CardTitle>
                </div>
                <CardContent className="p-5 space-y-5">
                  <div className="space-y-2">
                    <label className={`text-xs font-black uppercase tracking-wider ${totalInputWeight > 0 ? 'text-emerald-700' : 'text-zinc-400'}`}>
                      Weighed Powder (kg)
                    </label>
                    <Input 
                      type="number" 
                      value={actualOutput}
                      onChange={(e) => setActualOutput(e.target.value ? Number(e.target.value) : "")}
                      className={`h-16 text-3xl font-black shadow-inner bg-white ${totalInputWeight > 0 ? 'border-emerald-300 text-emerald-950' : 'border-zinc-200 text-zinc-400'}`}
                      placeholder="0.00" 
                    />
                    <p className={`text-xs font-bold ${totalInputWeight > 0 ? 'text-emerald-600/80' : 'text-zinc-400'}`}>
                      Enter the final weight after grinding.
                    </p>
                  </div>

                  {typeof actualOutput === 'number' && actualOutput > 0 && (
                    <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-sm space-y-3">
                      <div className="flex justify-between items-center text-sm font-bold text-zinc-600">
                        <span>Raw Input:</span>
                        <span>{totalInputWeight} kg</span>
                      </div>
                      <div className="flex justify-between items-center text-sm font-bold text-emerald-600">
                        <span>Final Output:</span>
                        <span>{actualOutput} kg</span>
                      </div>
                      
                      <div className="border-t border-zinc-100 pt-3 flex justify-between items-center">
                        <span className="text-xs font-black text-rose-500 uppercase flex items-center">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Grinding Loss
                        </span>
                        <div className="text-right">
                          <span className="block font-black text-rose-600 text-lg">{weightLoss.toFixed(2)} kg</span>
                          <span className="block font-bold text-rose-400 text-xs">({lossPercentage}%)</span>
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* COMMIT BUTTON */}
            <Button 
              onClick={handleCommitBatch} 
              disabled={isLoading || typeof actualOutput !== 'number' || actualOutput <= 0 || actualOutput > totalInputWeight}
              className="w-full h-16 text-xl font-black bg-zinc-900 text-white rounded-2xl shadow-lg hover:bg-zinc-800 hover:scale-[0.99] transition-all"
            >
              {isLoading ? "Writing to Ledger..." : (
                <>
                  <Save className="h-6 w-6 mr-2" /> Log Production Batch
                </>
              )}
            </Button>

          </div>
        )}
      </div>
    </AppLayout>
  );
}