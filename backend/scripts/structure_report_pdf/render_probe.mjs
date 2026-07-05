
import puppeteer from 'puppeteer';
const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const html = Buffer.concat(chunks).toString('utf-8');
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'domcontentloaded', timeout: 120000 });
  const pdf = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    preferCSSPageSize: false,
    scale: 0.94,
  });
  process.stdout.write(pdf);
} finally { await browser.close(); }
