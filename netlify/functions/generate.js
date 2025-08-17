import OpenAI from "openai";

// JSONパース用
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/```json([\s\S]*?)```/i) || text.match(/```([\s\S]*?)```/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {}
    }
    return null;
  }
}

// OpenAIクライアント
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const { topic, backKind, extraKind, difficulty, count } = JSON.parse(event.body) || {};
  if (!topic || !count) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "topic and count are required" }),
    };
  }

  try {
    const cards = [];
    const existingTerms = [];

    for (let i = 0; i < count; i++) {
      const messages = [
        {
          role: "system",
          content: 'You generate concise study flashcards. Output strictly in JSON, no extra text, no Markdown, no code fences. Schema: {"cards":[{"front":string,"back":string,"extra":string}]}',
        },
        {
          role: "user",
          content: `「${topic}」に関する単語帳を作成してください。
出力形式は以下の3項目です：
1. front（${topic}に厳密に関連する具体的な単語、${topic}以外の無関係な単語は絶対に含めない）
2. back（${backKind || "説明"}として、具体的かつ実践的な説明を100～150文字程度で）
3. extra（${extraKind || "補足"}として、学習に役立つ詳細な補足を150～200文字程度で）
要望は「難易度：${difficulty || "中級"}、新しい単語でお願いします。既存単語[${existingTerms.join(", ")}]は除外してください。」で、1語分作成してください。
出力は自由な文章（形式に制限されない充実した内容）をJSON形式（{"cards":[{"front":string,"back":string,"extra":string}]})で、まとめてください。`,
        },
      ];

      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.5,
        max_tokens: 2000,
        messages,
      });

      const content = completion.choices?.[0]?.message?.content ?? "";
      const json = safeParseJSON(content);
      if (!json || !Array.isArray(json.cards) || json.cards.length !== 1) {
        return {
          statusCode: 502,
          body: JSON.stringify({ error: "Invalid response format", raw: content }),
        };
      }

      const card = json.cards[0];
      if (existingTerms.includes(card.front)) {
        i--;
        continue;
      }

      cards.push(card);
      existingTerms.push(card.front);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ cards }),
      headers: { "Content-Type": "application/json" },
    };
  } catch (err) {
    console.error("Generate error:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: String(err) }),
    };
  }
};