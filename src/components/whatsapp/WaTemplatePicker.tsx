import { useEffect, useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { useMetaWaTemplates, renderTemplateBody, templateVariableKeys, type MetaWaTemplate } from '@/hooks/useMetaWaTemplates';

export type WaTemplateSelection = {
  name: string;
  language: string;
  body_params: string[];
};

type Props = {
  value: WaTemplateSelection | null;
  onChange: (v: WaTemplateSelection | null) => void;
  /** Tokens the broker can drop into a variable (personalized per recipient). */
  showTokenHint?: boolean;
};

/**
 * Picker for APPROVED Meta templates. Meta blocks free-form business-initiated
 * messages outside the 24h window, so every proactive send goes through here.
 */
export const WaTemplatePicker = ({ value, onChange, showTokenHint = true }: Props) => {
  const { data: templates, isLoading, error } = useMetaWaTemplates();

  const selected: MetaWaTemplate | undefined = useMemo(
    () => templates?.find((t) => t.name === value?.name && t.language === value?.language),
    [templates, value],
  );

  // Derive variable keys from the body text — the cached variable_count can be
  // stale (older syncs did not count named {{first_name}} placeholders).
  const selectedKeys = useMemo(() => templateVariableKeys(selected?.body_text ?? ''), [selected]);

  // Auto-select the first approved template so the broker isn't blocked.
  useEffect(() => {
    if (!value && templates && templates.length > 0) {
      const t = templates[0];
      const keys = templateVariableKeys(t.body_text);
      onChange({ name: t.name, language: t.language, body_params: Array(keys.length).fill('') });
    }
  }, [templates, value, onChange]);


  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> טוען תבניות מאושרות...
      </div>
    );
  }

  if (error || !templates || templates.length === 0) {
    return (
      <Alert className="bg-blue-50 border-blue-200">
        <AlertTriangle className="h-4 w-4 text-blue-600" />
        <AlertDescription className="text-blue-900 text-sm">
          לא נמצאו תבניות מאושרות ב-Meta. יש ליצור ולאשר תבנית הודעה ב-WhatsApp Manager לפני פתיחת שיחה יזומה
          או שיגור המוני.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>תבנית מאושרת (Meta Template)</Label>
        <Select
          value={value ? `${value.name}|${value.language}` : undefined}
          onValueChange={(v) => {
            const [name, language] = v.split('|');
            const t = templates.find((x) => x.name === name && x.language === language);
            onChange({ name, language, body_params: Array(t?.variable_count ?? 0).fill('') });
          }}
        >
          <SelectTrigger className="bg-blue-50 border-blue-200">
            <SelectValue placeholder="בחר תבנית" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                {t.name} ({t.language})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && selected.variable_count > 0 && (
        <div className="space-y-2">
          {Array.from({ length: selected.variable_count }).map((_, i) => (
            <div key={i} className="space-y-1">
              <Label className="text-xs">משתנה {`{{${i + 1}}}`}</Label>
              <Input
                className="bg-blue-50 border-blue-200"
                value={value?.body_params[i] ?? ''}
                onChange={(e) => {
                  const params = [...(value?.body_params ?? [])];
                  params[i] = e.target.value;
                  onChange({ name: selected.name, language: selected.language, body_params: params });
                }}
                placeholder={showTokenHint ? '[שם_פרטי]' : ''}
              />
            </div>
          ))}
          {showTokenHint && (
            <p className="text-[11px] text-muted-foreground">
              ניתן להשתמש בתגיות אישיות: [שם_פרטי] · [עיר] · [קלפי] — יוחלפו לכל נמען בנפרד.
            </p>
          )}
        </div>
      )}

      {selected && (
        <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 whitespace-pre-wrap">
          {renderTemplateBody(selected.body_text, value?.body_params ?? [])}
        </div>
      )}
    </div>
  );
};

export default WaTemplatePicker;
