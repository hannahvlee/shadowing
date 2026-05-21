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

  const prompt = `You are a grader for an English-to-Korean listening test.

Original English: ${original}
Student Korean translation: ${userTranslation}

This is a listening comprehension test where students practice 끊어읽기 (chunking-style direct translation following English word order).

Grading criteria:
1. The ONLY thing that matters is whether the student translated all key content words correctly. Word order and grammar do NOT matter.
2. COMPLETELY IGNORE: Korean grammar, naturalness, word endings (-은/는/을/를/한/하는 etc.), sentence structure, word order differences.
3. COMPLETELY IGNORE punctuation. STT cannot capture ?, ., ! - never penalize for missing punctuation.
4. COMPLETELY IGNORE proper nouns and technical terms - students can say anything for names, places, technical terms.
5. The student's answer was captured by speech-to-text (STT). If you see nonsensical words, assume STT error and ignore completely.
6. If the student's answer contains the same key content words as the CHUNKING model answer, give 90+ score.
7. Only deduct points if KEY CONTENT WORDS are completely missing or the meaning is fundamentally wrong.
8. Be VERY GENEROUS. The purpose is practicing direct translation, not perfect Korean grammar.

PASS if score >= 75.

Output exactly these 4 lines. For FEEDBACK: if score >= 80, write only "잘 했어요!" or similar short praise. If score < 80, write ONLY which specific content word is missing (e.g. "영화" 누락). NEVER mention grammar, word order, naturalness, or suggest improvements.

SCORE: 85
PASS: true
FEEDBACK: 핵심 내용이 잘 포함되어 있습니다.
CHUNKING: 사진술은 / 겪어왔다 / 놀라운 변화들을

Now output the same 4 lines for the actual sentence. CHUNKING must follow the ORIGINAL ENGLISH word order exactly — completely ignore the student's translation when writing CHUNKING. Split into meaning units with / between them. "going to" = "~할 것이다" (NOT movement). No brackets, no placeholder text, only real Korean.`;

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
    const feedbackMatch = text.match(/FEEDBACK:\s*([\s\S]+?)(?=\nCHUNKING:|$)/);
    const chunkingMatch = text.match(/CHUNKING:\s*([\s\S]+?)$/);

    const chunkingText = chunkingMatch ? chunkingMatch[1].trim() : '';

    // If translations are missing or look like placeholders, fetch them separately
    const isPlaceholder = (t) => !t || t.includes('[') || t.includes('waiting') || t.includes('write real') || t.length < 3;

    let finalChunking = chunkingText;

    if (isPlaceholder(chunkingText)) {
      try {
        const transRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 300,
            messages: [{ role: 'user', content: `Translate this English sentence to Korean in two ways. Output exactly 2 lines:
LITERAL: (Korean following English word order exactly)
NATURAL: (fluent natural Korean)

English: ${original}` }]
          })
        });
        const transData = await transRes.json();
        const transText = transData.content[0].text.trim();
        const chunkMatch = transText.match(/CHUNKING:\s*(.+)/);
        if (chunkMatch) finalChunking = chunkMatch[1].trim();
      } catch(e) {}
    }

    const result = {
      score: scoreMatch ? parseInt(scoreMatch[1]) : 50,
      pass: passMatch ? passMatch[1].toLowerCase() === 'true' : false,
      feedback: feedbackMatch ? feedbackMatch[1].trim() : '채점 완료',
      model_answer: finalChunking ? '끊어읽기: ' + finalChunking : ''
    };

    return res.status(200).json(result);

  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
