import male1 from '@/assets/demo-headshots/voter-01.jpg';
import male2 from '@/assets/demo-headshots/voter-02.jpg';
import male3 from '@/assets/demo-headshots/voter-03.jpg';
import male4 from '@/assets/demo-headshots/voter-04.jpg';
import male7 from '@/assets/demo-headshots/voter-07.jpg';
import male8 from '@/assets/demo-headshots/voter-08.jpg';
import male13 from '@/assets/demo-headshots/voter-13.jpg';
import female5 from '@/assets/demo-headshots/voter-05.jpg';
import female6 from '@/assets/demo-headshots/voter-06.jpg';
import female9 from '@/assets/demo-headshots/voter-09.jpg';
import female10 from '@/assets/demo-headshots/voter-10.jpg';
import female11 from '@/assets/demo-headshots/voter-11.jpg';
import female12 from '@/assets/demo-headshots/voter-12.jpg';
import female15 from '@/assets/demo-headshots/voter-15.jpg';
/** Demo-only numbers: 050, five zeros, then a two-digit suffix (e.g. 0500000034). */
export const demoPhone = (n: number) => `05000000${String(n % 100).padStart(2, '0')}`;
export const demoPersonas = {
  broker: { name: 'יואב כהן', gender: 'male', avatar: male1, office: 'TORAFF נדל״ן' , phone: demoPhone(1) },
  developer: { name: 'אברהם לוי', gender: 'male', avatar: male3, office: 'הגנים מגורים' , phone: demoPhone(2) },
  marketing: { name: 'שרה ברק', gender: 'female', avatar: female10, office: 'פסגות שיווק' , phone: demoPhone(3) },
  owner: { name: 'רחל גפן', gender: 'female', avatar: female12, office: '' , phone: demoPhone(4) },
  buyer: { name: 'משה הדר', gender: 'male', avatar: male7, office: '' , phone: demoPhone(5) },
  affiliate: { name: 'אסתר שחר', gender: 'female', avatar: female15, office: '' , phone: demoPhone(6) },
} as const;
export const demoContactIdentities = [
  { name: 'נועה לוי', gender: 'female', avatar: female5 , phone: demoPhone(11) },
  { name: 'איתי כהן', gender: 'male', avatar: male2 , phone: demoPhone(12) },
  { name: 'מיכל ברק', gender: 'female', avatar: female6 , phone: demoPhone(13) },
  { name: 'דוד גפן', gender: 'male', avatar: male4 , phone: demoPhone(14) },
  { name: 'יוסף הדר', gender: 'male', avatar: male8 , phone: demoPhone(15) },
  { name: 'יעל שחר', gender: 'female', avatar: female9 , phone: demoPhone(16) },
  { name: 'אלון רז', gender: 'male', avatar: male13 , phone: demoPhone(17) },
  { name: 'דנה לב', gender: 'female', avatar: female11 , phone: demoPhone(18) },
] as const;