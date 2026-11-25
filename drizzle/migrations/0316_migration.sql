CREATE OR REPLACE FUNCTION public.guess_gender_from_name(_full text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE parts text[]; n text; two text; i int := 1;
  titles text[] := ARRAY['עוד','דר','עו','ד','אדריכל','מתווך','מתווכת','מר','גב','גברת','הרב'];
  m text[] := ARRAY['אבי','אברהם','אדם','אדיר','אוהד','אופק','אורי','אייל','איתן','אלון','אלי','אליאב','אליהו','אלעד','אמיר','אסף','ארי','ארז','אריק','אשר','בועז','ברוך','בני','בנימין','בר','ברק','גדי','גור','גיא','גלעד','דב','דביר','דוד','דור','דורון','דן','דני','הראל','זיו','חגי','חיים','יגאל','יהודה','יהונתן','יונתן','יוסי','יורם','יוסף','יריב','ישי','ישראל','כפיר','מאור','מאיר','מיכאל','מנחם','משה','מתן','נדב','נהוראי','ניסן','ניר','נתן','נתנאל','עוז','עופר','עידו','עידן','עילאי','עמרי','ענר','ערן','פז','צבי','צור','רונן','רועי','רן','רפאל','שגיא','שגיב','שון','שלומי','שלום','שמעון','שמואל','תומר','תמיר'];
  f text[] := ARRAY['אביגיל','אביטל','אביה','אדווה','אדוה','אהובה','אודליה','אופירה','אורית','אורלי','אורנה','איילה','אילה','אילנית','אילת','אינה','אירית','אלה','אלינה','אלישבע','אלכסנדרה','אמונה','אמילי','אסתר','אפרת','אריאלה','אתי','בטי','בלה','ברכה','בת אל','בת שבע','בתיה','גאולה','גילה','גלית','דבורה','דינה','דליה','דנה','דניאלה','דפנה','הדס','הדסה','הילה','ורד','ורדה','זהבה','זיוה','זיווה','חגית','חדווה','חווה','חיה','חנה','טובה','טלי','טליה','יאנה','יהודית','יוליה','יונה','יונית','יסמין','יעל','יפה','יפעת','ירדנה','כרמל','כרמלה','לאה','ליאת','ליזה','לילך','לימור','לינה','לירז','מאיה','מגי','מזל','מיכל','מילה','מינה','מירי','מלאני','מלכה','מרים','מעיין','מרינה','מרגלית','מרלן','מתוקה','נאווה','נאוה','נטלי','נטע','ניבה','נילי','נינה','ניצן','ננה','נעמה','נעמי','נרי','נתנאלה','סופיה','סיגל','סיגלית','סיון','סימונה','סיוון','סלינה','סמדר','עדנה','עופרה','עזיזה','עליזה','ענבל','ענת','עדינה','פנינה','צביה','ציפי','ציפורה','רחל','ריטה','רינה','רינת','רוחמה','רוית','רומי','רונית','רות','רותי','רעות','רפאלה','רקפת','שולמית','שוש','שושנה','שירה','שירלי','שלומית','שלי','שרה','שרית','תאיר','תהילה','תמר','תקווה'];
  u text[] := ARRAY['אביב','אור','אופיר','אריאל','גלי','דניאל','הדר','זוהר','זהר','חן','ים','ירדן','לידור','לירון','מור','נועם','נועה','ניב','עדי','עומר','עמית','פלג','רון','רותם','רז','שחר','שי','שיר','שרון','תום','טל','ליאור','יובל'];
BEGIN
  parts := array_remove(regexp_split_to_array(btrim(regexp_replace(regexp_replace(COALESCE(_full,''), '["''״׳()\[\]{}.,!?:/\\\-–—_]+', ' ', 'g'), '\s+', ' ', 'g')), ' '), '');
  WHILE i <= COALESCE(array_length(parts,1),0) AND parts[i] = ANY(titles) LOOP i := i + 1; END LOOP;
  IF i > COALESCE(array_length(parts,1),0) THEN RETURN NULL; END IF;
  n := parts[i];
  IF i < array_length(parts,1) THEN two := parts[i] || ' ' || parts[i+1]; IF two = ANY(f) THEN n := two; END IF; END IF;
  IF n = ANY(u) OR (n = ANY(m) AND n = ANY(f)) THEN RETURN NULL; END IF;
  IF n = ANY(m) THEN RETURN 'male'; END IF;
  IF n = ANY(f) THEN RETURN 'female'; END IF;
  RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.fill_empty_gender_for(_uid uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.profiles SET gender = public.guess_gender_from_name(full_name)
  WHERE id = _uid AND gender IS NULL AND public.guess_gender_from_name(full_name) IS NOT NULL;
$$;
REVOKE ALL ON FUNCTION public.fill_empty_gender_for(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_fill_empty_gender()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN PERFORM public.fill_empty_gender_for(NEW.user_id); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_fill_gender_onboarding ON public.admin_broker_onboarding;
CREATE TRIGGER trg_fill_gender_onboarding AFTER INSERT ON public.admin_broker_onboarding FOR EACH ROW EXECUTE FUNCTION public.trg_fill_empty_gender();
DROP TRIGGER IF EXISTS trg_fill_gender_license ON public.broker_license_verifications;
CREATE TRIGGER trg_fill_gender_license AFTER INSERT ON public.broker_license_verifications FOR EACH ROW EXECUTE FUNCTION public.trg_fill_empty_gender();

CREATE OR REPLACE FUNCTION public.trg_fill_gender_on_name()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.gender IS NULL AND (EXISTS (SELECT 1 FROM public.admin_broker_onboarding WHERE user_id = NEW.id) OR EXISTS (SELECT 1 FROM public.broker_license_verifications WHERE user_id = NEW.id) OR EXISTS (SELECT 1 FROM public.broker_license_grace WHERE user_id = NEW.id)) THEN
    NEW.gender := public.guess_gender_from_name(NEW.full_name);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_fill_gender_on_name ON public.profiles;
CREATE TRIGGER trg_fill_gender_on_name BEFORE UPDATE OF full_name ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trg_fill_gender_on_name();

UPDATE public.profiles p SET gender = public.guess_gender_from_name(p.full_name)
WHERE p.gender IS NULL AND public.guess_gender_from_name(p.full_name) IS NOT NULL
  AND (EXISTS (SELECT 1 FROM public.admin_broker_onboarding o WHERE o.user_id = p.id)
    OR EXISTS (SELECT 1 FROM public.broker_license_verifications v WHERE v.user_id = p.id)
    OR EXISTS (SELECT 1 FROM public.broker_license_grace g WHERE g.user_id = p.id));