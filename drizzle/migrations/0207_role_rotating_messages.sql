CREATE TABLE public.rotating_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_key text NOT NULL CHECK (role_key IN ('guest', 'broker_partner', 'developer', 'private')),
  message_text text NOT NULL CHECK (char_length(btrim(message_text)) BETWEEN 1 AND 240),
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.rotating_messages TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.rotating_messages TO authenticated;
GRANT ALL ON public.rotating_messages TO service_role;

ALTER TABLE public.rotating_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read active rotating messages"
ON public.rotating_messages
FOR SELECT
TO anon, authenticated
USING (is_active = true);

CREATE POLICY "Super admins can read all rotating messages"
ON public.rotating_messages
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can insert rotating messages"
ON public.rotating_messages
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can update rotating messages"
ON public.rotating_messages
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'))
WITH CHECK (public.has_role(auth.uid(), 'super_admin'));

CREATE POLICY "Super admins can delete rotating messages"
ON public.rotating_messages
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

INSERT INTO public.rotating_messages (role_key, message_text, sort_order) VALUES
  ('guest', 'הצטרפו חינם וגלו נכסים לשיתופי פעולה', 10),
  ('guest', 'היכנסו למשרדים פעילים והכירו את המתווכים', 20),
  ('guest', 'מצאו הזדמנויות לשיתוף פעולה בכל הארץ', 30),
  ('guest', 'הירשמו חינם ושמרו נכסים שמעניינים אתכם', 40),
  ('guest', 'גלו מודעות מקוריות של אנשי מקצוע מאומתים', 50),
  ('guest', 'לוח השותפים מחבר בין אנשי נדל"ן ונכסים', 60),
  ('guest', 'עיינו בנכסים פעילים ובתגמולים המוצעים', 70),
  ('guest', 'מצאו את הנכס הבא או את שיתוף הפעולה הבא', 80),
  ('guest', 'הרשמה חינם פותחת גישה לקהילה המקצועית', 90),
  ('guest', 'עקבו אחר משרדים, יזמים ונכסים חדשים', 100),
  ('broker_partner', 'אשרו את סטטוס השותפות והתחילו לשתף פעולה', 10),
  ('broker_partner', 'פרסמו נכסים שממתינים ב"הנכסים שלי"', 20),
  ('broker_partner', 'הגדילו חשיפה ללידים באמצעות קמפיינים ממוקדים', 30),
  ('broker_partner', 'השלימו סכומי עמלה ותגמולים חסרים לפני פרסום', 40),
  ('broker_partner', 'בדקו אילו נכסים עדיין לא פורסמו ללוח', 50),
  ('broker_partner', 'שתפו נכסים פעילים והגדילו את הסיכויים לסגירה', 60),
  ('broker_partner', 'הגדירו עמלת סגירה ברורה לכל נכס', 70),
  ('broker_partner', 'הזמינו שותפים חדשים והרחיבו את רשת הקשרים', 80),
  ('broker_partner', 'עקבו אחר פניות ולידים בתיבת השיחות', 90),
  ('broker_partner', 'עדכנו נכסים שאינם פעילים כדי לשמר אמון', 100),
  ('developer', 'הציגו פרויקטים שלמים לקהל רחב של מתווכים', 10),
  ('developer', 'ייבאו וסנכרנו דירות לפרויקטים בקלות', 20),
  ('developer', 'הגיעו לקונים ממוקדים דרך רשת השותפים', 30),
  ('developer', 'נהלו את כל הפרויקטים והדירות במקום אחד', 40),
  ('developer', 'הגדירו תגמולים ברורים לכל סוג ליד', 50),
  ('developer', 'חשפו מלאי פעיל למתווכים מכל הארץ', 60),
  ('developer', 'עקבו אחר ביצועי פרויקטים ופניות נכנסות', 70),
  ('developer', 'פרסמו דירות זמינות והגדילו את החשיפה', 80),
  ('developer', 'שתפו פעולה עם משרדים שמתאימים לפרויקט', 90),
  ('developer', 'כל כלי היזם מחוברים לניהול שוטף ומדיד', 100),
  ('private', 'מצאו נכסים מאומתים ואנשי מקצוע מובילים', 10),
  ('private', 'שתפו פעולה ישירות עם בעלי נכסים ומתווכים', 20),
  ('private', 'שמרו נכסים מועדפים וחזרו אליהם בקלות', 30),
  ('private', 'מחפשים לקנות או לשכור? התחילו בחיפוש חכם', 40),
  ('private', 'מפרסמים נכס פרטי? נהלו אותו בצורה מאובטחת', 50),
  ('private', 'התחברו לקהילה ומצאו שיתופי פעולה מתאימים', 60),
  ('private', 'בדקו את פרטי הנכס והמפרסם לפני יצירת קשר', 70),
  ('private', 'קבלו עזרה מריטה בניווט ובחיפוש הנכס', 80),
  ('private', 'גלו נכסים פעילים לפי עיר, מחיר וסוג עסקה', 90),
  ('private', 'צרו קשר פנימי בטוח עם אנשי מקצוע מאומתים', 100);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (
       SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime'
         AND schemaname = 'public'
         AND tablename = 'rotating_messages'
     ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.rotating_messages;
  END IF;
END $$;
