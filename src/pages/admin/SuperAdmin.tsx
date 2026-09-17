import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldAlert, Store, User, Mail, Key, Calendar, Clock, Building2 } from "lucide-react";

// IMPORTANT: Master Email
const SUPER_ADMIN_EMAIL = "mumbaikarsahill@gmail.com";

// Type definition for our fetched clients
type Client = {
  id: string;
  tenant_name: string;
  created_at: string;
  profiles: { full_name: string }[];
};

export default function SuperAdmin() {
  const [isAuthorized, setIsAuthorized] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [fetchingClients, setFetchingClients] = useState(true);
  
  const navigate = useNavigate();
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    storeName: "",
    ownerName: "",
    email: "",
    password: "",
  });

  // Security Check & Data Fetching
  useEffect(() => {
    const initializeDashboard = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session || session.user.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
        navigate("/");
        return;
      }
      
      setIsAuthorized(true);
      fetchClients();
    };

    initializeDashboard();
  }, [navigate]);

  const fetchClients = async () => {
    setFetchingClients(true);
    try {
      // Fetch tenants and their associated admin profiles
      const { data, error } = await supabase
        .from('tenants')
        .select(`
          id,
          tenant_name,
          created_at,
          profiles ( full_name )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setClients(data as any);
    } catch (error) {
      console.error("Failed to fetch clients:", error);
    } finally {
      setFetchingClients(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('smart-worker', {
        body: formData
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);

      toast({
        title: "Success!",
        description: `${formData.storeName} has been provisioned.`,
        className: "bg-green-600 text-white border-none"
      });

      setFormData({ storeName: "", ownerName: "", email: "", password: "" });
      
      // Refresh the client list automatically!
      fetchClients();

    } catch (error: any) {
      toast({
        title: "Provisioning Failed",
        description: error.message || "An error occurred",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.id]: e.target.value }));
  };

  // Helper to calculate duration
  const getDaysActive = (dateString: string) => {
    const start = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - start.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays === 1 ? "1 day" : `${diffDays} days`;
  };

  // Helper to format date cleanly
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    });
  };

  if (isAuthorized === null) return null;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 bg-red-100 text-red-600 rounded-xl flex items-center justify-center border border-red-200">
              <ShieldAlert className="h-7 w-7" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">Command Center</h1>
              <p className="text-sm text-slate-500">Biillo Super Admin Dashboard</p>
            </div>
          </div>
          <div className="flex gap-4">
            <div className="bg-slate-100 px-4 py-2 rounded-lg text-center">
              <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Total Clients</p>
              <p className="text-xl font-black text-slate-900">{clients.length}</p>
            </div>
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="grid lg:grid-cols-3 gap-8">
          
          {/* LEFT COLUMN: CLIENT LIST */}
          <div className="lg:col-span-2 space-y-4">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="h-5 w-5 text-slate-500"/> Onboarded Businesses
            </h2>
            
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {fetchingClients ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  <p>Loading clients...</p>
                </div>
              ) : clients.length === 0 ? (
                <div className="p-8 text-center text-slate-500">
                  <p>No clients provisioned yet. Use the form to add your first client.</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {clients.map((client) => (
                    <div key={client.id} className="p-5 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-slate-900 text-lg">{client.tenant_name}</h3>
                        <div className="flex items-center gap-3 text-sm text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <User className="h-3 w-3" /> 
                            {client.profiles?.[0]?.full_name || "Unknown Admin"}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> 
                            {formatDate(client.created_at)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 whitespace-nowrap w-fit">
                        <Clock className="h-4 w-4" />
                        <span className="text-sm font-semibold">Active: {getDaysActive(client.created_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN: PROVISIONING FORM */}
          <div className="lg:col-span-1">
            <Card className="border-slate-200 shadow-md sticky top-6">
              <CardHeader className="bg-slate-900 text-white rounded-t-xl">
                <CardTitle>Provision New Client</CardTitle>
                <CardDescription className="text-slate-300">
                  Setup workspace & login credentials.
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <form onSubmit={handleSubmit} className="space-y-4">
                  
                  <div className="space-y-2">
                    <Label htmlFor="storeName" className="flex items-center gap-2">
                      <Store className="h-4 w-4 text-slate-400" /> Business Name
                    </Label>
                    <Input id="storeName" value={formData.storeName} onChange={handleChange} placeholder="e.g. Sakhi Collections" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ownerName" className="flex items-center gap-2">
                      <User className="h-4 w-4 text-slate-400" /> Owner Name
                    </Label>
                    <Input id="ownerName" value={formData.ownerName} onChange={handleChange} placeholder="e.g. Rahul Sharma" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="email" className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-slate-400" /> Login Email
                    </Label>
                    <Input id="email" type="email" value={formData.email} onChange={handleChange} placeholder="rahul@example.com" required />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="password" className="flex items-center gap-2">
                      <Key className="h-4 w-4 text-slate-400" /> Temp Password
                    </Label>
                    <Input id="password" type="text" value={formData.password} onChange={handleChange} placeholder="SuperSecret123!" required minLength={6} />
                  </div>

                  <Button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white mt-6" disabled={loading}>
                    {loading ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Provisioning...</>
                    ) : (
                      "Approve & Create Account"
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>

        </div>
      </div>
    </div>
  );
}