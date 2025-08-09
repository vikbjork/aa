// api/livsmedel.js
function text(el, tag){
  const m = el.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'i'));
  return m ? m[1].replace(/<!\[CDATA\[(.*?)\]\]>/gs,'$1').trim() : '';
}
function all(xml, tag){
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'gi');
  const out=[]; let m; while((m=re.exec(xml))!==null){ out.push(m[1]); }
  return out;
}

export default async function handler(req, res){
  try{
    const url = 'https://www.livsmedelsverket.se/rss?type=recall'; // återkallelser
    const r = await fetch(url);
    if(!r.ok) throw new Error('LIVS '+r.status);
    const xml = await r.text();

    const items = all(xml, 'item').map(raw=>{
      const title = text(raw,'title');
      const link = text(raw,'link');
      const pub = text(raw,'pubDate');
      const desc = text(raw,'description').replace(/<[^>]+>/g,'').trim();
      // försök gissa region från titel/desc (ofta riks)
      let region = '';
      const regionMatch = desc.match(/Ort:\s*([^<]+)/i) || title.match(/\b(i|från)\s+([A-ZÅÄÖa-zåäö\- ]+)/);
      if (regionMatch) region = (regionMatch[1]||regionMatch[2]||'').trim();
      return {
        source:'Livsmedelsverket',
        title, summary: desc, url: link,
        category: 'Återkallelse',
        region, time: pub,
        severity: 2, levelText:'Återkallelse',
        lat:null, lng:null
      };
    });

    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=1200');
    res.status(200).json(items);
  }catch(e){
    res.status(200).json([]);
  }
}
