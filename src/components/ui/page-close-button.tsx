import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

/**
 * כפתור סגירה צף בפינה העליונה, לדפים ללא מעטף ראשי (תנאי שימוש, מדיניות פרטיות).
 * מחזיר בדיוק למסך שממנו נפתח הדף; בנחיתה ישירה על הדף – חזרה לדף הבית.
 */
export function PageCloseButton() {
  const navigate = useNavigate();
  const location = useLocation();

  const close = () => {
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  return (
    <button
      type="button"
      aria-label="סגירה וחזרה לדף הקודם"
      onClick={close}
      className="fixed left-4 top-4 z-50 grid h-10 w-10 place-items-center bg-transparent text-foreground transition-opacity hover:opacity-70"
    >
      <X className="h-6 w-6" />
    </button>
  );
}
