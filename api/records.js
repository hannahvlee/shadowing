export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;

  if (!redisUrl || !redisToken) {
    return res.status(500).json({ error: 'Redis not configured' });
  }

  const redis = async (command) => {
    const r = await fetch(`${redisUrl}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${redisToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(command)
    });
    return r.json();
  };

  // GET by id - fetch single record
  if (req.method === 'GET' && req.query && req.query.id) {
    try {
      const allRes = await redis(['LRANGE', 'records', '0', '499']);
      const records = (allRes.result || []).map(r => {
        try { return JSON.parse(r); } catch { return null; }
      }).filter(Boolean);
      const record = records.find(r => String(r.id) === String(req.query.id));
      if (!record) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ record });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // GET - fetch all records
  if (req.method === 'GET') {
    try {
      const keysRes = await redis(['LRANGE', 'records', '0', '499']);
      const records = (keysRes.result || []).map(r => {
        try { return JSON.parse(r); } catch { return null; }
      }).filter(Boolean);
      return res.status(200).json({ records });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST - save a record
  if (req.method === 'POST') {
    try {
      const { name, track, mode, score, progress, details } = req.body || {};
      if (!name || !track || !mode) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const record = {
        id: Date.now(),
        name,
        track,
        mode,
        score,
        progress,
        details,
        date: new Date().toISOString()
      };

      await redis(['LPUSH', 'records', JSON.stringify(record)]);
      return res.status(200).json({ success: true, record });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // PATCH - update name
  if (req.method === 'PATCH') {
    try {
      const { name } = req.body || {};
      const id = req.query && req.query.id;
      if (!name || !id) return res.status(400).json({ error: 'Missing fields' });

      const allRes = await redis(['LRANGE', 'records', '0', '499']);
      const records = (allRes.result || []).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
      const idx = records.findIndex(r => String(r.id) === String(id));
      if (idx === -1) return res.status(404).json({ error: 'Not found' });

      records[idx].name = name;

      await redis(['DEL', 'records']);
      for (let i = records.length - 1; i >= 0; i--) {
        await redis(['LPUSH', 'records', JSON.stringify(records[i])]);
      }
      return res.status(200).json({ success: true });
    } catch(e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
