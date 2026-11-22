import { describe, expect, it, mock } from 'bun:test';
import * as cheerio from 'cheerio';
// Deno resolves npm specifiers; map it to the same installed package for Bun tests.
mock.module('npm:cheerio@1.0.0-rc.12', () => cheerio);
const { brokerWhatsAppAction, brokerWhatsAppRetry, discoverBrokerWhatsApp, discoverBrokerTelephone, normalizeBrokerWhatsApp, inspectBrokerWhatsApp } = await import('./brokerWhatsApp');

describe('source-backed broker WhatsApp', () => {
  const source = 'https://www.yad2.co.il/realestate/item/abc123';
  const scopedPage = (content: string, token='abc123') => `<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{token}}})}</script><main><a href="https://wa.me/972509999999">Unrelated</a><aside class="stickyContentBox"><div class="forsaleAgencyContactSectionBox">${content}</div></aside></main>`;
  it('rejects the shared Yad2 WhatsApp number even inside the primary broker contact', () => {
    expect(brokerWhatsAppAction('https://wa.me/972559895695')).toBeNull();
    expect(brokerWhatsAppAction('https://api.whatsapp.com/send?phone=0559895695')).toBeNull();
    expect(discoverBrokerWhatsApp(scopedPage('<a href="https://wa.me/972559895695">WhatsApp</a>'), source)).toBeNull();
    expect(discoverBrokerWhatsApp(scopedPage('<a href="https://wa.me/972559895695">Site</a><a href="https://wa.me/972502222222">Broker</a>'), source)?.phone).toBe('972502222222');
  });
  it('production reads only the identified primary contact of the saved listing', () => {
    const html = scopedPage('<a href="https://wa.me/972502222222">WhatsApp</a><a href="tel:0503333333">Call</a>');
    expect(discoverBrokerWhatsApp(html, source)?.phone).toBe('972502222222');
    expect(discoverBrokerTelephone(html, source)).toBe('972503333333');
  });
  it('rejects a different listing identity or a contact outside the primary scope', () => {
    expect(inspectBrokerWhatsApp(scopedPage('<a href="https://wa.me/972502222222">WhatsApp</a>','other'), source).reason).toBe('source_identity_mismatch');
    expect(discoverBrokerWhatsApp(scopedPage('No contact'), source)).toBeNull();
    expect(discoverBrokerTelephone(scopedPage('<a style="display: none" href="tel:0503333333">Hidden</a>'), source)).toBeNull();
  });
  it('extracts the observed primary agency contact inside the listing sticky aside', () => {
    const html = '<main><div class="contentBox"><aside class="stickyContentBox"><div class="stickyContent"><div class="floatingCard"><div class="forsale-agency-contact-section-module-scss-module__x__forsaleAgencyContactSectionBox"><div class="forsale-agency-contact-section-module-scss-module__x__whatsappButtonBox"><a href="https://api.whatsapp.com/send?phone=+972502222222&amp;text=hello">WhatsApp</a></div><a href="tel:0502222222">Call</a></div></div></div></aside></div></main>';
    expect(discoverBrokerWhatsApp(html)).toEqual({ phone: '972502222222', link: 'https://wa.me/972502222222' });
    expect(discoverBrokerTelephone(html)).toBe('972502222222');
  });
  it('still rejects unrelated and hidden agency contact sections in sidebars', () => {
    for (const attributes of ['class="related"', 'hidden', 'aria-hidden="true"']) {
      expect(discoverBrokerWhatsApp(`<main><aside ${attributes}><div class="forsale-agency-contact-section"><a href="https://wa.me/972502222222">WhatsApp</a></div></aside></main>`)).toBeNull();
    }
  });
  it('reports absent or ambiguous evidence instead of inventing WhatsApp from text or JSON', () => {
    expect(inspectBrokerWhatsApp('<main><script>{"phone":"0502222222"}</script>0502222222</main>').reason).toBe('no_explicit_whatsapp_action');
    expect(inspectBrokerWhatsApp('<main><a href="https://wa.me/972502222222">A</a><a href="https://wa.me/972503333333">B</a></main>').reason).toBe('ambiguous_whatsapp_actions');
  });
  it('suggests only a unique primary telephone action, never inferred WhatsApp', () => {
    const html = '<main><a href="tel:0502222222">Call</a><aside><a href="tel:0503333333">Other</a></aside></main>';
    expect(discoverBrokerTelephone(html)).toBe('972502222222');
    expect(discoverBrokerWhatsApp(html)).toBeNull();
    expect(discoverBrokerTelephone('<main><a href="tel:0502222222">A</a><a href="tel:0503333333">B</a></main>')).toBeNull();
    expect(discoverBrokerTelephone('<main><div class="related"><a href="tel:0502222222">Other</a></div></main>')).toBeNull();
  });
  it('normalizes Israeli numbers without changing the main phone', () => {
    const broker = { phone: '972501111111', whatsapp: normalizeBrokerWhatsApp('050-222-2222') };
    expect(broker).toEqual({ phone: '972501111111', whatsapp: '972502222222' });
    expect(normalizeBrokerWhatsApp('00972502222222')).toBe('972502222222');
  });
  it('resolves explicit WhatsApp action numbers only', () => {
    expect(brokerWhatsAppAction('https://api.whatsapp.com/send?phone=%2B972502222222&text=hello')).toEqual({ phone: '972502222222', link: 'https://wa.me/972502222222' });
    expect(brokerWhatsAppAction('https://wa.me.evil.test/972502222222')).toBeNull();
    expect(brokerWhatsAppAction('tel:0502222222')).toBeNull();
    expect(normalizeBrokerWhatsApp('0502222222 extension 4')).toBeNull();
  });
  it('never takes contacts from related ads or ambiguous pages', () => {
    expect(discoverBrokerWhatsApp('<main><a href="https://wa.me/972502222222">WhatsApp</a><aside><a href="https://wa.me/972503333333">Other</a></aside></main>')?.phone).toBe('972502222222');
    expect(discoverBrokerWhatsApp('<main><a href="https://wa.me/972502222222">A</a><a href="https://wa.me/972503333333">B</a></main>')).toBeNull();
    expect(discoverBrokerWhatsApp('<footer><a href="https://wa.me/972502222222">A</a></footer>')).toBeNull();
  });
  it('stops after three attempts and caps rate-limit waits at 180 seconds', () => {
    expect(brokerWhatsAppRetry(429, 1, 900)).toBe(180);
    expect(brokerWhatsAppRetry(503, 2)).toBe(30);
    expect(brokerWhatsAppRetry(503, 3)).toBe(0);
    expect(brokerWhatsAppRetry(407, 1)).toBe(0);
  });
  it('rejects nested related contacts, hidden actions and script markup', () => {
    expect(discoverBrokerWhatsApp('<main><div class="related"><div>Nested</div><a href="https://wa.me/972503333333">Other</a></div><script>const s=\'<a href="https://wa.me/972504444444">Fake</a>\'</script><a hidden href="https://wa.me/972505555555">Hidden</a><a href="https://wa.me/972502222222">WhatsApp</a></main>')?.phone).toBe('972502222222');
  });
});