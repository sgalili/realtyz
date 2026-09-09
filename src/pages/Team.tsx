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
  managing_broker: 'מתווך אחראי',
  lead_agent: 'סוכן בכיר',
  assistant: 'אסיסטנט',
  junior_agent: 'סוכן זוטר',
};

const ROLE_DESCRIPTION: Record<TeamRole, string> = {
  managing_broker:
    'הרשאה מלאה — הגדרות, חיובים, ניהול צוות וחוזים. בעל הסוכנות.',
  lead_agent:
    'מנהל עסקאות מקצה לקצה — חדר עסקאות, מאגר אסטרטגיות, פנייה לנכסים וחדר סגירה. ללא גישה לחיובים או ניהול צוות.',
  assistant:
    'תומך בסוכנים — הזנת נתונים במאגר האסטרטגיות וניהול משימות בחדר העסקאות. אינו יכול למחוק אנשי קשר פוטנציאליים או לפתוח את חדר הסגירה.',
  junior_agent:
    'תפקיד למידה — מוגבל לאנשי קשר הפוטנציאליים שהוקצו לו בחדר העסקאות בלבד.',
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
  const [role, setRole] = useState<TeamRole>('lead_agent');
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
        .in('role', ['managing_broker', 'lead_agent', 'agent', 'assistant', 'junior_agent']);
      if (error) throw error;
      return (data || []) as Member[];
    },
  });

  async function sendInvite() {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !user) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      toast.error('יש להזין כתובת אימייל תקינה');
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
      toast.success('הזמנה נוצרה', {
        description: `${trimmed} יקבל הרשאת ${ROLE_LABEL[role]} בכניסה הראשונה.`,
      });
      setEmail('');
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
    } catch (e: any) {
      toast.error('שליחת ההזמנה נכשלה', { description: e?.message });
    } finally {
      setInviting(false);
    }
  }

  async function revoke(id: string) {
    const { error } = await supabase.from('team_invitations').delete().eq('id', id);
    if (error) {
      toast.error('ביטול ההזמנה נכשל', { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
  }

  async function removeMember(userId: string, roleName: AppRole) {
    if (!confirm(`להסיר את הרשאת ${ROLE_LABEL[roleName as TeamRole] || roleName} ממשתמש זה?`)) return;
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', roleName);
    if (error) {
      toast.error('הסרה נכשלה', { description: error.message });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ['team-members'] });
  }

  if (loading) {
    return <div className="p-6 text-sm text-muted-foreground">טוען…</div>;
  }

  if (!canInviteTeam) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <Card className="p-8 text-center">
          <Shield className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
          <h2 className="text-lg font-semibold">נדרשת הרשאת מנהל</h2>
          <p className="text-sm text-muted-foreground mt-1">
            רק בעל הסוכנות יכול להזמין ולנהל חברי צוות.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Users className="h-6 w-6 text-primary" />
          ניהול צוות
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          הזמינו חברי צוות וקבעו את ההרשאות שלהם. רק סוכנים בכירים יכולים לסגור עסקאות או לאשר חוזים.
        </p>
      </header>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="font-medium">הזמנת חבר צוות</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_200px_auto] gap-2">
          <Input
            type="email"
            placeholder="teammate@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendInvite()}
            dir="ltr"
          />
          <Select value={role} onValueChange={(v) => setRole(v as TeamRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="managing_broker">מתווך אחראי</SelectItem>
              <SelectItem value="lead_agent">סוכן בכיר</SelectItem>
              <SelectItem value="assistant">אסיסטנט</SelectItem>
              <SelectItem value="junior_agent">סוכן זוטר</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={sendInvite} disabled={inviting || !email.trim()}>
            {inviting ? 'שולח…' : 'הזמנה'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTION[role]}</p>
      </Card>

      <Card className="p-5">
        <h2 className="font-medium mb-3">הזמנות ממתינות</h2>
        {invitations.filter((i) => i.status === 'pending').length === 0 ? (
          <p className="text-sm text-muted-foreground">אין הזמנות ממתינות.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>אימייל</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead>נשלח</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {invitations
                .filter((i) => i.status === 'pending')
                .map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell className="font-medium" dir="ltr">{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{ROLE_LABEL[inv.role] || inv.role}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {new Date(inv.created_at).toLocaleDateString('he-IL')}
                    </TableCell>
                    <TableCell>
                      <Button size="icon" variant="ghost" onClick={() => revoke(inv.id)} aria-label="ביטול הזמנה">
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
        <h2 className="font-medium mb-3">חברי צוות פעילים</h2>
        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">אין חברי צוות עדיין.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>מזהה משתמש</TableHead>
                <TableHead>תפקיד</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((m) => (
                <TableRow key={`${m.user_id}-${m.role}`}>
                  <TableCell className="font-mono text-xs" dir="ltr">{m.user_id.slice(0, 8)}…</TableCell>
                  <TableCell>
                    <Badge>{ROLE_LABEL[m.role as TeamRole] || m.role}</Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => removeMember(m.user_id, m.role)}
                      aria-label="הסרה"
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
        <h2 className="font-medium mb-2 text-sm">מטריצת הרשאות</h2>
        <div className="text-xs text-muted-foreground space-y-1.5">
          <p>• <strong>מתווך אחראי</strong> — גישה מלאה להגדרות, חיובים, ניהול צוות וחוזים.</p>
          <p>• <strong>סוכן בכיר</strong> — חדר עסקאות, מאגר אסטרטגיות, פנייה לנכסים וחדר סגירה. ללא גישה לחיובים או ניהול צוות.</p>
          <p>• <strong>אסיסטנט</strong> — הזנת נתונים במאגר האסטרטגיות וניהול משימות בחדר העסקאות. אינו יכול למחוק אנשי קשר פוטנציאליים או לפתוח את חדר הסגירה.</p>
          <p>• <strong>סוכן זוטר</strong> — מוגבל לאנשי קשר הפוטנציאליים שהוקצו לו בחדר העסקאות בלבד.</p>
          <p>• כל חברי הצוות יכולים לקרוא ולהוסיף הערות פנימיות בחדר העסקאות. כל שינוי שלב והקצאה נרשמים ביומן הביקורת.</p>
        </div>
      </Card>
    </div>
  );
}
