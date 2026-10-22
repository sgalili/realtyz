import * as React from 'npm:react@18.3.1'
import { Body, Container, Head, Heading, Html, Preview, Section, Text } from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const AccountDeletionEmail = ({ code = '' }: { code?: string }) => (
  <Html lang="he" dir="rtl">
    <Head />
    <Preview>אישור בקשת מחיקת חשבון TORAFF</Preview>
    <Body style={{ backgroundColor: '#ffffff', fontFamily: 'Assistant, Arial, sans-serif' }}>
      <Container style={{ maxWidth: '480px', padding: '24px', textAlign: 'right' }}>
        <Heading style={{ color: '#0B2545', fontSize: '24px' }}>מחיקת חשבון TORAFF</Heading>
        <Text>ביקשת למחוק את החשבון לצמיתות. המחיקה אינה ניתנת לביטול. הזינו את הקוד רק אם ברצונכם להשלים את המחיקה.</Text>
        <Section style={{ backgroundColor: '#f1f5f9', padding: '20px', borderRadius: '8px', textAlign: 'center' }}>
          <Text dir="ltr" style={{ fontSize: '36px', fontWeight: 700, color: '#0B2545' }}>{code}</Text>
        </Section>
        <Text>הקוד תקף ל־10 דקות. אם לא ביקשתם למחוק את החשבון, אל תשתפו את הקוד ואל תאשרו את המחיקה.</Text>
        <Text>רשומה מוגנת של החשבון תישמר לעיון מנהל העל בלבד.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AccountDeletionEmail,
  subject: 'אישור מחיקת חשבון TORAFF',
  displayName: 'Account deletion verification',
  previewData: { code: '123456' },
} satisfies TemplateEntry