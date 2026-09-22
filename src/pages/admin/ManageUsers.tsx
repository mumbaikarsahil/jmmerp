import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/lib/supabase";
import { Shield, ShieldAlert, Loader2, ShieldCheck, PlusCircle, ChevronDown } from "lucide-react";

export default function ManageUsers() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    // Get current owner's tenant ID
    const { data: owner } = await (supabase as any).from('profiles').select('tenant_id').eq('id', session.user.id).single();
    
    if (owner?.tenant_id) {
      const { data: staff } = await (supabase as any)
        .from('profiles')
        .select('*')
        .eq('tenant_id', owner.tenant_id)
        .order('created_at', { ascending: false });
        
      if (staff) setUsers(staff);
    }
    setLoading(false);
  };

  const toggleUserAccess = async (userId: string, currentStatus: boolean) => {
    const newStatus = !currentStatus;
    
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ is_active: newStatus })
      .eq('id', userId);

    if (error) {
      toast({ title: "Update Failed", description: error.message, variant: "destructive" });
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, is_active: newStatus } : u));
      toast({ 
        title: newStatus ? "Access Restored" : "Access Revoked", 
        description: newStatus ? "Employee can now log in." : "Employee session will be terminated." 
      });
    }
  };

  const changeRole = async (userId: string, newRole: string) => {
    const { error } = await (supabase as any)
      .from('profiles')
      .update({ role: newRole })
      .eq('id', userId);

    if (error) {
      toast({ title: "Role Update Failed", variant: "destructive" });
    } else {
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
      toast({ title: "Role Updated", description: `User role changed to ${newRole}` });
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

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight leading-tight text-zinc-900">
                Staff Management
              </h1>
              <p className="text-sm font-medium text-zinc-500 mt-1">Control workspace access, roles, and active sessions.</p>
            </div>
            <Button className="h-12 rounded-xl bg-zinc-900 font-bold text-[15px] text-white shadow-sm hover:bg-zinc-800 active:scale-95 transition-all">
              <PlusCircle className="mr-2 h-4 w-4" /> Invite Employee
            </Button>
          </div>

          <div className="grid gap-4">
            {users.map((user) => (
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
                      <p className="text-xs font-semibold text-zinc-500">{user.email || 'No email registered'}</p>
                    </div>
                  </div>

                  {/* Controls Section */}
                  <div className="flex items-center gap-4 sm:gap-6 bg-zinc-50/50 sm:bg-transparent p-3 sm:p-0 rounded-2xl sm:rounded-none border border-zinc-100 sm:border-none">
                    
                    {/* Role Dropdown */}
                    <div className="flex flex-col gap-1.5 flex-1 sm:flex-none">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pl-1">Role Permission</span>
                      <div className="relative">
                        <select 
                          disabled={user.role === 'admin'}
                          value={user.role || 'sales'}
                          onChange={(e) => changeRole(user.id, e.target.value)}
                          className="appearance-none h-10 w-full sm:w-40 bg-zinc-100 hover:bg-zinc-200/80 border border-zinc-200/80 text-zinc-800 text-[13px] font-bold rounded-xl px-3 py-0 pr-8 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                        >
                          <option value="admin">Owner / Admin</option>
                          <option value="manager">Store Manager</option>
                          <option value="sales">Counter Staff</option>
                        </select>
                        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500 pointer-events-none" />
                      </div>
                    </div>

                    <div className="w-px h-10 bg-zinc-200 hidden sm:block mx-1"></div>

                    {/* Access Toggle */}
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest pr-1">Status</span>
                        <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
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
                    </div>
                  </div>

                </div>
              </Card>
            ))}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}