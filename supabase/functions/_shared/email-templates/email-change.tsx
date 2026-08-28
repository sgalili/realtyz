/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  // oldEmail is the user's current address (HookData.OldEmail). For the
  // NEW-recipient half of a secure email_change fanout, `email` equals the
  // recipient (NEW), so the "from" line must render oldEmail to read
  // "from OLD to NEW" instead of "from NEW to NEW".
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>אישור שינוי כתובת האימייל ב{siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Realtyz AI+</Text>
        <Heading style={h1}>אישור שינוי כתובת אימייל</Heading>
        <Text style={text}>
          התקבלה בקשה לשנות את כתובת האימייל שלך ב{siteName} מהכתובת{' '}
          <Link href={`mailto:${oldEmail}`} style={link}>
            {oldEmail}
          </Link>{' '}
          לכתובת{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>לחיצה על הכפתור תאשר את השינוי:</Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          אישור השינוי
        </Button>
        <Text style={footer}>
          אם לא ביקשת את השינוי, מומלץ לאבטח את החשבון שלך באופן מיידי.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Assistant, Arial, sans-serif',
}
const container = { padding: '20px 25px', textAlign: 'right' as const }
const brand = {
  fontSize: '16px',
  fontWeight: 'bold' as const,
  color: '#0B2647',
  letterSpacing: '0.5px',
  margin: '0 0 24px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#081C35',
  margin: '0 0 20px',
}
const text = {
  fontSize: '15px',
  color: '#2E496B',
  lineHeight: '1.7',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#0B2647',
  color: '#ffffff',
  fontSize: '15px',
  border: '1px solid #0B2647',
  borderRadius: '12px',
  padding: '12px 24px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#8A97AA', margin: '30px 0 0' }
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #0B2647 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #0B2647 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #0B2647 !important; }
`
