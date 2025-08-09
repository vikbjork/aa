// api/smhi/brandrisk-point.js
export default async function handler(req, res){
  try{
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon);
    if(!isFinite(lat)||!isFinite(lon)) return res.status(400).json({error:'lat/lon krävs'});

    const url = `https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1/hourly/geotype/point/lon/${lon}/lat/${lat}/data.json`;
    const r = await fetch(url, { headers:{'Accept':'application/json'}});
    if(!r.ok) throw new Error('SMHI FWI point '+r.status);
    const j = await r.json();

    // Struktur: { approvedTime, referenceTime, timeSeries:[{ validTime, parameters:[{name:"FWI", values:[v]}]}] }
    const items = (j.timeSeries||[]).map(t=>{
      const par = (t.parameters||[]).find(p=>/FWI/i.test(p.name||''));
      const v = Array.isArray(par?.values) ? par.values[0] : null;
      return { lat, lon, time:t.validTime, value: v!=null?Number(v):null };
    }).filter(x=>x.value!=null);

    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=600');
    res.status(200).json({meta:{approvedTime:j.approvedTime}, items});
  }catch(e){
    console.error(e);
    res.status(200).json({meta:{},items:[]});
  }
}
