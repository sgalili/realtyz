CREATE OR REPLACE FUNCTION public.notify_broker_upgrade(_uid uuid, _id uuid, _status text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE _title text; _body text; _admin_body text; _name text; _link text := '/profile';
BEGIN
  SELECT full_name INTO _name FROM public.profiles WHERE id = _uid;
  IF _status = 'approved' THEN _title := 'חשבונך אומת ופעיל בהצלחה!'; _body := 'חשבונך אומת ופעיל בהצלחה! הנכסים שלך פורסמו לציבור. לצפייה במודעות לחץ כאן.'; _link := '/my-ads';
  ELSIF _status = 'rejected' THEN _title := 'בקשת השדרוג למתווך נדחתה'; _body := 'לא ניתן היה לאשר את רישיון התיווך. ניתן להגיש מחדש.';
  ELSE _title := 'בקשת השדרוג למתווך בבדיקה'; _body := 'הבקשה התקבלה ונמצאת בבדיקה. נעדכן אותך בהמשך.'; END IF;
  INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel) VALUES (_uid, 'broker_upgrade_' || _status, _title, _body, _link, 'in_app');
  _admin_body := coalesce(_name, 'משתמש') || ': ' || CASE _status WHEN 'approved' THEN 'אושר כמתווך מורשה' WHEN 'rejected' THEN 'בקשת השדרוג נדחתה' ELSE 'ממתין לאישורך' END;
  INSERT INTO public.notifications(user_id, event_type, title, body, deep_link, channel)
    SELECT ur.user_id, 'broker_upgrade_admin_' || _status, 'סטטוס אימות רישיון תיווך', _admin_body, '/super-admin', 'in_app'
    FROM public.user_roles ur WHERE ur.role = 'super_admin' AND ur.user_id <> _uid;
END $function$;