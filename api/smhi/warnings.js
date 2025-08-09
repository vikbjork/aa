// api/smhi/warnings.js
export default async function handler(req, res){
  try{
    const url = 'https://opendata.smhi.se/warning/alerts/geojson.json';
    const r = await fetch(url, { headers:{ 'Accept':'application/json' }});
    if(!r.ok) throw new Error('SMHI warnings '+r.status);
    const j = await r.json();

    const items = (j.features||[]).map(f=>{
      const p=f.properties||{}, g=f.geometry||{};
      const levelText = p.severity || p.eventAwarenessName || p.event || '';
      let lat=null,lng=null;
      try{
        if (g.type==='Polygon' && g.coordinates?.[0]?.length){
          const xs=g.coordinates[0].map(c=>c[0]), ys=g.coordinates[0].map(c=>c[1]);
          const w=Math.min(...xs), e=Math.max(...xs), s=Math.min(...ys), n=Math.max(...ys);
          lat=(s+n)/2; lng=(w+e)/2;
        }
      }catch(_){}
      return {
        source:'SMHI Varning',
        title:p.headline||p.event||'Varning',
        summary:p.description||'',
        url:p.web||'https://www.smhi.se/vadret/vadvarningar',
        category:p.event||'',
        region:p.area||'',
        time:p.sent||p.onset||'',
        levelText, lat, lng
      };
    });

    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=600');
    res.status(200).json(items);
  }catch(e){
    console.error(e);
    res.status(200).json([]);
  }
}
