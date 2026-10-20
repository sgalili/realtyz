import { isPublicYad2Cache, isTrustedYad2Image } from './imageSource.ts';

const project = 'https://project.example';
const cache = `${project}/storage/v1/object/public/post-media-cache/yad2/hqljlstb/y2_1_qhROuUZoMH_20230530.jpg.jpg`;
function check(value: boolean, message: string) { if (!value) throw new Error(message); }

Deno.test('already mirrored Yad2 public cache is reusable', () => {
  check(isPublicYad2Cache(new URL(cache), project), 'Must reuse cached Yad2 image');
});
Deno.test('other projects and non-cache or private buckets remain rejected', () => {
  for (const candidate of [cache.replace('project.example', 'other.example'), cache.replace('post-media-cache', 'private'), cache.replace('/public/', '/authenticated/'), cache.replace('/yad2/', '/facebook/'), `${cache}?redirect=evil`, `${cache}#fragment`, cache.replace('hqljlstb', '%2fprivate'), cache.replace('hqljlstb', '%5cprivate'), cache.replace('hqljlstb', '%00')]) {
    check(!isPublicYad2Cache(new URL(candidate), project), 'Must reject untrusted cache URL');
  }
});
Deno.test('external Yad2 host restrictions remain enforced', () => {
  check(isTrustedYad2Image(new URL('https://img.yad2.co.il/photo.jpg')), 'Yad2 CDN allowed');
  for (const candidate of ['http://img.yad2.co.il/photo.jpg', 'https://yad2.co.il.evil.example/photo.jpg', 'https://localhost/photo.jpg', 'https://user:pass@img.yad2.co.il/photo.jpg', 'https://img.yad2.co.il:8443/photo.jpg']) {
    check(!isTrustedYad2Image(new URL(candidate)), 'Untrusted external URL rejected');
  }
});