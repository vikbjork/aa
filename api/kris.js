// api/kris.js
export default async function handler(req, res){
  try{
    const url = 'https://api.krisinformation.se/v3/updates?format=json';
    const r = await fetch(url, { headers:{ 'Accept':'application/json' }});
    if(!r.ok) throw new Error('KRIS '+r.status);
    const j = await r.json();

    const items = (j || []).map(x=>{
      // försök extrahera plats om finns lat/lon i "Area" (ibland tomt)
      let lat=null,lng=null, region='';
      if (Array.isArray(x.Area) && x.Area.length){
        region = x.Area.map(a=>a.Description).filter(Boolean).join(', ');
        const a0 = x.Area[0];
        if (a0 && a0.Geometry && a0.Geometry.Point) {
          const pt = a0.Geometry.Point;
          lat = pt?.Coordinates?.[1] ?? null; // [lon, lat]
          lng = pt?.Coordinates?.[0] ?? null;
        }
      }
      return {
        source: 'Krisinformation',
        title: x.Headline || 'Meddelande',
        summary: x.Preamble || x.BodyText || '',
        url: x.Web || x.ImageUrl || 'https://www.krisinformation.se',
        category: x.Event || '',
        region,
        time: x.Updated || x.Published || '',
        severity: 2, // neutral medel – vi kan förbättra med kategori-mappning
        levelText: x.Event || 'Info',
        lat, lng
      };
    });

    res.setHeader('Cache-Control','s-maxage=180, stale-while-revalidate=300');
    res.status(200).json(items);
  }catch(e){
    res.status(200).json([]);
  }
}
