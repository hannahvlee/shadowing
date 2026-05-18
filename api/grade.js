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
6. COMPLETELY IGNORE proper nouns and technical terms when grading - these include people's names (Daguerre, Ansel Adams), technical terms (daguerreotype, daguerreotypes, bonding social capital, bridging social capital, social capital, bonding, bridging), place names, etc. The student can say anything for these (even just "d의" or "그 사람의") and it should NOT affect the score at all. Only grade the non-proper-noun content.
7. The student's answer was captured by speech-to-text (STT) which often mishears words. If you see nonsensical words or phrases, assume STT error and ignore them completely when grading.
6. If the student's translation conveys the same meaning as the model answer, give high score (85+)
7. Do NOT penalize for different but equally valid Korean expressions of the same English phrase

PASS if score >= 75.

CRITICAL: You MUST always output ALL 5 lines below, no matter how short or simple the sentence is. Even for sentence fragments like "For example, in ancient Rome." — always provide LITERAL and NATURAL.

Respond with ONLY these 5 lines, no extra text:
SCORE: [number 0-100]
PASS: [true or false]
FEEDBACK: [one sentence in Korean - focus ONLY on whether key content words are included or missing. Do NOT comment on Korean naturalness, grammar structure, or word order - this is a direct translation (직역) test so unnatural Korean order is totally fine. If score is 80+, give brief encouraging praise. Only mention if a KEY word/phrase is completely missing or meaning is significantly wrong.]
LITERAL: write real Korean here following English word order, no brackets (example: 사진술은 겪어왔다 놀라운 변화들을)
NATURAL: write real fluent Korean here, no brackets`;

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
        max_tokens: 600,
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
    const feedbackMatch = text.match(/FEEDBACK:\s*([\s\S]+?)(?=\nLITERAL:|\nNATURAL:|$)/);
    const literalMatch = text.match(/LITERAL:\s*([\s\S]+?)(?=\nNATURAL:|$)/);
    const naturalMatch = text.match(/NATURAL:\s*([\s\S]+?)$/);

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
