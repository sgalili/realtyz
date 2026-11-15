import { Link } from 'react-router-dom';
import { Accessibility } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AccessibilityMenu } from '@/components/accessibility/AccessibilityMenu';

/** Canonical legal footer shared by public, account and administration pages. */
export function AppFooter() {
  return (
    <footer className="auth-page-footer" dir="rtl" aria-label="תחתית האתר">
      <div className="auth-footer-legal">
        <span className="auth-footer-copyright"><span dir="ltr">© 2026 TORAFF</span></span>
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
