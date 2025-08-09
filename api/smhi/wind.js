// api/smhi/wind.js
function tag(txt, t){ const m=txt.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,'i')); return m?m[1].trim():''; }
function tags(txt, t){ const re=new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`,'gi'); const out=[]; let m; while((m=re.exec(txt))!==null) out.push(m[1]); return out; }
function text(x){ return x.replace(/<!\[CDATA\[(.*?)\]\]>/gs,'$1').replace(/<[^>]+>/g,'').trim(); }

export default async function handler(req,res){
  try{
    const url='https://opendata-download-metobs.smhi.se/api/inspire/metobs-4.atom';
    const r=await fetch(url); if(!r.ok) throw new Error('SMHI wind '+r.status);
    const xml=await r.text();
    const entries = tags(xml,'entry').slice(0,200).map(e=>{
      const title = text(tag(e,'title'));
      const updated = text(tag(e,'updated'));
      const summary = text(tag(e,'summary'));
      // georss:point finns ofta som <georss:point>lat lon</georss:point>
      const m = e.match(/<georss:point>([^<]+)<\/georss:point>/i);
      let lat=null,lng=null; if(m){ const [a,b]=m[1].split(/\s+/).map(Number); lat=a; lng=b; }
      // försök hitta m/s i texten
      const valMatch = summary.match(/(\d+(?:[\.,]\d+)?)\s*m\/s/i) || title.match(/(\d+(?:[\.,]\d+)?)\s*m\/s/i);
      const value = valMatch ? Number(valMatch[1].replace(',','.')) : null;
      return { source:'SMHI Vind (obs)', station:title, time:updated, value, lat, lng };
    }).filter(x=>x.lat!=null && x.lng!=null && x.value!=null);

    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=600');
    res.status(200).json(entries);
  }catch(e){
    console.error(e);
    res.status(200).json([]);
  }
}
