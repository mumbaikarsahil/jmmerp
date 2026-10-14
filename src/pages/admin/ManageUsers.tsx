import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { createClient } from "@supabase/supabase-js"; // ADDED FOR THE SILENT CLIENT TRICK
import { Shield, ShieldAlert, ShieldCheck, PlusCircle, ChevronDown, Trash2, Lock, Unlock, RefreshCw, Power } from "lucide-react";

export default function ManageUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const { toast } = useToast();

  // Security State
  const [storeStatus, setStoreStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [dailyPin, setDailyPin] = useState("1234");
  const [isUpdatingSecurity, setIsUpdatingSecurity] = useState(false);

  // Invite Modal State (Email & Password)
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({ name: "", email: "", password: "", role: "sales" });
  const [isInviting, setIsInviting] = useState(false);

  useEffect(() => {
    fetchUsersAndSecurity();
  }, []);

  const fetchUsersAndSecurity = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const { data: owner } = await (supabase as any).from('profiles').select('tenant_id').eq('id', session.user.id).single();
    
    if (owner?.tenant_id) {
      setTenantId(owner.tenant_id);
      
      const { data: staff } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('tenant_id', owner.tenant_id)
        .eq('is_archived', false)
        .order('created_at', { ascending: false });
        
      if (staff) setUsers(staff);

      const { data: tenantConfig } = await (supabase as any)
        .from('tenants')
        .select('store_status, daily_pin')
        .eq('id', owner.tenant_id)
        .single();

      if (tenantConfig) {
        setStoreStatus(tenantConfig.store_status || "OPEN");
        setDailyPin(tenantConfig.daily_pin || "1234");
      }
    }
    setLoading(false);
  };

  const toggleStoreStatus = async () => {
    if (!tenantId) return;
    setIsUpdatingSecurity(true);
    const newStatus = storeStatus === "OPEN" ? "CLOSED" : "OPEN";
    
    const { error } = await (supabase as any).from('tenants').update({ store_status: newStatus }).eq('id', tenantId);
    
    setIsUpdatingSecurity(false);
    if (!error) {
      setStoreStatus(newStatus);
      toast({
        title: newStatus === "CLOSED" ? "Store Locked 🔒" : "Store Opened 🔓",
        description: newStatus === "CLOSED" ? "All active employee sessions will be terminated." : "Employees can now log in using the Daily PIN.",
        variant: newStatus === "CLOSED" ? "destructive" : "default"
      });
    } else {
      toast({ title: "Failed to update store status", variant: "destructive" });
    }
  };

  const generateNewPin = async () => {
    if (!tenantId) return;
    setIsUpdatingSecurity(true);
    const newPin = Math.floor(1000 + Math.random() * 9000).toString(); 
    
    const { error } = await (supabase as any).from('tenants').update({ daily_pin: newPin }).eq('id', tenantId);
    
    setIsUpdatingSecurity(false);
    if (!error) {
      setDailyPin(newPin);
      toast({ title: "PIN Updated", description: `Today's new access PIN is ${newPin}` });
    } else {
      toast({ title: "Failed to update PIN", description: "Check Database RLS policies.", variant: "destructive" });
    }
  };

  const handleInvite = async () => {
    if (!inviteForm.name || !inviteForm.email || !inviteForm.password) {
      return toast({ title: "Missing fields", variant: "destructive" });
    }
    setIsInviting(true);
    
    try {
      // 1. Create a "Silent" Supabase Client that DOES NOT save to local storage
      // This prevents you (the owner) from being logged out when the employee is created.
      const silentClient = createClient(
        import.meta.env.VITE_SUPABASE_URL, 
        import.meta.env.VITE_SUPABASE_ANON_KEY, 
        { auth: { persistSession: false } }
      );

      // 2. Create the user using the silent client
      const { data: authData, error: authError } = await silentClient.auth.signUp({
        email: inviteForm.email.trim(),
        password: inviteForm.password,
      });

      if (authError) throw authError;

      // 3. Insert their standard profile using the main client
      const { error: profileError } = await (supabase as any).from('profiles').insert({
        id: authData.user?.id, 
        tenant_id: tenantId,
        full_name: inviteForm.name,
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        is_active: true,
        is_archived: false
      });

      if (profileError) throw profileError;

      // Success! Update UI without logging out.
      setIsInviteOpen(false);
      
      // Add the new user locally so it shows up instantly without reloading
      setUsers([{
        id: authData.user?.id,
        full_name: inviteForm.name,
        email: inviteForm.email.trim(),
        role: inviteForm.role,
        is_active: true
      }, ...users]);

      setInviteForm({ name: "", email: "", password: "", role: "sales" });
      
      toast({ 
        title: "Staff Created Successfully", 
        description: "The employee can now log in.",
        duration: 4000
      });

    } catch (error: any) {
      toast({ title: "Failed to add employee", description: error.message, variant: "destructive" });
    } finally {
      setIsInviting(false);
    }
  };

  const toggleUserAccess = async (userId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    const { error } = await (supabase as any).from('profiles').update({ is_active: newStatus }).eq('id', userId);

    if (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, is_active: newStatus } : u));
      toast({ title: newStatus ? "Access Restored" : "Access Revoked" });
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await (supabase as any).from('profiles').update({ role: newRole }).eq('id', userId);

    if (error) {
      toast({ title: "Role Update Failed", variant: "destructive" });
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast({ title: "Role Updated", description: `User role changed to ${newRole}` });
    }
  };

  const archiveUser = async (userId: string) => {
    const { error } = await (supabase as any).from('profiles').update({ is_archived: true, is_active: false }).eq('id', userId);
    
    if (!error) {
      setUsers(users.filter(u => u.id !== userId));
      toast({ title: "Employee Deleted" });
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center bg-[#fcfcfd]">
          <div className="flex flex-col items-center gap-3">
            <div className="animate-spin rounded-full h-6 w-6 border-2 border-zinc-200 border-t-blue-500" />
            <p className="text-zinc-500 font-bold text-xs uppercase tracking-wider">Loading Staff Directory...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="min-h-screen bg-[#fcfcfd] font-sans pb-32">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 pt-3 sm:pt-5 animate-in fade-in duration-300">
          
          <div className="flex items-center gap-1.5 mb-1.5">
            <ShieldCheck className="h-4 w-4 text-blue-500" />
            <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Access Control</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight text-zinc-900">
              Security & Staff
            </h1>
            <p className="text-sm font-medium text-zinc-500 mt-1">Control workspace access, roles, and nightly shutdowns.</p>
          </div>

          {/* MASTER SECURITY CONTROL PANEL */}
          <Card className="mb-8 overflow-hidden rounded-[24px] border-zinc-200 shadow-sm bg-white">
            <div className="bg-zinc-900 px-5 py-4 flex items-center justify-between border-b border-zinc-800">
              <div className="flex items-center gap-2.5">
                <Power className={`h-5 w-5 ${storeStatus === "OPEN" ? "text-emerald-400" : "text-rose-400"}`} />
                <h2 className="text-base font-bold text-white tracking-tight">Master Killswitch</h2>
              </div>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md ${storeStatus === "OPEN" ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400"}`}>
                {storeStatus === "OPEN" ? "System Active" : "System Locked"}
              </span>
            </div>
            
            <div className="p-5 sm:p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <div>
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Nightly Shutdown</Label>
                <p className="text-sm font-medium text-zinc-900 mt-1 mb-3">Lock the store system at night to immediately terminate all active employee sessions.</p>
                <Button 
                  disabled={isUpdatingSecurity}
                  onClick={toggleStoreStatus}
                  className={`h-12 rounded-xl font-bold w-full sm:w-auto px-6 shadow-sm transition-all ${storeStatus === "OPEN" ? "bg-rose-100 text-rose-700 hover:bg-rose-200 border border-rose-200" : "bg-emerald-500 text-white hover:bg-emerald-600"}`}
                >
                  {storeStatus === "OPEN" ? <><Lock className="mr-2 h-4 w-4"/> Lock System Now</> : <><Unlock className="mr-2 h-4 w-4"/> Unlock System</>}
                </Button>
              </div>

              <div className="md:border-l md:border-zinc-100 md:pl-6 pt-6 md:pt-0 border-t border-zinc-100 md:border-t-0">
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Daily Rolling PIN</Label>
                <p className="text-sm font-medium text-zinc-900 mt-1 mb-3">Employees must enter this PIN alongside their password. Share this verbally in the store.</p>
                <div className="flex gap-3">
                  <div className="h-12 px-5 flex-1 bg-zinc-50 border border-zinc-200 rounded-xl flex items-center justify-center shadow-inner">
                    <span className="text-2xl font-black tracking-[0.25em] text-zinc-900">{dailyPin}</span>
                  </div>
                  <Button disabled={isUpdatingSecurity} onClick={generateNewPin} variant="outline" className="h-12 w-12 rounded-xl p-0 border-zinc-200 shadow-sm hover:bg-zinc-50">
                    <RefreshCw className="h-5 w-5 text-zinc-600" />
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {/* DIRECTORY HEADER */}
          <div className="flex items-center justify-between mb-4 mt-8 border-b border-zinc-100 pb-2">
            <h2 className="text-[13px] font-bold text-zinc-900 uppercase tracking-wider">Employee Directory</h2>
            <Button onClick={() => setIsInviteOpen(true)} className="h-9 rounded-lg bg-blue-600 font-bold text-[13px] text-white shadow-sm hover:bg-blue-700 active:scale-95 transition-all px-4">
              <PlusCircle className="mr-2 h-4 w-4" /> Add Staff
            </Button>
          </div>

          <div className="grid gap-3">
            {users.length === 0 ? (
               <div className="text-center py-10 bg-white border border-zinc-200 border-dashed rounded-[20px]">
                 <p className="text-sm font-bold text-zinc-500">No active staff members found.</p>
               </div>
            ) : users.map((user) => (
              <Card 
                key={user.id} 
                className={`relative overflow-hidden p-4 sm:p-5 transition-all duration-200 rounded-[20px] shadow-sm hover:shadow-md border-zinc-200/80 ${user.is_active === false ? 'bg-zinc-50/80' : 'bg-white hover:border-zinc-300'}`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 relative z-10">
                  
                  {/* User Identity Section */}
                  <div className="flex items-center gap-4">
                    <div className={`h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-colors ${
                      user.role === 'admin' ? 'bg-amber-100 text-amber-600 border border-amber-200' : 'bg-blue-50 text-blue-600 border border-blue-100'
                    } ${user.is_active === false && 'grayscale opacity-60'}`}>
                      {user.role === 'admin' ? <ShieldAlert className="h-5 w-5" /> : <Shield className="h-5 w-5" />}
                    </div>
                    <div>
                      <h3 className={`font-bold text-[15px] tracking-tight leading-tight mb-0.5 ${user.is_active === false ? 'text-zinc-400 line-through' : 'text-zinc-900'}`}>
                        {user.full_name || 'Unnamed User'}
                      </h3>
                      <p className="text-xs font-semibold text-zinc-500">{user.email || 'No email provided'}</p>
                    </div>
                  </div>

                  {/* Controls Section */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-5 bg-zinc-50/50 sm:bg-transparent p-3 sm:p-0 rounded-2xl sm:rounded-none border border-zinc-100 sm:border-none">
                    
                    {/* Role Dropdown */}
                    <div className="flex flex-col gap-1 flex-1 sm:flex-none">
                      <div className="relative">
                        <select 
                          disabled={user.role === 'admin'}
                          value={user.role || 'sales'}
                          onChange={(e) => changeRole(user.id, e.target.value)}
                          className="appearance-none h-10 w-full sm:w-36 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200/80 text-zinc-800 text-[13px] font-bold rounded-xl px-3 py-0 pr-8 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          <option value="admin">Owner / Admin</option>
                          <option value="manager">Store Manager</option>
                          <option value="sales">Counter Staff</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      </div>
                    </div>

                    <div className="w-px h-8 bg-zinc-200 hidden sm:block mx-1"></div>

                    {/* Access Toggle */}
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end gap-0.5 hidden sm:flex">
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          user.is_active !== false 
                            ? 'bg-emerald-100 text-emerald-700' 
                            : 'bg-rose-100 text-rose-700'
                        }`}>
                          {user.is_active !== false ? 'Active' : 'Suspended'}
                        </span>
                      </div>
                      <Switch 
                        disabled={user.role === 'admin'}
                        checked={user.is_active !== false}
                        onCheckedChange={() => toggleUserAccess(user.id, user.is_active !== false)}
                        className="data-[state=checked]:bg-emerald-500 shadow-sm"
                      />
                      
                      <Button 
                        disabled={user.role === 'admin'} 
                        onClick={() => archiveUser(user.id)} 
                        variant="ghost" 
                        className="h-10 w-10 p-0 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                </div>
              </Card>
            ))}
          </div>

        </div>
      </div>

      {/* INVITE EMPLOYEE MODAL (STANDARD EMAIL & PASSWORD) */}
      <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
        <DialogContent className="sm:max-w-md w-[95vw] rounded-[24px] p-6 shadow-2xl bg-white border-zinc-200">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-bold text-zinc-900">Add Staff Member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Full Name</Label>
              <Input 
                value={inviteForm.name} 
                onChange={e => setInviteForm({...inviteForm, name: e.target.value})} 
                placeholder="Rohan Sharma" 
                className="h-12 mt-1 rounded-xl bg-zinc-50 border-zinc-200 font-bold text-[15px]" 
              />
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Email Address</Label>
                <Input 
                  type="email"
                  value={inviteForm.email} 
                  onChange={e => setInviteForm({...inviteForm, email: e.target.value})} 
                  placeholder="rohan@jmm.in" 
                  className="h-12 mt-1 rounded-xl bg-zinc-50 border-zinc-200 font-bold text-[15px]" 
                />
              </div>
              <div>
                <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Initial Password</Label>
                <Input 
                  type="text"
                  value={inviteForm.password} 
                  onChange={e => setInviteForm({...inviteForm, password: e.target.value})} 
                  placeholder="e.g. jmm@1234" 
                  className="h-12 mt-1 rounded-xl bg-zinc-50 border-zinc-200 font-bold text-[15px]" 
                />
              </div>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest ml-1">Assign Role</Label>
              <select 
                value={inviteForm.role}
                onChange={e => setInviteForm({...inviteForm, role: e.target.value})}
                className="h-12 mt-1 w-full rounded-xl border border-zinc-200 bg-zinc-50 text-[15px] font-bold px-3 shadow-sm outline-none focus:border-zinc-400"
              >
                <option value="sales">Counter Staff</option>
                <option value="manager">Store Manager</option>
              </select>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs font-semibold text-blue-700">
            Note: The employee will log in using this <strong className="text-blue-900">Email</strong> and <strong className="text-blue-900">Password</strong>.
          </div>

          <DialogFooter className="mt-4 gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setIsInviteOpen(false)} className="h-12 rounded-xl font-bold border-zinc-200">Cancel</Button>
            <Button disabled={isInviting || !inviteForm.name || !inviteForm.email || !inviteForm.password} onClick={handleInvite} className="h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-bold px-6 shadow-sm">
              {isInviting ? "Adding..." : "Save to Directory"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}