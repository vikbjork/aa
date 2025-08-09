// api/smhi-warnings.js
export default async function handler(req, res){
  try{
    // SMHI varnings-API (CAP): regionala varningar
    const url = 'https://opendata.smhi.se/warning/alerts/geojson.json'; // geojson med varningar
    const r = await fetch(url, { headers:{ 'Accept':'application/json' }});
    if(!r.ok) throw new Error('SMHI '+r.status);
    const j = await r.json();

    const items = (j.features || []).map(f=>{
      const p = f.properties || {};
      const g = f.geometry || {};
      // Severity: nivå 1–4 i nya system (gul=1, orange=2, röd=3? varierar). Vi mappar: gul=1, orange=2, röd=3 (sätt 4 om "extrem").
      const levelText = p.severity || p.eventAwarenessName || p.event; // text
      const sevMap = (txt='').toLowerCase().includes('röd') ? 3 :
                     (txt.includes('orange') ? 2 :
                     (txt.includes('gul') ? 1 : 1));
      // geom mittpunkt/bounds (enkel bbox)
      let lat=null,lng=null,bounds=null;
      try{
        const coords = g.coordinates;
        if (g.type === 'Polygon' && coords && coords[0] && coords[0].length){
          const xs = coords[0].map(c=>c[0]);
          const ys = coords[0].map(c=>c[1]);
          const w = Math.min(...xs), e = Math.max(...xs), s = Math.min(...ys), n = Math.max(...ys);
          bounds = [s,w,n,e];
          lat = (s+n)/2; lng = (w+e)/2;
        }
      }catch(_){}
      return {
        source: 'SMHI',
        title: p.headline || p.event || 'SMHI varning',
        summary: p.description || '',
        url: p.web || p.instruction || 'https://www.smhi.se/vadret/vadvarningar',
        category: p.event || '',
        region: p.area || p.urgency || '',
        time: p.sent || p.onset || '',
        severity: sevMap,
        levelText,
        lat, lng, bounds
      };
    });

    res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=300');
    res.status(200).json(items);
  }catch(e){
    res.status(200).json([]);
  }
}
