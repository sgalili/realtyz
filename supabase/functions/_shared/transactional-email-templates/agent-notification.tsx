import * as React from 'npm:react@18.3.1';
import { Html, Head, Body, Container, Heading, Text, Link, Preview } from 'npm:@react-email/components@0.0.22';
import type { TemplateEntry } from './registry.ts';
import { genderText, profileGender } from '../personalLanguage.ts';
const AgentNotification = ({ title = 'התראה חדשה', message = '', deepLink = 'https://realtyz.co.il', gender }: { title?: string; message?: string; deepLink?: string; gender?: unknown }) => (
  <Html lang="he" dir="rtl"><Head /><Preview>{title}</Preview><Body style={{ backgroundColor: '#ffffff', fontFamily: 'Assistant, Arial, sans-serif' }}><Container style={{ padding: '24px', maxWidth: '480px' }}><Heading>TORAFF · {title}</Heading><Text style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{message}</Text><Link href={deepLink}>{genderText(profileGender(gender), { male: 'פתח את הפרטים במערכת', female: 'פתחי את הפרטים במערכת', neutral: 'פתיחה במערכת' })}</Link></Container></Body></Html>
);
export const template = { component: AgentNotification, subject: (data: Record<string, unknown>) => `TORAFF · ${String(data.title || 'התראה חדשה')}`, displayName: 'Account notification' } satisfies TemplateEntry;