import { useNavigate } from 'react-router-dom';
import { Building2, Clapperboard, ExternalLink, Eye, Home, Megaphone, Search, Share2, Store } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { publicUrl } from '@/lib/publicUrl';
import { DEMO_CONFIGS, DEMO_TYPES, type DemoType } from '@/pages/demo/demoData';

// Icons belong to the admin control only: the public demo pages keep their own
// plain presentation.
const DEMO_ICONS: Record<DemoType, LucideIcon> = {
  broker: Store,
  marketing: Megaphone,
  developer: Building2,
  owner: Home,
  buyer: Search,
  affiliate: Share2,
};

/**
 * Super Admin-only jump board into the public role demos. Clicking a role moves
 * the admin straight into that demo page, which renders static mock data with
 * no edit, publish or delete controls at all.
 */
export function DemoRoleSwitcher() {
  const navigate = useNavigate();
  const enter = (type: DemoType) => navigate(`/demo/${type}`);

  return (
    <Card dir="rtl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Clapperboard className="h-4 w-4 text-primary" /> בורר תפקידי דמו
        </CardTitle>
        <CardDescription>
          כניסה מיידית להדגמת התפקיד, בדיוק כפי שהיא נראית למבקרים וללקוחות חיצוניים — מצב צפייה בלבד.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="w-[min(100%,320px)]">
          <Select onValueChange={(value) => enter(value as DemoType)}>
            <SelectTrigger aria-label="קפיצה מהירה לתצוגת דמו" className="h-10">
              <SelectValue placeholder="בחירת תפקיד להדגמה" />
            </SelectTrigger>
            <SelectContent>
              {DEMO_TYPES.map((type) => {
                const Icon = DEMO_ICONS[type.id];
                return (
                  <SelectItem key={type.id} value={type.id}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4 shrink-0 text-primary" />
                      {type.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DEMO_TYPES.map((type) => {
            const Icon = DEMO_ICONS[type.id];
            return (
              <div
                key={type.id}
                className="flex items-stretch gap-1 rounded-xl border border-border bg-card transition-colors hover:border-primary"
              >
                <button
                  type="button"
                  onClick={() => enter(type.id)}
                  aria-label={`כניסה לדמו: ${type.label}`}
                  className="flex-1 p-4 text-right"
                >
                  <span className="flex items-center gap-2 font-semibold">
                    <Icon className="h-4 w-4 shrink-0 text-primary" />
                    {type.label}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">{DEMO_CONFIGS[type.id].subtitle}</span>
                  <span className="mt-2 flex items-center gap-1 text-xs text-primary">
                    כניסה מיידית
                    <Eye className="h-3.5 w-3.5" />
                  </span>
                </button>
                <a
                  href={publicUrl(`/demo/${type.id}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`פתח בכרטיסייה חדשה: ${type.label}`}
                  title="פתח בכרטיסייה חדשה"
                  className="flex items-center px-2 text-muted-foreground transition-colors hover:text-primary"
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          ההדגמות מציגות נתוני להמחשה בלבד — ללא הרשמה, ללא קוד אימות וללא אפשרות עריכה, מחיקה או פרסום.
        </p>
      </CardContent>
    </Card>
  );
}

export default DemoRoleSwitcher;
