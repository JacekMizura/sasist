
import puppeteer from 'puppeteer';
const html = await new Promise(r=>{const c=[];process.stdin.on('data',d=>c.push(d));process.stdin.on('end',()=>r(Buffer.concat(c).toString('utf8')))});
const media=process.argv[2]; const pref=process.argv[3]==='1';
const b=await puppeteer.launch({headless:true,args:['--no-sandbox']});
const p=await b.newPage(); await p.emulateMediaType(media);
await p.setContent(html,{waitUntil:'domcontentloaded'}); await p.evaluate(()=>document.fonts.ready);
const inner=await p.evaluate(()=>(document.body.innerText||'').trim().length);
const pdf=await p.pdf({format:'A4',printBackground:true,margin:{top:'12mm',right:'12mm',bottom:'12mm',left:'12mm'},preferCSSPageSize:pref,scale:1});
await b.close(); process.stdout.write(JSON.stringify({inner,pdf:Buffer.from(pdf).toString('base64')}));
