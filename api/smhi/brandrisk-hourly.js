// api/smhi/brandrisk-hourly.js
export default async function handler(req, res){
  try{
    const url = 'https://opendata-download-metfcst.smhi.se/api/category/fwif1g/version/1/hourly/approvedtime.json';
    const r = await fetch(url, { headers:{'Accept':'application/json'}});
    if(!r.ok) throw new Error('SMHI FWI hourly '+r.status);
    const j = await r.json();

    // Struktur: { approvedTime, referenceTime, geometry:[{ coordinates:[ [lon,lat], ... ] }], timeSeries:[{ validTime, parameters:[{name:"FWI", values:[...]}]}] }
    const geo = (j.geometry||[])[0];
    const pts = geo?.coordinates || [];
    const ts  = (j.timeSeries||[]).find(t => true); // ta första tidssteget (närmast i tid)
    const time = ts?.validTime || j.approvedTime;
    const para = (ts?.parameters||[]).find(p=>/FWI/i.test(p.name||''));
    const vals = para?.values || [];

    const items = pts.map((p, i)=>({
      lon: Number(Array.isArray(p)?p[0]:null),
      lat: Number(Array.isArray(p)?p[1]:null),
      value: (vals[i]!=null ? Number(vals[i]) : null),
      time
    })).filter(x=>isFinite(x.lat)&&isFinite(x.lon)&&x.value!=null);

    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=600');
    res.status(200).json({meta:{time}, items});
  }catch(e){
    console.error(e);
    res.status(200).json({meta:{},items:[]});
  }
}
