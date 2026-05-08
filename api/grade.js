export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { original, userTranslation } = req.body;

  if (!original || !userTranslation) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `당신은 영어 직역 테스트 채점관입니다.

원문 (영어): "${original}"
학습자 번역 (한국어): "${userTranslation}"

다음 기준으로 채점해주세요:
1. 핵심 의미가 전달됐는가 (가장 중요)
2. 중요한 단어나 내용이 빠지지 않았는가
3. 순서나 표현이 다소 달라도 의미가 맞으면 OK

반드시 아래 JSON 형식으로만 답하세요 (다른 텍스트 없이):
{
  "score": 85,
  "pass": true,
  "feedback": "핵심 의미를 잘 전달했습니다.",
  "model_answer": "모범 번역 예시"
}`;

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
    // Extract JSON more robustly
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return res.status(500).json({ error: '채점 결과를 파싱할 수 없어요.' });
    }
    const result = JSON.parse(jsonMatch[0]);

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
