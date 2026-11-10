import { Link } from 'react-router-dom';
import { Accessibility, UserPlus } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { AccessibilityMenu } from '@/components/accessibility/AccessibilityMenu';

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
          <AccessibilityMenu trigger={<Button type="button" variant="ghost" className="auth-footer-accessibility" aria-label="פתיחת תפריט נגישות"><Accessibility aria-hidden="true" /><span>נגישות</span></Button>} />
          <span className="auth-footer-separator" aria-hidden="true" />
          <Link to="/terms">תנאים</Link>
          <Link to="/privacy-policy">פרטיות</Link>
          <Link to="/commission-mechanism">עמלות</Link>
        </div>
      </div>
    </footer>
  );
}
