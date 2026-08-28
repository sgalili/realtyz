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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  siteUrl,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>אישור כתובת האימייל שלך ב{siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Realtyz AI+</Text>
        <Heading style={h1}>אישור כתובת האימייל</Heading>
        <Text style={text}>
          תודה שנרשמת ל
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          , כלי העבודה היחיד שכל מתווך חייב בעידן ה AI.
        </Text>
        <Text style={text}>
          כדי להתחיל, יש לאשר את הכתובת {recipient} בלחיצה על הכפתור:
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          אישור והתחלה
        </Button>
        <Text style={footer}>
          אם לא נרשמת, אפשר להתעלם מהמייל הזה.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default SignupEmail

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
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #ffffff !important; color: #0B2647 !important; }
  }
  [data-ogsc] .dm-btn { background-color: #ffffff !important; color: #0B2647 !important; }
  [data-ogsb] .dm-btn { background-color: #ffffff !important; color: #0B2647 !important; }
`
