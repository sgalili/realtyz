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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>הוזמנת להצטרף ל{siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Realtyz AI+</Text>
        <Heading style={h1}>הוזמנת להצטרף</Heading>
        <Text style={text}>
          הוזמנת להצטרף ל
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . לחיצה על הכפתור תאשר את ההזמנה ותיצור לך חשבון.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          אישור ההזמנה
        </Button>
        <Text style={footer}>
          אם ההזמנה הגיעה בטעות, אפשר להתעלם מהמייל הזה.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

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
