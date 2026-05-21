export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
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

  // GET - fetch all feedback
  if (req.method === 'GET') {
    try {
      const keysRes = await redis(['LRANGE', 'feedback', '0', '499']);
      const feedbacks = (keysRes.result || []).map(r => {
        try { return JSON.parse(r); } catch { return null; }
      }).filter(Boolean);
      return res.status(200).json({ feedbacks });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // POST - save feedback
  if (req.method === 'POST') {
    try {
      const { category, rating, name, message } = req.body;
      if (!category || !message) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const feedback = {
        id: Date.now(),
        category,
        rating: rating || null,
        name: name || '익명',
        message,
        date: new Date().toISOString()
      };

      await redis(['LPUSH', 'feedback', JSON.stringify(feedback)]);
      return res.status(200).json({ success: true, feedback });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
