import PublicListingsBoard from './PublicListingsBoard';
export default function SharingPool() {
  return <div dir="rtl" className="flex h-full min-h-0 flex-col"><h1 className="shrink-0 py-2 text-xl font-semibold">נכסים פתוחים לשיווק</h1><div className="min-h-0 flex-1"><PublicListingsBoard embedded marketingOnly /></div></div>;
}