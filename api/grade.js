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

  const prompt = `You are a grader for an English-to-Korean translation test.

Both of these translation styles are equally valid and should receive full credit:
1. Literal translation that follows English word/information order (직역)
2. Natural Korean translation that conveys the same meaning fluently

Original English: ${original}
Student Korean translation: ${userTranslation}

Grading criteria:
1. Are all key words, phrases, and content included? (most important - deduct heavily for omissions)
2. Is the core meaning accurately conveyed?
3. Either English word order OR natural Korean order is fully acceptable
4. Minor grammar issues are OK as long as meaning is clear
5. Participial phrases like "producing..." can be translated as -면서, -하여, -한, etc. All are correct
6. Do NOT deduct points for proper nouns (people's names like Daguerre, Ansel Adams) or technical terms (daguerreotype, daguerreotypes) - accept any reasonable phonetic approximation or description
6. If the student's translation conveys the same meaning as the model answer, give high score (85+)
7. Do NOT penalize for different but equally valid Korean expressions of the same English phrase

PASS if score >= 75.

Respond with ONLY these 5 lines, no extra text:
SCORE: [number 0-100]
PASS: [true or false]
FEEDBACK: [one sentence in Korean - if score is 80+, give encouraging praise. Only mention errors if a KEY word/phrase is completely missing or meaning is wrong. Do NOT nitpick minor expression differences that still convey the same meaning]
LITERAL: [Korean translation that strictly follows English word order - translate each word/phrase in the EXACT order they appear in English even if unnatural. Example: Photography has undergone remarkable changes = 사진술은 겪어왔다 놀라운 변화들을]
NATURAL: [natural fluent Korean translation]`;

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
    const literalMatch = text.match(/LITERAL:\s*(.+)/);
    const naturalMatch = text.match(/NATURAL:\s*(.+)/);

    const result = {
      score: scoreMatch ? parseInt(scoreMatch[1]) : 50,
      pass: passMatch ? passMatch[1].toLowerCase() === 'true' : false,
      feedback: feedbackMatch ? feedbackMatch[1].trim() : '채점 완료',
      model_answer: (literalMatch ? '직독직해: ' + literalMatch[1].trim() : '') +
                    (naturalMatch ? '\n의역: ' + naturalMatch[1].trim() : '')
    };

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
