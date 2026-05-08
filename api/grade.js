export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { original, userTranslation } = req.body;
  if (!original || !userTranslation) return res.status(400).json({ error: 'Missing fields' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' });

  const prompt = `You are an English-to-Korean translation test grader.

Original English: ${original}
Student Korean translation: ${userTranslation}

Grade based on:
1. Are the key meanings conveyed? (most important)
2. Are important words/content missing?
3. Different word order or phrasing is OK if meaning is correct

Respond with ONLY these 4 lines, nothing else:
SCORE: [number 0-100]
PASS: [true or false]
FEEDBACK: [one sentence feedback in Korean, no quotes or special characters]
MODEL: [example Korean translation, no quotes or special characters]`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'API error' });
    }

    const text = data.content[0].text.trim();

    // Parse line-by-line instead of JSON
    const scoreMatch = text.match(/SCORE:\s*(\d+)/);
    const passMatch = text.match(/PASS:\s*(true|false)/i);
    const feedbackMatch = text.match(/FEEDBACK:\s*(.+)/);
    const modelMatch = text.match(/MODEL:\s*(.+)/);

    const result = {
      score: scoreMatch ? parseInt(scoreMatch[1]) : 50,
      pass: passMatch ? passMatch[1].toLowerCase() === 'true' : false,
      feedback: feedbackMatch ? feedbackMatch[1].trim() : '채점 완료',
      model_answer: modelMatch ? modelMatch[1].trim() : ''
    };

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
