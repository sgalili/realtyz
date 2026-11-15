ALTER TABLE public.rotating_messages
  ADD COLUMN action_path text;

ALTER TABLE public.rotating_messages
  ADD CONSTRAINT rotating_messages_action_path_check
  CHECK (action_path IS NULL OR action_path IN ('/auth', '/what-is-toraff', '/faq'));

DELETE FROM public.rotating_messages
WHERE role_key = 'guest';

INSERT INTO public.rotating_messages (role_key, message_text, sort_order, action_path) VALUES
  ('guest', 'נמאס לבזבז שעות על שיווק ידני? תן לאוטומציה של TORAFF לפרסם ב-300 קבוצות ברשתות!', 10, '/what-is-toraff'),
  ('guest', 'רוצה לידים חמים ומאומתים? פרסם את הנכסים שלך בלוח השותפים של המדינה בחינם לגמרי!', 20, '/auth'),
  ('guest', 'מי קובע את העמלות? אצלנו אתה קובע את גובה העמלות לשותפים ומקסם רווחים בכל עסקה.', 30, '/faq'),
  ('guest', 'מתווך או יזם? תן לריטה ולמערכת האוטומציה לנהל עבורך פוסטים, תזמון וקבוצות מאחורי הקלעים.', 40, '/what-is-toraff'),
  ('guest', 'למה לעבוד לבד? הצטרף לרשת שיתופי הפעולה (MLS) ותן למאות מתווכים לעזור לך למכור מהר.', 50, '/auth'),
  ('guest', 'מחפש חשיפה מקסימלית בלי עלויות? ב-TORAFF פרסום ההודעות והנכסים הוא חינם לחלוטין!', 60, '/auth'),
  ('guest', 'רוצה להבין איך הרשת עובדת? קרא את המדריך המלא וגלה את כל הכלים המטורפים למתווכים.', 70, '/faq'),
  ('guest', 'יזם נדל"ן? חשוף את הפרויקטים שלך לעשרות אלפי מתעניינים עם כלי שיווק ואוטומציה מתקדמים.', 80, '/what-is-toraff'),
  ('guest', 'די לשרוף תקציבי פרסום. ב-TORAFF תיהנה מקהילה עסקית מאומתת של אנשי מקצוע מובילים.', 90, '/auth'),
  ('guest', 'מוכן לשדרג את העסק שלך? פתח חשבון בתוך שניות והתחל ליהנות מכל היתרונות של TORAFF.', 100, '/auth');