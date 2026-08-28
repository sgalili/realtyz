/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({
  siteName,
  confirmationUrl,
}: RecoveryEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>איפוס הסיסמה שלך ב{siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Realtyz AI+</Text>
        <Heading style={h1}>איפוס סיסמה</Heading>
        <Text style={text}>
          קיבלנו בקשה לאיפוס הסיסמה שלך ב{siteName}. לחיצה על הכפתור תאפשר לך
          לבחור סיסמה חדשה.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          בחירת סיסמה חדשה
        </Button>
        <Text style={footer}>
          אם לא ביקשת איפוס סיסמה, אפשר להתעלם מהמייל הזה. הסיסמה שלך לא תשתנה.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default RecoveryEmail

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
