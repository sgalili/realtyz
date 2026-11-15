import { FaqContent } from '@/components/faq/FaqDialog';

export default function FaqPage() {
  return <main dir="rtl" className="mx-auto w-full max-w-3xl px-5 pb-16 pt-4">
    <h1 className="sr-only">שאלות ותשובות</h1>
    <FaqContent />
  </main>;
}
