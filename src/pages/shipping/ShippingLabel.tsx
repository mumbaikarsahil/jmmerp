import React, { useState, useEffect, useRef } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Printer, Box, MapPin, Phone, IndianRupee, QrCode, Camera, Loader2, Save } from "lucide-react";
import Barcode from "react-barcode";
import QRCode from "react-qr-code";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";

export default function ShippingLabel() {
  const { toast } = useToast();
  
  // Database & State
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const scannerRef = useRef<Html5Qrcode | null>(null);

  // Form State
  const [routeCode, setRouteCode] = useState("MR / DA / WEST / 6445");
  const [orderId, setOrderId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [address, setAddress] = useState("");
  const [landmark, setLandmark] = useState("");
  const [pincode, setPincode] = useState("");
  const [weight, setWeight] = useState("0.5");
  const [paymentMode, setPaymentMode] = useState("PREPAID");
  const [amount, setAmount] = useState("0");

  useEffect(() => {
    const fetchTenant = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // FIX: Added (supabase as any) and (profile as any) to bypass strict typing
        const { data: profile } = await (supabase as any).from('profiles').select('tenant_id').eq('id', session.user.id).single();
        if (profile) setTenantId((profile as any).tenant_id);
      }
    };
    fetchTenant();
  }, []);

  // Camera Scanner Logic
  useEffect(() => {
    if (scannerOpen) {
      const scanner = new Html5Qrcode("shipping-scanner");
      scannerRef.current = scanner;
      scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (decodedText) => {
          setOrderId(decodedText);
          setScannerOpen(false);
          toast({ title: "Barcode Scanned", description: decodedText });
        },
        (error) => {} // Ignore continuous scanning errors
      ).catch(err => {
        console.error(err);
        toast({ title: "Camera Error", description: "Could not access the camera.", variant: "destructive" });
      });
    } else {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(e => console.error(e));
        scannerRef.current = null;
      }
    }
    return () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(e => console.error(e));
      }
    };
  }, [scannerOpen, toast]);

  const handleSaveAndPrint = async () => {
    if (!tenantId) return toast({ title: "Error", description: "Store identity not loaded.", variant: "destructive" });
    if (!orderId) return toast({ title: "Missing ID", description: "Tracking/Order ID is required.", variant: "destructive" });

    setIsSaving(true);
    try {
      // FIX: Cast the table name and the insert payload as 'any' to bypass strict typing
      const { error } = await supabase.from('shipping_labels' as any).insert({
        tenant_id: tenantId,
        tracking_id: orderId,
        route_code: routeCode,
        customer_name: customerName,
        address: address,
        landmark: landmark,
        pincode: pincode,
        mobile: mobile,
        weight: Number(weight) || 0,
        payment_mode: paymentMode,
        amount: Number(amount) || 0
      } as any);

      if (error) throw error;
      
      toast({ title: "Label Saved", description: "Preparing thermal print..." });
      
      // Delay to allow toast to render before UI freezes for print dialog
      setTimeout(() => {
        window.print();
      }, 400);

    } catch (error: any) {
      toast({ title: "Failed to save label", description: error.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AppLayout>
      <style type="text/css" media="print">
        {`
          @page { margin: 0 !important; }
          
          @media print {
            body, html { 
              background: white !important; 
              margin: 0 !important; 
              padding: 0 !important;
              height: auto !important; 
            }
            body * { visibility: hidden !important; }
            #shipping-label-container, #shipping-label-container * { visibility: visible !important; }
            
            #shipping-label-container {
              position: absolute !important;
              left: 0 !important;
              top: 0 !important;
              width: 104mm !important; 
              height: auto !important; 
              min-height: auto !important; 
              margin: 0 !important;
              padding: 2mm !important;
              background: white !important;
              box-sizing: border-box !important;
              display: block !important;
            }

            #shipping-label-container > div {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}
      </style>

      <div className="w-full bg-zinc-50 min-h-[calc(100vh-4rem)] p-4 sm:p-6 lg:p-8 no-print">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold text-zinc-900">Consignment Label</h1>
              <p className="text-sm text-zinc-500 mt-1">Scan, save, and print Amazon-style shipping labels</p>
            </div>
            <Button onClick={handleSaveAndPrint} disabled={isSaving} className="bg-zinc-900 hover:bg-zinc-800 text-white font-bold h-11 px-6 rounded-xl shadow-sm active:scale-95 transition-all">
              {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {isSaving ? "Saving..." : "Save & Print"}
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
            
            {/* LEFT SIDE: INPUT FORM */}
            <Card className="lg:col-span-5 rounded-2xl border-zinc-200 shadow-sm">
              <CardHeader className="border-b border-zinc-100 bg-white/50 pb-4">
                <CardTitle className="text-base flex items-center gap-2">
                  <Box className="w-5 h-5 text-indigo-600" /> Package Details
                </CardTitle>
              </CardHeader>
              <CardContent className="p-5 space-y-5">
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase">Routing / Sector Code</Label>
                    <Input value={routeCode} onChange={(e) => setRouteCode(e.target.value)} className="h-11 font-bold uppercase" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase">Tracking Barcode</Label>
                    <div className="flex gap-2">
                      <Input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Tracking ID" className="h-11 font-bold" />
                      <Button onClick={() => setScannerOpen(true)} variant="outline" className="h-11 w-11 p-0 shrink-0 border-zinc-200 text-zinc-600 hover:bg-zinc-100">
                        <Camera className="w-5 h-5" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-4 border-t border-zinc-100 pt-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5"/> Deliver To (नाव)</Label>
                    <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer Name" className="h-11 font-medium" />
                  </div>
                  
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase">Full Address (पत्ता)</Label>
                    <textarea 
                      value={address} 
                      onChange={(e) => setAddress(e.target.value)} 
                      placeholder="Room No, Building, Street..." 
                      className="w-full min-h-[80px] p-3 text-sm rounded-xl border border-zinc-200 bg-white shadow-sm focus:ring-2 focus:ring-zinc-900 focus:outline-none resize-y"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-zinc-500 uppercase">Landmark</Label>
                      <Input value={landmark} onChange={(e) => setLandmark(e.target.value)} placeholder="Near Station..." className="h-11" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold text-zinc-500 uppercase">Pincode</Label>
                      <Input value={pincode} onChange={(e) => setPincode(e.target.value)} placeholder="400013" maxLength={6} className="h-11 font-bold tracking-widest" />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase flex items-center gap-1.5"><Phone className="w-3.5 h-3.5"/> Mobile Number</Label>
                    <Input value={mobile} onChange={(e) => setMobile(e.target.value)} placeholder="10-digit number" maxLength={10} className="h-11 font-bold" />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 border-t border-zinc-100 pt-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase">Weight (kg)</Label>
                    <Input value={weight} onChange={(e) => setWeight(e.target.value)} type="number" step="0.1" className="h-11" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase">Payment</Label>
                    <Select value={paymentMode} onValueChange={setPaymentMode}>
                      <SelectTrigger className="h-11 font-bold">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PREPAID">PREPAID</SelectItem>
                        <SelectItem value="COD">COD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold text-zinc-500 uppercase">Amount (₹)</Label>
                    <Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" className="h-11 font-bold" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* RIGHT SIDE: LIVE PREVIEW & PRINTABLE AREA */}
            <div className="lg:col-span-7 flex justify-center sticky top-6">
              
              <div className="relative shadow-[0_10px_40px_rgba(0,0,0,0.1)] rounded-sm overflow-hidden bg-white">
                <div id="shipping-label-container" className="w-[104mm] h-auto min-h-[130mm] bg-white border-2 border-black flex flex-col font-sans text-black relative box-border">
                  
                  {/* ZONE 1: ROUTING & PRIMARY BARCODE */}
                  <div className="border-b-2 border-black p-2 flex flex-col items-center justify-center bg-zinc-50 shrink-0">
                    <h1 className="text-2xl font-black uppercase tracking-widest text-center">{routeCode || "MR / DA / WEST"}</h1>
                    <div className="mt-2 w-full flex justify-center">
                       <Barcode 
                         value={orderId || "1000000000"} 
                         width={1.8} 
                         height={50} 
                         fontSize={14} 
                         margin={0}
                         displayValue={true} 
                         background="transparent"
                       />
                    </div>
                  </div>

                  {/* ZONE 2: CUSTOMER DETAILS (DELIVER TO) */}
                  <div className="p-3 border-b-2 border-black flex flex-col">
                    <div className="flex justify-between items-start mb-1">
                      <span className="font-bold text-[11px] bg-black text-white px-1.5 py-0.5 inline-block uppercase tracking-wider">Deliver To</span>
                      <span className="font-bold text-xs">Weight: {weight || '0'} kg</span>
                    </div>
                    
                    <h2 className="text-lg font-black leading-tight uppercase mt-1">
                      {customerName || "Customer Name"}
                    </h2>
                    
                    <div className="text-sm font-semibold leading-snug mt-1.5 whitespace-pre-wrap pb-1">
                      {address || "Flat/Room No, Building Name\nStreet Name, Area"}
                      {landmark && <div className="mt-1">L/M: {landmark}</div>}
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      <div className="text-sm font-black tracking-widest uppercase">
                        PIN: <span className="text-xl">{pincode || "000000"}</span>
                      </div>
                    </div>
                    
                    <div className="mt-1 text-sm font-black flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" fill="currentColor"/> {mobile || "9999999999"}
                    </div>
                  </div>

                  {/* ZONE 3: PAYMENT & TRACKING QR */}
                  <div className="border-b-2 border-black flex shrink-0">
                    <div className="flex-1 border-r-2 border-black p-2 flex flex-col justify-center items-center bg-zinc-50">
                       <span className="text-sm font-bold text-zinc-600 uppercase tracking-widest mb-1">{paymentMode}</span>
                       <span className="text-2xl font-black flex items-center"><IndianRupee className="w-5 h-5 mr-0.5"/> {amount || "0"}</span>
                       {paymentMode === "COD" && <span className="text-[10px] font-bold mt-1 text-center leading-tight">Collect Cash<br/>From Customer</span>}
                    </div>
                    <div className="w-24 shrink-0 flex flex-col items-center justify-center p-2 py-3">
                       <QRCode value={`https://retail.biillo.com/track/${orderId}`} size={70} />
                       <span className="text-[8px] font-bold mt-1.5 tracking-widest">TRACK ORDER</span>
                    </div>
                  </div>

                  {/* ZONE 4: SELLER DETAILS (FROM) */}
                  <div className="p-2.5 flex flex-col justify-center shrink-0 relative overflow-hidden bg-white">
                    <div className="text-[9px] font-black uppercase text-zinc-500 tracking-wider mb-0.5">Sold & Shipped By:</div>
                    <h3 className="text-base font-black text-orange-600 tracking-wide">जय महाराष्ट्र मसाले (JMM)</h3>
                    <p className="text-[10px] font-bold leading-tight mt-1 max-w-[85%] pb-1">
                      दुकान नं. 3, बावला मस्जिद शेजारी, ना. म. जोशी मार्ग, करीरोड (प), मुंबई - 400013
                    </p>
                    <div className="mt-1.5 flex justify-between items-center text-[10px] font-bold">
                       <span>Contact: 98679 95629</span>
                       <span>www.jmmspices.in</span>
                    </div>
                    
                    <QrCode className="absolute -right-4 -bottom-4 w-20 h-20 text-zinc-100 -z-10" />
                  </div>

                </div>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* SCANNER DIALOG */}
      <Dialog open={scannerOpen} onOpenChange={setScannerOpen}>
        <DialogContent aria-describedby={undefined} className="sm:max-w-md w-[95vw] rounded-2xl p-0 flex flex-col bg-zinc-50 border border-zinc-200 shadow-xl overflow-hidden print:hidden">
          <div className="border-b border-zinc-200 px-5 py-4 bg-white shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold text-zinc-900"><Camera className="h-4.5 w-4.5" /> Scan Delivery Barcode</DialogTitle>
          </div>
          <div className="bg-black p-2 flex-1"><div id="shipping-scanner" className="min-h-[300px]" /></div>
          <div className="p-4 bg-white border-t border-zinc-200">
            <Button variant="outline" onClick={() => setScannerOpen(false)} className="h-11 w-full rounded-xl font-semibold border-zinc-200 bg-white text-zinc-700 text-sm shadow-sm">Cancel</Button>
          </div>
        </DialogContent>
      </Dialog>
      
    </AppLayout>
  );
}