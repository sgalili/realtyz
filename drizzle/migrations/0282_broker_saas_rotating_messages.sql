DO $$ DECLARE c text; BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.rotating_messages'::regclass AND pg_get_constraintdef(oid) LIKE '%role_key%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.rotating_messages DROP CONSTRAINT %I', c); END IF;
END $$;
ALTER TABLE public.rotating_messages ADD CONSTRAINT rotating_messages_role_key_check CHECK (role_key = ANY (ARRAY['guest','broker_partner','developer','private','broker_saas']));
INSERT INTO public.rotating_messages (role_key, message_text, action_path, sort_order, is_active) VALUES
('broker_saas','ייבאו את כל הנכסים שלכם מיד2 בלחיצה אחת','/properties',1,true),
('broker_saas','כל הלידים והשיחות שלכם במקום אחד, עם ריטה שעונה בשבילכם','/inbox',2,true),
('broker_saas','פרסמו נכס בקבוצות ובעמודי פייסבוק ישירות מהמערכת','/campaigns',3,true),
('broker_saas','סיורים, משימות וסיכומי שיחות מסודרים לכם כל יום','/properties',4,true),
('broker_saas','שלחו הסכמי תיווך לחתימה דיגיטלית תוך דקה','/properties',5,true),
('broker_saas','בדקו את יתרת הקרדיטים שלכם והטעינו בקלות','/wallet',6,true);