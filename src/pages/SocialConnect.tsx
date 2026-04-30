import { SocialConnectionsTab } from '@/components/social/SocialConnectionsTab';

const SocialConnect = () => {
  return (
    <div className="space-y-6" dir="ltr">
      {/* ─── Hero (matches dashboard) ─── */}
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-tight text-primary">
          חיבור רשתות חברתיות
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Magic Connect · ללא API Keys · סריקת QR או קוד OTP בלבד
        </p>
      </div>

      <SocialConnectionsTab />
    </div>
  );
};

export default SocialConnect;
