import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { CheckCircle2, Send, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ContactForm = () => {
  const [form, setForm] = useState({ full_name: '', phone_number: '', email: '', message: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim() || !form.phone_number.trim()) {
      toast.error('שם מלא וטלפון הם שדות חובה');
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.from('contact_submissions').insert({
        full_name: form.full_name.trim(),
        phone_number: form.phone_number.trim(),
        email: form.email.trim() || null,
        message: form.message.trim() || null,
        tag: 'New Potential Client',
        status: 'new',
      });
      if (error) throw error;
      setSubmitted(true);
    } catch {
      toast.error('שגיאה בשליחת הטופס, נסה שוב');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="listing-landing-shell min-h-screen flex items-center justify-center p-4" dir="rtl">
        <div className="listing-top-wave" aria-hidden="true" />
        <Card className="listing-landing-card max-w-md w-full text-center border-primary/20">
          <CardContent className="py-12 space-y-4">
            <div className="h-16 w-16 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-primary" />
            </div>
            <h2 className="text-xl font-bold">תודה רבה!</h2>
            <p className="text-muted-foreground text-sm">הפרטים שלך התקבלו בהצלחה. ניצור איתך קשר בהקדם.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="listing-landing-shell min-h-screen flex items-center justify-center p-4" dir="rtl">
      <div className="listing-top-wave" aria-hidden="true" />
      <Card className="listing-landing-card max-w-md w-full animate-enter">
        <CardHeader className="text-center">
          <CardTitle className="text-xl text-primary">צור קשר</CardTitle>
          <CardDescription>השאר פרטים ונחזור אליך בהקדם</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">שם מלא *</Label>
              <Input id="full_name" placeholder="ישראל ישראלי" value={form.full_name} onChange={(e) => setForm((p) => ({ ...p, full_name: e.target.value }))} maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">טלפון *</Label>
              <Input id="phone" placeholder="050-1234567" type="tel" dir="ltr" value={form.phone_number} onChange={(e) => setForm((p) => ({ ...p, phone_number: e.target.value }))} maxLength={20} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">אימייל</Label>
              <Input id="email" placeholder="email@example.com" type="email" dir="ltr" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="message">הודעה</Label>
              <Textarea id="message" placeholder="ספר לנו במה נוכל לעזור..." value={form.message} onChange={(e) => setForm((p) => ({ ...p, message: e.target.value }))} maxLength={1000} rows={4} />
            </div>
            <Button type="submit" className="w-full bg-primary text-primary-foreground hover:bg-primary-glow" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Send className="h-4 w-4 ml-2" />}
              {submitting ? 'שולח...' : 'שלח פרטים'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default ContactForm;
