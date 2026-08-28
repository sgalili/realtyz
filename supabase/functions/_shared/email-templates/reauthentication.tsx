/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="he" dir="rtl">
    <Head />
    <Preview>קוד האימות שלך</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Realtyz AI+</Text>
        <Heading style={h1}>אימות זהות</Heading>
        <Text style={text}>יש להזין את הקוד הבא כדי לאמת את זהותך:</Text>
        <Text style={codeStyle}>{token}</Text>
        <Text style={footer}>
          הקוד בתוקף לזמן קצר. אם לא ביקשת אותו, אפשר להתעלם מהמייל הזה.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '26px',
  fontWeight: 'bold' as const,
  color: '#0B2647',
  letterSpacing: '4px',
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#8A97AA', margin: '30px 0 0' }
