import PublicListingsBoard from './PublicListingsBoard';
export default function SharingPool() {
  return <div dir="rtl" className="listing-table-page flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><h1 className="shrink-0 py-2 text-xl font-semibold">נכסים פתוחים לשיווק</h1><div className="listing-results-scroll flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden"><PublicListingsBoard embedded marketingOnly /></div></div>;
}