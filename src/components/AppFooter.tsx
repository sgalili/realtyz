import { Link } from 'react-router-dom';

/** Canonical legal footer shared by public, account and administration pages. */
export function AppFooter() {
  return (
    <footer className="auth-page-footer" dir="rtl" aria-label="תחתית האתר">
      <div className="auth-footer-legal">
        <span className="auth-footer-copyright"><span dir="ltr">© 2026 TORAFF</span> · כל הזכויות שמורות</span>
        <div className="auth-footer-links">
          <Link to="/terms">תנאים</Link>
          <Link to="/privacy-policy">פרטיות</Link>
          <Link to="/commission-mechanism">מנגנון העמלות</Link>
        </div>
      </div>
    </footer>
  );
}