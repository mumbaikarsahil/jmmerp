import React, { useState, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Printer, Image as ImageIcon, Type, ListOrdered, UploadCloud, 
  Trash2, Settings2, Save, CheckCircle2, LayoutTemplate
} from "lucide-react";

export default function ReceiptSettings() {
  const { toast } = useToast();
  
  // Settings State
  const [activeTab, setActiveTab] = useState("layout");
  const [isSaving, setIsSaving] = useState(false);

  // Configuration State
  const [paperSize, setPaperSize] = useState<"A5" | "80MM" | "58MM">("A5");
  const [textSize, setTextSize] = useState<"sm" | "base" | "lg">("sm");
  const [enforceSequence, setEnforceSequence] = useState(true);
  
  // Branding & Content State
  const [headerImagePreview, setHeaderImagePreview] = useState<string | null>("/jmm-bill-header.png");
  const [footerText, setFooterText] = useState("Thank you for shopping! Visit again.");
  const [taxInfo, setTaxInfo] = useState("GSTIN: 27AAKPG4562D1ZU • FSSAI NO.: 11518004000348");

  const headerInputRef = useRef<HTMLInputElement>(null);

  const TABS = [
    { id: "layout", label: "Paper & Layout", icon: LayoutTemplate },
    { id: "media", label: "Branding", icon: ImageIcon },
    { id: "content", label: "Footer & Text", icon: Type },
    { id: "sequence", label: "Print Order", icon: ListOrdered }
  ];

  const handleHeaderUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setHeaderImagePreview(URL.createObjectURL(file));
    }
  };

  const handleSaveSettings = () => {
    setIsSaving(true);
    // Simulate API call to save settings to a `tenant_settings` table
    setTimeout(() => {
      setIsSaving(false);
      toast({ title: "Settings Saved", description: "Your receipt configuration has been updated across all devices." });
    }, 800);
  };

  return (
    <AppLayout>
      <div className="w-full bg-[#fcfcfd] min-h-screen">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 animate-fade-in pb-24 md:pb-12 font-sans">
          
          {/* --- HEADER --- */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pb-4 border-b border-zinc-100">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 flex items-center gap-2">
                <Settings2 className="h-6 w-6 text-emerald-600" /> Print Engine Configuration
              </h1>
              <p className="text-xs font-semibold text-zinc-500 mt-1">
                Customize thermal print layouts, branding, and strict billing sequences.
              </p>
            </div>
            <Button disabled={isSaving} onClick={handleSaveSettings} className="h-12 px-6 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-sm active:scale-95 transition-all w-full md:w-auto">
              {isSaving ? "Saving Configuration..." : <><Save className="h-4 w-4 mr-2" /> Save Settings</>}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* --- LEFT: CONTROLS PANEL --- */}
            <div className="lg:col-span-5 xl:col-span-4 space-y-6">
              
              {/* Tab Navigation */}
              <div className="flex overflow-x-auto scrollbar-none gap-2 p-1 bg-zinc-100 border border-zinc-200/80 rounded-2xl shadow-inner">
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex-1 flex flex-col items-center justify-center p-3 rounded-xl transition-all ${activeTab === tab.id ? 'bg-white text-zinc-900 shadow-sm border border-zinc-200' : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-200/50'}`}
                  >
                    <tab.icon className="h-5 w-5 mb-1" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">{tab.label}</span>
                  </button>
                ))}
              </div>

              {/* Tab Content Areas */}
              <Card className="rounded-3xl border-zinc-200 shadow-sm bg-white overflow-hidden">
                <CardContent className="p-6">
                  
                  {/* LAYOUT SETTINGS */}
                  {activeTab === "layout" && (
                    <div className="space-y-6 animate-in fade-in">
                      <div className="space-y-3">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Hardware Paper Size</Label>
                        <div className="grid grid-cols-3 gap-2">
                          {[
                            { id: "A5", label: "A5 Portrait", desc: "Standard Book" },
                            { id: "80MM", label: "80mm Thermal", desc: "Wide Roll" },
                            { id: "58MM", label: "58mm Thermal", desc: "Mini Roll" }
                          ].map(size => (
                            <button
                              key={size.id}
                              onClick={() => setPaperSize(size.id as any)}
                              className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${paperSize === size.id ? 'border-zinc-900 bg-zinc-900 text-white shadow-md' : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-zinc-300'}`}
                            >
                              <span className="font-bold text-sm">{size.label}</span>
                              <span className={`text-[10px] mt-1 ${paperSize === size.id ? 'text-zinc-400' : 'text-zinc-400'}`}>{size.desc}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-3 pt-6 border-t border-zinc-100">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Typography Scale</Label>
                        <div className="flex gap-2 p-1 bg-zinc-100 rounded-xl">
                           <button onClick={() => setTextSize("sm")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${textSize === "sm" ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Compact</button>
                           <button onClick={() => setTextSize("base")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${textSize === "base" ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Normal</button>
                           <button onClick={() => setTextSize("lg")} className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${textSize === "lg" ? 'bg-white shadow-sm' : 'text-zinc-500'}`}>Large (Readable)</button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* MEDIA / BRANDING SETTINGS */}
                  {activeTab === "media" && (
                    <div className="space-y-6 animate-in fade-in">
                      <div className="space-y-3">
                        <div className="flex justify-between items-end">
                          <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Receipt Banner (Header)</Label>
                          {headerImagePreview && <button onClick={() => setHeaderImagePreview(null)} className="text-[10px] font-bold text-rose-500 uppercase flex items-center"><Trash2 className="h-3 w-3 mr-1"/> Remove</button>}
                        </div>
                        
                        <div className="border-2 border-dashed border-zinc-200 rounded-2xl bg-zinc-50 p-2 text-center transition-colors hover:bg-zinc-100">
                          {headerImagePreview ? (
                            <img src={headerImagePreview} alt="Header Preview" className="w-full h-auto max-h-[120px] object-contain rounded-xl" />
                          ) : (
                            <div className="py-8 flex flex-col items-center justify-center">
                              <ImageIcon className="h-8 w-8 text-zinc-300 mb-2" />
                              <span className="text-sm font-semibold text-zinc-500">No banner uploaded</span>
                            </div>
                          )}
                        </div>
                        
                        <Label htmlFor="header-upload" className="flex items-center justify-center gap-2 h-12 w-full bg-white border border-zinc-200 rounded-xl cursor-pointer font-bold text-sm text-zinc-700 shadow-sm hover:bg-zinc-50 transition-colors">
                           <UploadCloud className="h-4 w-4" /> Upload New Banner Image
                        </Label>
                        <Input id="header-upload" type="file" accept="image/*" className="hidden" ref={headerInputRef} onChange={handleHeaderUpload} />
                        <p className="text-[11px] font-semibold text-zinc-400 text-center">Recommended: Black & White JPG/PNG, 800x200px</p>
                      </div>
                    </div>
                  )}

                  {/* CONTENT SETTINGS */}
                  {activeTab === "content" && (
                    <div className="space-y-5 animate-in fade-in">
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Legal / Tax Information</Label>
                        <Input value={taxInfo} onChange={e => setTaxInfo(e.target.value)} className="h-12 rounded-xl border-zinc-200 font-semibold bg-zinc-50 shadow-inner" placeholder="GSTIN / FSSAI Details" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Footer Message</Label>
                        <textarea 
                          value={footerText} 
                          onChange={e => setFooterText(e.target.value)}
                          className="w-full min-h-[100px] p-3 rounded-xl border border-zinc-200 font-semibold bg-zinc-50 shadow-inner text-sm resize-none focus:outline-none focus:ring-2 focus:ring-zinc-900"
                          placeholder="Thank you message..." 
                        />
                      </div>
                    </div>
                  )}

                  {/* SEQUENCE SETTINGS */}
                  {activeTab === "sequence" && (
                    <div className="space-y-6 animate-in fade-in">
                      <div className="flex items-center justify-between p-4 bg-zinc-50 border border-zinc-200 rounded-2xl shadow-sm">
                        <div className="space-y-0.5">
                          <Label className="text-sm font-bold text-zinc-900">Enforce Strict Sequence</Label>
                          <p className="text-[11px] font-semibold text-zinc-500 leading-tight">Always print items in traditional ledger order, even if quantity is 0.</p>
                        </div>
                        <Switch checked={enforceSequence} onCheckedChange={setEnforceSequence} className="data-[state=checked]:bg-zinc-900" />
                      </div>

                      <div className="space-y-2">
                        <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">Active Sequence (Preview)</Label>
                        <div className="border border-zinc-200 rounded-xl bg-white max-h-[300px] overflow-y-auto p-2 shadow-inner space-y-1">
                          {/* Mocking the sequence for the UI */}
                          {["बेडगी", "लवंगी", "काश्मिरी", "मिरची", "धणे", "हळकुंड", "मिरी", "बडीशेप"].map((item, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-2.5 bg-zinc-50 rounded-lg border border-zinc-100">
                              <span className="w-6 h-6 rounded-md bg-white border border-zinc-200 flex items-center justify-center text-[10px] font-bold text-zinc-400">{idx + 1}</span>
                              <span className="font-bold text-sm text-zinc-800">{item}</span>
                            </div>
                          ))}
                          <div className="p-3 text-center text-[10px] font-bold text-zinc-400 uppercase tracking-widest">+ 28 More Items Configured</div>
                        </div>
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>
            </div>

            {/* --- RIGHT: LIVE PREVIEW PANEL --- */}
            <div className="lg:col-span-7 xl:col-span-8">
              <div className="sticky top-6 flex flex-col items-center">
                <div className="mb-4 flex items-center gap-2">
                  <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Live Output Preview</span>
                </div>

                {/* THE RECEIPT CANVAS */}
                <div className="bg-zinc-200 p-6 sm:p-10 rounded-[32px] w-full flex justify-center shadow-inner overflow-x-auto scrollbar-none border border-zinc-300">
                  <div 
                    className="bg-white shadow-xl transition-all duration-300 relative"
                    style={{
                      width: paperSize === "A5" ? "148mm" : paperSize === "80MM" ? "80mm" : "58mm",
                      minHeight: paperSize === "A5" ? "210mm" : "auto",
                      padding: paperSize === "A5" ? "15px" : "10px"
                    }}
                  >
                    {/* Render specific CSS based on state to prove it's live */}
                    <style>{`
                      .live-table { width: 100%; border-collapse: collapse; margin-top: 5px; border: ${paperSize === 'A5' ? '2px' : '1px'} solid black; font-size: ${textSize === 'sm' ? '12px' : textSize === 'lg' ? '16px' : '14px'}; }
                      .live-table th, .live-table td { border: 1px solid black; padding: ${paperSize === 'A5' ? '5px 8px' : '3px 4px'}; color: black !important; }
                      .live-table th { font-weight: bold; text-align: center; border-bottom: ${paperSize === 'A5' ? '2px' : '1px'} solid black; }
                      .col-item { font-weight: bold; width: 45%; }
                      .col-wgt { text-align: center; font-weight: bold; width: 25%; border-left: ${paperSize === 'A5' ? '2px' : '1px'} solid black; border-right: ${paperSize === 'A5' ? '2px' : '1px'} solid black; }
                      .col-rs { text-align: right; font-weight: bold; width: 20%; }
                      .col-paise { text-align: center; font-weight: bold; width: 10%; border-left: ${paperSize === 'A5' ? '2px' : '1px'} solid black; }
                    `}</style>

                    {/* Preview Header Image */}
                    {headerImagePreview && (
                      <img src={headerImagePreview} alt="Header" className={`w-full object-contain mb-3 ${paperSize === 'A5' ? 'border-b-[3px] border-[#880000]' : 'border-b-2 border-black'}`} />
                    )}

                    {/* Preview Customer Info */}
                    <div className="flex justify-between font-bold mb-2 px-1" style={{ fontSize: textSize === 'sm' ? '12px' : textSize === 'lg' ? '16px' : '14px' }}>
                      <div>नाव: Demo Customer</div>
                      <div>दि.: 22/09/2026</div>
                    </div>

                    {/* Preview Table */}
                    <table className="live-table">
                      <thead>
                        <tr>
                          <th>तपशील</th>
                          <th className="col-wgt">वजन</th>
                          <th className="col-rs">रुपये</th>
                          <th className="col-paise">पैसे</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { name: "बेडगी मिरची", wgt: "400 g", rs: "336" },
                          { name: "काश्मिरी मिरची", wgt: "200 g", rs: "192" },
                          { name: "धणे", wgt: "200 g", rs: "96" },
                          { name: "मसाला वेलची", wgt: "10 g", rs: "48" },
                        ].map((item, i) => (
                          <tr key={i}>
                            <td className="col-item">{item.name}</td>
                            <td className="col-wgt">{item.wgt}</td>
                            <td className="col-rs">{item.rs}</td>
                            <td className="col-paise">00</td>
                          </tr>
                        ))}
                        {enforceSequence && (
                           <tr>
                            <td className="col-item">दगडफुल</td>
                            <td className="col-wgt">0</td>
                            <td className="col-rs">0</td>
                            <td className="col-paise">00</td>
                          </tr>
                        )}
                        <tr className={`border-t-[${paperSize === 'A5' ? '2px' : '1px'}] border-black font-black bg-zinc-100`}>
                          <td className="col-item">एकूण वजन</td>
                          <td className="col-wgt text-center">0.810 kg</td>
                          <td className="col-rs bg-zinc-100"></td>
                          <td className="col-paise bg-zinc-100"></td>
                        </tr>
                        <tr className={`border-t-[${paperSize === 'A5' ? '2px' : '1px'}] border-black font-black bg-zinc-100`}>
                          <td className="col-item" colSpan={2}>एकूण रुपये</td>
                          <td className="col-rs text-lg">672</td>
                          <td className="col-paise">00</td>
                        </tr>
                      </tbody>
                    </table>

                    {/* Preview Footer */}
                    <div className="mt-4 text-center space-y-1" style={{ fontSize: textSize === 'sm' ? '10px' : textSize === 'lg' ? '14px' : '12px' }}>
                      {taxInfo && <p className="font-bold">{taxInfo}</p>}
                      {footerText && <p className="font-semibold italic">{footerText}</p>}
                    </div>

                  </div>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </AppLayout>
  );
}