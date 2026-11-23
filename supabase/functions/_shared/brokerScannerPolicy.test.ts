import { describe, expect, it, mock } from 'bun:test';
import * as cheerio from 'cheerio';
mock.module('npm:cheerio@1.0.0-rc.12', () => cheerio);
const { extractYad2Inquiry, replyContact, scannerReply, scannerDefaults, scannerJitter } = await import('./brokerScannerPolicy');
const source = 'https://www.yad2.co.il/realestate/item/abc123';
const page = (links: string, token = 'abc123') => `<script id="__NEXT_DATA__">${JSON.stringify({props:{pageProps:{token}}})}</script><main><aside class="stickyContentBox"><div class="forsaleAgencyContactSectionBox">${links}</div></aside></main>`;
describe('dedicated scanner rules', () => {
  it('defaults to exactly 15 attempted inquiries per day', () => expect(scannerDefaults.daily_cap).toBe(15));
  it('defaults to exactly 45–180 seconds between sends', () => {
    expect([scannerDefaults.jitter_min_seconds, scannerDefaults.jitter_max_seconds]).toEqual([45,180]);
    expect(scannerJitter(45,180,()=>0)).toBe(45);
    expect(scannerJitter(45,180,()=>0.999999)).toBe(180);
  });
  it('copies only the actual prefilled central action from the identified listing', () => {
    const text='שלום, אני מתעניין במודעה abc123';
    expect(extractYad2Inquiry(page(`<a href="https://api.whatsapp.com/send?phone=972559895695&amp;text=${encodeURIComponent(text)}">WA</a>`),source).inquiry)
      .toEqual({target_phone:'972559895695',prefilled_message:text});
    expect(extractYad2Inquiry(page('<a href="https://wa.me/972559895695">WA</a>'),source).inquiry).toBeNull();
    expect(extractYad2Inquiry(page('<a href="https://wa.me/972559895695?text=hello">WA</a>','other'),source).inquiry).toBeNull();
  });
  it('never saves Yad2 main, sender, or configured scanner numbers', () => {
    expect(replyContact('https://wa.me/972559895695',[]).phone).toBeNull();
    expect(replyContact('050-222-2222',['972502222222']).phone).toBeNull();
  });
  it('accepts a unique explicit link or normalized Israeli mobile', () => {
    for (const text of ['https://wa.me/972503333333','https://api.whatsapp.com/send?phone=%2B972503333333','050-333-3333']) {
      expect(replyContact(text,[]).phone).toBe('972503333333');
    }
    expect(replyContact('0503333333 או 0504444444',[]).reason).toBe('ambiguous_reply_contacts');
  });
  it('reads reply text and exact quoted ID without copying quoted phone content', () => {
    expect(scannerReply({senderData:{chatId:'central@c.us',sender:'central@c.us'},messageData:{extendedTextMessageData:{text:'no number',stanzaId:'sent-id'},quotedMessage:{textMessage:'0503333333'}}}))
      .toEqual({text:'no number',quoted_id:'sent-id',chat_id:'central@c.us',sender:'central@c.us'});
  });
  it('extracts the seller link from the user-supplied Yad2 reply sample', () => {
    const sample = 'תודה שיצרת איתנו קשר.\nהעברנו את הפנייה שלך לבן ישייב יועץ נדל"ן מסוכנות מגה נדל"ן עם בקשה ליצור איתך קשר בזמן הקרוב.\n*אין להשיב להודעה זו*\nלפנייה למוכר - https://api.whatsapp.com/send?phone=972509464550';
    expect(replyContact(sample,[]).phone).toBe('972509464550');
  });
});