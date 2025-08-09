// api/fynd.js
export const config = { runtime: 'edge' };

const CITY_DB = [
  {name:'Stockholm', lat:59.3293, lng:18.0686},
  {name:'Göteborg', lat:57.7089, lng:11.9746},
  {name:'Goteborg', lat:57.7089, lng:11.9746},
  {name:'Malmö', lat:55.6050, lng:13.0038},
  {name:'Malmo', lat:55.6050, lng:13.0038},
  {name:'Uppsala', lat:59.8586, lng:17.6389},
  {name:'Västerås', lat:59.6099, lng:16.5448},
  {name:'Örebro', lat:59.2741, lng:15.2066},
  {name:'Linköping', lat:58.4108, lng:15.6214},
  {name:'Norrköping', lat:58.5877, lng:16.1924},
  {name:'Helsingborg', lat:56.0465, lng:12.6945},
  {name:'Lund', lat:55.7047, lng:13.1910}
];

const SUBS = ['sverige','Stockholm','Goteborg','malmo','umea','uppsala','skane','Jönköping','Vasteras'];
const KEYWORDS = [
  'gratis','skänkes','skankes','bortskänkes','bortges','skänks',
  'free','giveaway'
];

function guessCity(txt=''){
  const t = txt.toLowerCase();
  for(const c of CITY_DB){
    if(t.includes(c.name.toLowerCase())) return c;
  }
  return null;
}

function pickImage(p){
  try{
    const imgs = p.data?.preview?.images;
    if(imgs && imgs.length){
      const url = imgs[0].source?.url || imgs[0].resolutions?.slice(-1)[0]?.url;
      if(url) return url.replace(/&amp;/g,'&');
    }
  }catch(_){}
  return null;
}

function tagFromText(txt){
  const t = txt.toLowerCase();
  const tags = [];
  if (t.includes('gratis') || t.includes('free') || t.includes('giveaway')) tags.push('gratis');
  if (t.includes('bortskänkes') || t.includes('skänkes') || t.includes('skankes') || t.includes('bortges') || t.includes('skänks')) tags.push('bortskänkes');
  return tags;
}

async function fetchSearch(sub, q){
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=month&limit=25`;
  const res = await fetch(url, { headers:{ 'User-Agent':'gratis-fynd/1.0', 'Accept':'application/json' }});
  if(!res.ok) return [];
  const json = await res.json();
  return (json?.data?.children || []).map(p => toItem(p, sub));
}

async function fetchNew(sub){
  const url = `https://www.reddit.com/r/${sub}/new.json?limit=50`;
  const res = await fetch(url, { headers:{ 'User-Agent':'gratis-fynd/1.0', 'Accept':'application/json' }});
  if(!res.ok) return [];
  const json = await res.json();
  const items = (json?.data?.children || []).map(p => toItem(p, sub));
  // Filtrera lokalt på KEYWORDS
  return items.filter(it => {
    const t = `${it.title} ${it.desc}`.toLowerCase();
    return KEYWORDS.some(k => t.includes(k));
  });
}

function toItem(p, sub){
  const title = p.data?.title || '';
  const text  = p.data?.selftext || '';
  const url   = 'https://www.reddit.com' + (p.data?.permalink || '');
  const img   = pickImage(p);
  const city  = guessCity(`${title} ${text}`);
  const tags  = tagFromText(`${title} ${text}`);
  return {
    id: String(p.data?.id || Math.random()),
    source: `r/${sub}`,
    title,
    desc: text?.slice(0,160) || '',
    url,
    photo: img,
    lat: city?.lat ?? null,
    lng: city?.lng ?? null,
    tags
  };
}

export default async function handler(req){
  try{
    const { searchParams } = new URL(req.url);
    const tagsWanted = (searchParams.get('tags')||'').split(',').filter(Boolean); // ex: gratis,bortskänkes

    // Hämta parallellt: både search (för varje nyckelord) och new (lokal filtrering)
    const tasks = [];
    for(const s of SUBS){
      tasks.push(fetchNew(s));
      for(const k of KEYWORDS) tasks.push(fetchSearch(s, k));
    }
    const results = await Promise.allSettled(tasks);
    let items = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);

    // Dedupe per URL
    const byUrl = new Map();
    for(const it of items){
      if(!byUrl.has(it.url)) byUrl.set(it.url, it);
    }
    items = Array.from(byUrl.values());

    // Tag-filter: OR-logik (minst en av valda måste matcha)
    if(tagsWanted.length){
      items = items.filter(it => (it.tags && it.tags.length) && tagsWanted.some(t => it.tags.includes(t)));
    }

    // Returnera max ~100
    return new Response(JSON.stringify({ items: items.slice(0,100) }), {
      headers: { 'content-type':'application/json', 'cache-control':'max-age=120' }
    });
  }catch(e){
    return new Response(JSON.stringify({ items:[], error:String(e) }), {
      headers: { 'content-type':'application/json' }, status:200
    });
  }
}
