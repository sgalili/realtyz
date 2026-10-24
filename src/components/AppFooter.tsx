import { Link } from 'react-router-dom';

/** Canonical legal footer shared by public, account and administration pages. */
export function AppFooter() {
  return (
    <footer className="auth-page-footer" dir="rtl" aria-label="תחתית האתר">
      <div className="auth-footer-legal">
        <span dir="ltr" className="auth-footer-copyright">© 2026 TORAFF. All rights reserved</span>
        <div className="auth-footer-links">
          <Link to="/privacy-policy">מדיניות פרטיות</Link>
          <Link to="/terms">תנאי שימוש</Link>
        </div>
      </div>
    </footer>
  );
}