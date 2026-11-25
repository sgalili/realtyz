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
export const demoPersonas = {
  broker: { name: 'יואב כהן', gender: 'male', avatar: male1, office: 'TORAFF נדל״ן' },
  developer: { name: 'אברהם לוי', gender: 'male', avatar: male3, office: 'הגנים מגורים' },
  marketing: { name: 'שרה ברק', gender: 'female', avatar: female10, office: 'פסגות שיווק' },
  owner: { name: 'רחל גפן', gender: 'female', avatar: female12, office: '' },
  buyer: { name: 'משה הדר', gender: 'male', avatar: male7, office: '' },
  affiliate: { name: 'אסתר שחר', gender: 'female', avatar: female15, office: '' },
} as const;
export const demoContactIdentities = [
  { name: 'נועה לוי', gender: 'female', avatar: female5 },
  { name: 'איתי כהן', gender: 'male', avatar: male2 },
  { name: 'מיכל ברק', gender: 'female', avatar: female6 },
  { name: 'דוד גפן', gender: 'male', avatar: male4 },
  { name: 'יוסף הדר', gender: 'male', avatar: male8 },
  { name: 'יעל שחר', gender: 'female', avatar: female9 },
  { name: 'אלון רז', gender: 'male', avatar: male13 },
  { name: 'דנה לב', gender: 'female', avatar: female11 },
] as const;