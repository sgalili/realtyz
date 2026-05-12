/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Realtyz'

interface LoginOtpProps {
  code?: string
}

const LoginOtpEmail = ({ code = '0000' }: LoginOtpProps) => (
  <Html lang="he" dir="rtl">
    <Head />
    <Preview>{`קוד הכניסה שלך ל-${SITE_NAME}: ${code}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>קוד כניסה ל-{SITE_NAME}</Heading>
        <Text style={text}>הזן את הקוד הבא במסך הכניסה כדי להמשיך:</Text>
        <Section style={codeBox}>
          <Text style={codeText} dir="ltr">{code}</Text>
        </Section>
        <Text style={text}>הקוד תקף ל-10 דקות. אם לא ביקשת קוד זה, אפשר להתעלם מהמייל.</Text>
        <Text style={footer}>בברכה, צוות {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: LoginOtpEmail,
  subject: (data: Record<string, any>) => `קוד הכניסה שלך ל-${SITE_NAME}: ${data.code ?? ''}`.trim(),
  displayName: 'Login OTP',
  previewData: { code: '4821' },
} satisfies TemplateEntry

const main: React.CSSProperties = { backgroundColor: '#ffffff', fontFamily: 'Assistant, Arial, sans-serif' }
const container: React.CSSProperties = { padding: '24px', maxWidth: '480px', margin: '0 auto' }
const h1: React.CSSProperties = { fontSize: '22px', fontWeight: 700, color: '#0f172a', margin: '0 0 16px', textAlign: 'right' }
const text: React.CSSProperties = { fontSize: '15px', color: '#475569', lineHeight: 1.6, margin: '0 0 16px', textAlign: 'right' }
const codeBox: React.CSSProperties = { backgroundColor: '#f1f5f9', borderRadius: '12px', padding: '20px', margin: '20px 0', textAlign: 'center' }
const codeText: React.CSSProperties = { fontSize: '40px', fontWeight: 900, color: '#0f172a', letterSpacing: '12px', margin: 0, fontFamily: 'monospace' }
const footer: React.CSSProperties = { fontSize: '12px', color: '#94a3b8', margin: '24px 0 0', textAlign: 'right' }
