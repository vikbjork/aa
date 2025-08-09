// api/search.js
// Node runtime (stabil för externa HTTP-källor)
// Funktioner: sök, filter på butik, sortering (pris/distance/namn), geo, bilder via Open Food Facts, caching-headers
// Lägg env var på Vercel: MPK_API_KEY="<din nyckel>"

export default async function handler(req, res) {
  try {
    const q         = (req.query.q || '').trim();
    const lat       = req.query.lat ? Number(req.query.lat) : null;
    const lng       = req.query.lng ? Number(req.query.lng) : null;
    const city      = (req.query.city || '').trim();
    const stores    = (req.query.stores || '').split(',').map(s => s.trim()).filter(Boolean); // ex: "ICA,Willys,Coop"
    const sort      = (req.query.sort || 'price').toLowerCase(); // "price" | "distance" | "name"
    const page      = Math.max(1, parseInt(req.query.page || '1', 10));
    const pageSize  = Math.min(50, Math.max(10, parseInt(req.query.pageSize || '20', 10)));

    if (!q) return res.status(400).json({ error: 'Param q (sökterm) krävs' });

    // Hämta rådata
    const itemsRaw = await fetchAllSources({ q, city });

    // Normalisera + enrich (bild, distance, etc)
    const norm = await normalizeAndEnrich(itemsRaw, { lat, lng });

    // Filtrera butik
    let items = stores.length ? norm.filter(x => stores.some(s => x.store?.toLowerCase().includes(s.toLowerCase()))) : norm;

    // Sortera
    if (sort === 'distance' && lat != null && lng != null) {
      items.sort((a,b) => (a.km ?? 1e9) - (b.km ?? 1e9));
    } else if (sort === 'name') {
      items.sort((a,b) => (a.product || '').localeCompare(b.product || ''));
    } else {
      // pris default
      items.sort((a,b) => (a.priceNum ?? 1e9) - (b.priceNum ?? 1e9));
    }

    // Pagination
    const total = items.length;
    const start = (page - 1) * pageSize;
    const end   = start + pageSize;
    const pageItems = items.slice(start, end);

    // Cache hint för Vercel/CDN
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600'); // 5 min CDN-cache
    return res.status(200).json({
      q, city, total, page, pageSize,
      items: pageItems
    });
  } catch (err) {
    console.error('API error', err);
    return res.status(200).json({ items: [], error: String(err) });
  }
}

/* ---------------------- Datakällor ---------------------- */

async function fetchAllSources({ q, city }) {
  // Prioriterad källa: Matpriskollen (MPK)
  const mpk = await fetchMPK({ q, city });

  // Fler adapters kan läggas till här (andra öppna källor / kommunala öppna data)
  // Returnera sammanslagen lista
  return [...mpk];
}

async function fetchMPK({ q, city }) {
  // Matpriskollen officiellt API: kräver nyckel i env
  // Kontakta Matpriskollen för utvecklarnyckel. När du har den: lägg MPK_API_KEY i Vercel → Settings → Environment Variables.
  const key = process.env.MPK_API_KEY;
  if (!key) {
    // Fallback/mock så UI kan demonstreras utan nyckel
    return mockData(q, city);
  }

  // OBS: Endpoint/params varierar per avtal. Nedan visar en typisk sökning:
  // Byt URL & response-mappning enligt deras dokumentation/avtal.
  const url = `https://api.matpriskollen.se/products/search?query=${encodeURIComponent(q)}${city ? '&city=' + encodeURIComponent(city) : ''}`;

  const r = await safeFetch(url, {
    headers: {
      'Authorization': `Bearer ${key}`,
      'Accept': 'application/json',
      'User-Agent': 'matpris-client/1.0'
    }
  });
  if (!r.ok) throw new Error(`MPK ${r.status}`);
  const j = await r.json();

  // Förväntat format: mappa till vårt interna råformat
  // Justera fältnamn efter faktisk respons:
  const arr = (j.products || []).map(p => ({
    source: 'MPK',
    store: p.storeName || p.store || '',
    product: p.name || '',
    price: p.price,                  // nummer
    priceText: p.price != null ? `${Number(p.price).toFixed(2)} kr` : null,
    city: p.storeCity || p.city || '',
    lastUpdated: p.lastUpdated || p.updatedAt || '',
    image: p.imageUrl || null,       // om MPK ger
    ean: p.ean || p.barcode || null, // om finns
    lat: p.storeLat || null,         // om finns
    lng: p.storeLng || null,         // om finns
    url: p.url || null               // direkt till butik/produkt om finns
  }));

  return arr;
}

