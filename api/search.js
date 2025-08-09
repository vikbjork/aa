export default async function handler(req, res) {
  const q = req.query.q || '';
  if (!q) return res.status(400).json({ error: 'No query provided' });

  try {
    // OBS: Här används Matpriskollen som exempel-API. Byt till din nyckel/metod.
    // Vi simulerar data i MVP eftersom Matpriskollen kräver API-key.
    // I skarp version: Hämta och parsa data från Matpriskollen eller annan källa.

    // EXEMPEL-DATA — ersätt med riktigt API-anrop:
    const exampleData = [
      { store: 'ICA Maxi', price: 19.90, product: 'Kaffe 500g', city: 'Stockholm', date: '2025-08-09' },
      { store: 'Willys', price: 17.90, product: 'Kaffe 500g', city: 'Stockholm', date: '2025-08-09' },
      { store: 'Coop', price: 21.90, product: 'Kaffe 500g', city: 'Stockholm', date: '2025-08-09' }
    ];

    // Filtrera baserat på sökord
    const filtered = exampleData.filter(item => 
      item.product.toLowerCase().includes(q.toLowerCase())
    );

    res.status(200).json(filtered);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
}
