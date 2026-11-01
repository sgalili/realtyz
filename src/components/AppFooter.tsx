import { Link } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/** Canonical legal footer shared by public, account and administration pages. */
export function AppFooter() {
  const { user } = useAuth();
  return (
    <footer className="auth-page-footer" dir="rtl" aria-label="תחתית האתר">
      <div className="auth-footer-legal">
        <span className="auth-footer-copyright"><span dir="ltr">© 2026 TORAFF</span></span>
        {!user && (
          <Link to="/auth" className="auth-footer-signup" aria-label="להרשמה/כניסה">
            <UserPlus className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            <span>להרשמה/כניסה</span>
          </Link>
        )}
        <div className="auth-footer-links">
          <Link to="/terms">תנאים</Link>
          <Link to="/privacy-policy">פרטיות</Link>
          <Link to="/commission-mechanism">מנגנון העמלות</Link>
        </div>
      </div>
    </footer>
  );
}
