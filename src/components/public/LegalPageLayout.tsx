import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PlatformBrand } from '@/components/branding/PlatformBrand';
import { PageCloseButton } from '@/components/ui/page-close-button';

export function LegalSection({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return <section id={id} className="scroll-mt-6 border-t border-border pt-6">
    <h2 className="text-xl font-bold text-foreground">{title}</h2>
    <div className="mt-3 space-y-3 text-base leading-8 text-muted-foreground">{children}</div>
  </section>;
}

export function LegalPageLayout({ title, children, embedded = false }: { title: string; children: ReactNode; embedded?: boolean }) {
  return <div dir="rtl" className="bg-background text-foreground">
    {!embedded && <PageCloseButton />}
    <main className={`mx-auto w-full max-w-3xl px-5 ${embedded ? 'py-4' : 'pb-16 pt-8'}`}>
      <div className="flex justify-center"><PlatformBrand className="h-[67.6px] sm:h-[84.5px]" /></div>
      <h1 className="mt-6 text-3xl font-extrabold sm:text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">עדכון אחרון: 25 באוקטובר 2026</p>
      <nav aria-label="מסמכים משפטיים" className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-primary">
        <Link to="/terms" className="underline underline-offset-4">תנאי שימוש</Link>
        <Link to="/privacy-policy" className="underline underline-offset-4">מדיניות פרטיות</Link>
        <Link to="/commission-mechanism" className="underline underline-offset-4">מנגנון העמלות</Link>
      </nav>
      <div className="mt-8 space-y-7">{children}</div>
    </main>
  </div>;
}