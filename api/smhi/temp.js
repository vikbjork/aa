// api/smhi/temp.js
export default async function handler(req,res){
  try{
    const url='https://opendata-download-metobs.smhi.se/api/version/latest/parameter/1.json';
    const r=await fetch(url,{headers:{'Accept':'application/json'}});
    if(!r.ok) throw new Error('SMHI temp '+r.status);
    const j=await r.json();
    // Format innehåller stationslista + länkar. Vi tar senaste observation via "station"->"value" om tillgängligt.
    const items=[];
    for (const s of (j.station||[])){
      const lat = Number(s.latitude), lng = Number(s.longitude);
      const name = s.name || '';
      const latest = (s.value||[]).slice(-1)[0]; // sista posten: { date, value }
      if (isFinite(lat)&&isFinite(lng)&&latest&&latest.value!=null){
        items.push({ source:'SMHI Temp (obs)', station:name, time:new Date(latest.date).toISOString(), value:Number(latest.value), lat, lng });
      }
    }
    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=900');
    res.status(200).json(items);
  }catch(e){
    console.error(e);
    res.status(200).json([]);
  }
}