/* ---------------------- Enrichment ---------------------- */

async function normalizeAndEnrich(items, { lat, lng }) {
  const withPrice = items.filter(x => x.price != null);
  // Hämta bilder via Open Food Facts för de som saknar image
  const needImg = withPrice.filter(x => !x.image);
  const imageMap = await fetchOFFImagesBatch(needImg);

  return withPrice.map(x => {
    const priceNum = Number(x.price);
    const km = (lat != null && lng != null && x.lat != null && x.lng != null) ? haversine({lat, lng}, {lat: Number(x.lat), lng: Number(x.lng)}) : null;
    return {
      id: idFrom(x),
      source: x.source || 'MPK',
      store: x.store,
      product: x.product,
      price: x.priceText || (isFinite(priceNum) ? `${priceNum.toFixed(2)} kr` : null),
      priceNum: isFinite(priceNum) ? priceNum : null,
      city: x.city || '',
      date: x.lastUpdated || '',
      image: x.image || imageMap.get(idFrom(x)) || null,
      lat: x.lat != null ? Number(x.lat) : null,
      lng: x.lng != null ? Number(x.lng) : null,
      url: x.url || null
    };
  });
}

function idFrom(x) {
  // Stabilt id för dedupe (butik + produkt + pris)
  return `${(x.store||'').toLowerCase()}|${(x.product||'').toLowerCase()}|${x.price}`;
}

/* ---------------------- Open Food Facts (bilder) ---------------------- */

async function fetchOFFImagesBatch(items) {
  // En enkel batch som söker per produktnamn (eller EAN om vi har det)
  const out = new Map();
  const limited = items.slice(0, 25); // begränsa per call
  await Promise.all(limited.map(async (x) => {
    let img = null;
    if (x.ean) {
      img = await offByBarcode(x.ean);
    }
    if (!img && x.product) {
      img = await offByName(x.product);
    }
    if (img) out.set(idFrom(x), img);
  }));
  return out;
}

async function offByBarcode(ean) {
  try {
    const u = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(String(ean))}.json`;
    const r = await safeFetch(u, { headers: { 'Accept':'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.product?.image_front_url || j?.product?.image_url || null;
  } catch { return null; }
}

async function offByName(name) {
  try {
    const u = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(name)}&search_simple=1&action=process&json=1&page_size=1`;
    const r = await safeFetch(u, { headers: { 'Accept':'application/json' } });
    if (!r.ok) return null;
    const j = await r.json();
    const p = j?.products?.[0];
    return p?.image_front_url || p?.image_url || null;
  } catch { return null; }
}

/* ---------------------- Utils ---------------------- */

function haversine(a, b) {
  const toRad = d => d * Math.PI / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat), lat2 = toRad(b.lat);
  const x = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;
  return 2*R*Math.asin(Math.sqrt(x)); // km
}

async function safeFetch(url, opts = {}, timeoutMs = 9000, retries = 1) {
  for (let i=0;i<=retries;i++){
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(url, { ...opts, signal: ctrl.signal });
      clearTimeout(t);
      return res;
    } catch (e) {
      if (i === retries) throw e;
      await new Promise(r => setTimeout(r, 350));
    }
  }
}

// Minimal mock om MPK-nyckel saknas (så UI funkar i dev)
function mockData(q, city) {
  const now = new Date().toISOString().slice(0,10);
  const base = [
    { source:'MOCK', store:'ICA Maxi', product:'Kaffe 500g Mörkrost', price:19.9, priceText:'19.90 kr', city:city||'Stockholm', lastUpdated:now, image:null, lat:59.334, lng:18.063, url:null },
    { source:'MOCK', store:'Willys',   product:'Kaffe 500g Mörkrost', price:17.9, priceText:'17.90 kr', city:city||'Stockholm', lastUpdated:now, image:null, lat:59.306, lng:18.000, url:null },
    { source:'MOCK', store:'Coop',     product:'Kaffe 500g Mörkrost', price:21.9, priceText:'21.90 kr', city:city||'Stockholm', lastUpdated:now, image:null, lat:59.360, lng:18.050, url:null }
  ];
  return base.filter(x => (x.product || '').toLowerCase().includes(q.toLowerCase()));
}
