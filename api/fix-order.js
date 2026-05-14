export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'GET') return res.status(405).end();

  const redisUrl = process.env.KV_REST_API_URL;
  const redisToken = process.env.KV_REST_API_TOKEN;

  const redis = async (command) => {
    const r = await fetch(`${redisUrl}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${redisToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    return r.json();
  };

  try {
    const allRes = await redis(['LRANGE', 'records', '0', '499']);
    const records = (allRes.result || []).map(r => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);

    // 날짜 기준 최신순 정렬
    records.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 재저장
    await redis(['DEL', 'records']);
    for (let i = records.length - 1; i >= 0; i--) {
      await redis(['LPUSH', 'records', JSON.stringify(records[i])]);
    }

    return res.status(200).json({ success: true, count: records.length });
  } catch(e) {
    return res.status(500).json({ error: e.message });
  }
}
