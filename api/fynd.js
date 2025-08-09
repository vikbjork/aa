// api/fynd.js
export const config = { runtime: 'edge' }; // snabb på Vercel

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

const SUBS = ['sverige','Stockholm','Goteborg','malmo','umea','uppsala'];
const QUERIES = ['gratis','bortskänkes','skänkes'];

function guessCity(text=''){
  const t = text.toLowerCase();
  for(const c of CITY_DB){
    if(t.includes(c.name.toLowerCase())) return c;
  }
  return null;
}

function pickImage(p){
  // Reddit JSON kan ha preview.bilder
  try{
    const imgs = p.data?.preview?.images;
    if(imgs && imgs.length){
      const url = imgs[0].resolutions?.slice(-1)[0]?.url || imgs[0].source?.url;
      if(url) return url.replace(/&amp;/g,'&');
    }
  }catch(_){}
  return null;
}

async function fetchSub(q, sub){
  const url = `https://www.reddit.com/r/${sub}/search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=new&t=month&limit=25`;
  const res = await fetch(url, { headers: { 'User-Agent': 'gratis-fynd/1.0' } });
  if(!res.ok) return [];
  const json = await res.json();
  const posts = json?.data?.children || [];
  return posts.map(p=>{
    const title = p.data?.title || '';
    const text = p.data?.selftext || '';
    const url = 'https://www.reddit.com' + (p.data?.permalink || '');
    const img = pickImage(p);
    const city = guessCity(title + ' ' + text);
    const tags = [];
    const lc = (title + ' ' + text).toLowerCase();
    if(lc.includes('gratis')) tags.push('gratis');
    if(lc.includes('bortskänkes') || lc.includes('skänkes') || lc.includes('skankes')) tags.push('bortskänkes');

    return {
      id: String(p.data?.id || Math.random()),
      source: `r/${sub}`,
      title,
      desc: text?.slice(0,140) || '',
      url,
      photo: img,
      lat: city?.lat || null,
      lng: city?.lng || null,
      tags
    };
  });
}

export default async function handler(req){
  try{
    const { searchParams } = new URL(req.url);
    const tagsWanted = (searchParams.get('tags')||'').split(',').filter(Boolean); // ex: gratis,bortskänkes
    // Kör parallellt över queries × subs
    const tasks = [];
    for(const q of QUERIES){
      for(const s of SUBS){
        tasks.push(fetchSub(q,s));
      }
    }
    const batches = await Promise.allSettled(tasks);
    const items = batches.flatMap(b => b.status==='fulfilled' ? b.value : []);

    // Filtret enligt taggarna användaren valt
    const filtered = items.filter(it=>{
      if(!tagsWanted.length) return true;
      if(!it.tags || !it.tags.length) return false;
      return tagsWanted.every(t => it.tags.includes(t));
    });

    // Dedupe per URL
    const dedupe = new Map();
    for(const it of filtered){
      if(!dedupe.has(it.url)) dedupe.set(it.url, it);
    }

    return new Response(JSON.stringify({ items: Array.from(dedupe.values()).slice(0,100) }), {
      headers: { 'content-type':'application/json', 'cache-control':'max-age=120' }
    });
  }catch(e){
    return new Response(JSON.stringify({ items:[], error:String(e) }), { headers: { 'content-type':'application/json' }, status:200 });
  }
}
