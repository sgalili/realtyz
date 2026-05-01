import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole, AppRole } from '@/hooks/useUserRole';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { UserPlus, Shield, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';

type TeamRole = Extract<AppRole, 'managing_broker' | 'lead_agent' | 'assistant' | 'junior_agent'>;

const ROLE_LABEL: Record<TeamRole, string> = {
  managing_broker: 'Managing Broker',
  lead_agent: 'Lead Agent',
  assistant: 'Assistant',
  junior_agent: 'Junior Agent',
};

const ROLE_DESCRIPTION: Record<TeamRole, string> = {
  managing_broker:
    'Full authority — settings, billing, team management, and contracts. The owner of the agency.',
  lead_agent:
    'Owns deals end-to-end — Deal Room, Strategy Bank, Listing Outreach, and the Closing Room. No billing or team-billing access.',
  assistant:
    'Supports the agents — Strategy Bank data entry and Deal Room task management. Cannot delete prospects or open the Closing Room.',
  junior_agent:
    'Learning role — restricted to their own assigned prospects in the Deal Room.',
};

type Invitation = {
  id: string;
  email: string;
  role: TeamRole;
  status: string;
  created_at: string;
  accepted_at: string | null;
};

type Member = {
  user_id: string;
  role: AppRole;
};

export default function Team() {
  const { user } = useAuth();
  const { canInviteTeam, loading } = useUserRole();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<TeamRole>('assistant');
  const [inviting, setInviting] = useState(false);

  const { data: invitations = [] } = useQuery({
    queryKey: ['team-invitations'],
    enabled: canInviteTeam,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_invitations')
        .select('id, email, role, status, created_at, accepted_at')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as Invitation[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ['team-members'],
    enabled: canInviteTeam,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role')
        .in('role', ['agent', 'assistant', 'junior_agent']);
      if (error) throw error;
      return (data || []) as Member[];
    },
  });

  async function sendInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !user) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('Please enter a valid email');
      return;
    }
    setInviting(true);
    try {
      const { error } = await supabase.from('team_invitations').upsert(
        {
          email: trimmed,
          role,
          invited_by: user.id,
          status: 'pending',
        },
        { onConflict: 'email,role' }
      );
      if (error) throw error;
      toast.success('Invitation created', {
        description: `${trimmed} will get ${ROLE_LABEL[role]} access on first sign-in.`,
      });
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
    } catch (e: any) {
      toast.error('Could not invite', { description: e?.message });
    } finally {
      setInviting(false);
    }
  }

  async function revoke(id: string) {
    const { error } = await supabase.from('team_invitations').delete().eq('id', id);
    if (error) {
      toast.error('Could not revoke', { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
  }

  async function removeMember(userId: string, roleName: AppRole) {
    if (!confirm(`Remove ${ROLE_LABEL[roleName as TeamRole] || roleName} access for this user?`)) return;
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', roleName);
    if (error) {
      toast.error('Could not remove', { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!canInviteTeam) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="p-8 text-center">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold">Admin access required</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Only the workspace owner can invite and manage team members.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" dir="ltr">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          Team Collaboration
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Invite teammates and choose what they can do. Only Agents can close deals or approve contracts.
        </p>
      </header>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-medium">Invite a teammate</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-2">
          <Input
            type="email"
            placeholder="teammate@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
          />
          <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="agent">Agent</SelectItem>
              <SelectItem value="assistant">Assistant</SelectItem>
              <SelectItem value="junior_agent">Junior Agent</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={sendInvite} disabled={inviting || !email.trim()}>
            {inviting ? 'Inviting…' : 'Invite'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
      </Card>

      <Card className="p-5">
        <h2 className="font-medium mb-3">Pending invitations</h2>
        {invitations.filter((i) => i.status === 'pending').length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending invitations.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations
                .filter((i) => i.status === 'pending')
                .map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[inv.role] || inv.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => revoke(inv.id)} aria-label="Revoke">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-5">
        <h2 className="font-medium mb-3">Active team members</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No team members yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User ID</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={`${m.user_id}-${m.role}`}>
                  <TableCell className="font-mono text-xs">{m.user_id.slice(0, 8)}…</TableCell>
                  <TableCell>
                    <Badge>{ROLE_LABEL[m.role as TeamRole] || m.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMember(m.user_id, m.role)}
                      aria-label="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="p-5 bg-muted/30">
        <h2 className="font-medium mb-2 text-sm">Permission matrix</h2>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>• <strong>Agent</strong> — close deals, approve contract changes, manage data &amp; tasks.</p>
          <p>• <strong>Assistant</strong> — manage tasks &amp; data ingestion. Cannot close deals.</p>
          <p>• <strong>Junior Agent</strong> — manage tasks &amp; data ingestion. Cannot close deals.</p>
          <p>• All team members can read &amp; post internal Deal Room comments.</p>
        </div>
      </Card>
    </div>
  );
}
