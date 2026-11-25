import one from '@/assets/demo-properties/apartment-1.jpg.asset.json';
import two from '@/assets/demo-properties/apartment-2.jpg.asset.json';
import three from '@/assets/demo-properties/apartment-3.jpg.asset.json';
import four from '@/assets/demo-properties/apartment-4.jpg.asset.json';
import five from '@/assets/demo-properties/apartment-5.jpg.asset.json';
import six from '@/assets/demo-properties/apartment-6.jpg.asset.json';
import seven from '@/assets/demo-properties/apartment-7.jpg.asset.json';
import eight from '@/assets/demo-properties/apartment-8.jpg.asset.json';
const photos = [one,two,three,four,five,six,seven,eight].map(asset => asset.url);
/** Only already-public apartment imagery; no listing identity or private tenant data. */
export function demoPropertyPhotos(index: number) { const origin = typeof window === 'undefined' ? '' : window.location.origin; return [...photos.slice(index % photos.length), ...photos.slice(0, index % photos.length)].map(url => `${origin}${url}`); }