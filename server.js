import dotenv from 'dotenv';
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import OpenAI from "openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(cors());

// 静的ファイル配信
app.use(express.static(path.join(__dirname, "public")));

// OpenAIクライアント
const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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

// 単語帳生成エンドポイント
app.post("/api/generate", async (req, res) => {
  const { topic, backKind, extraKind, request, count } = req.body || {};
  if (!topic || !count) {
    return res.status(400).json({ error: "topic and count are required" });
  }

  try {
    const cards = [];
    const existingTerms = []; // 重複防止用

    for (let i = 0; i < count; i++) {
      const messages = [
        {
          role: "system",
          content: 'You generate concise study flashcards. Output strictly in JSON, no extra text, no Markdown, no code fences. Schema: {"cards":[{"front":string,"back":string,"extra":string}]}'
        },
        {
          role: "user",
          content: `「${topic}」に関する単語帳を作成してください。
出力形式は以下の3項目です：
1. front（${topic}に厳密に関連する具体的な単語、${topic}以外の無関係な単語は絶対に含めない）
2. back（${backKind || "説明"}として、具体的かつ実践的な説明。文章を記述すべきか単語のみを載せるべきかなどは条件によって判断して）
3. extra（${extraKind || "補足"}として、学具体的かつ実践的な説明。文章を記述すべきか単語のみを載せるべきかなどは条件によって判断して）

要望は「${request || "中級"}、新しい単語でお願いします。既存単語[${existingTerms.join(", ")}]は除外してください。」で、1語分作成してください。
出力は自由な文章（形式に制限されない充実した内容）をJSON形式（{"cards":[{"front":string,"back":string,"extra":string}]})で、まとめてください。`
        }
      ];

      console.log("Generate prompt:", messages[1].content); // デバッグ用

      const completion = await client.chat.completions.create({
        model: "gpt-4o",
        temperature: 0.7, // 修正2: 0.5 → 0.7
        max_tokens: 2000,
        messages,
      });

      const content = completion.choices?.[0]?.message?.content ?? "";
      console.log("Generate response:", content); // デバッグ用

      const json = safeParseJSON(content);
      if (!json || !Array.isArray(json.cards) || json.cards.length !== 1) {
        return res.status(502).json({ error: "Invalid response format", raw: content });
      }

      const card = json.cards[0];
      if (existingTerms.includes(card.front)) {
        i--; // 重複したらリトライ
        continue;
      }

      cards.push(card);
      existingTerms.push(card.front);
    }

    res.json({ cards });
  } catch (err) {
    console.error("Generate error:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post('/api/regen', async (req, res) => {
  const { topic, backKind, extraKind, request, front, target, back, extra, existingTerms } = req.body || {};
  if (!topic || !target) return res.status(400).json({ error: 'Topic and target are required' });
  if (target !== 'all' && !front) return res.status(400).json({ error: 'Front is required for partial regeneration' });

  console.log('Regen request:', { topic, backKind, extraKind, request, front, target, back, extra, existingTerms });
  try {
    let dynamicRequest = request || '中級';
    dynamicRequest += ', 無関係な単語は絶対に含めない。';
    if (target === 'back' && front) {
      dynamicRequest += `, 単語は"${front}"を厳密に保持（変更不可）`;
    } else if (target === 'extra' && front) {
      dynamicRequest += `, 単語は"${front}"を厳密に保持（変更不可）`;
    } else if (target === 'all' && existingTerms) {
      dynamicRequest += `, 新しい単語でお願いします。既存単語[${existingTerms.join(', ')}]は除外`;
    } else if (target === 'all') {
      dynamicRequest += ', 新しい単語でお願いします';
    }

    const messages = [
      {
        role: 'system',
        content: 'You generate concise study flashcards. Output strictly in JSON, no extra text, no Markdown, no code fences. Schema: {"cards":[{"front":string,"back":string,"extra":string}]}'
      },
      {
        role: 'user',
        content: `「${topic}」に関する単語帳を作成してください。
出力形式は以下の3項目です：
1. front（${topic}に厳密に関連する具体的な単語、${topic}以外の無関係な単語は絶対に含めない）
2. back（${backKind || "説明"}として、具体的かつ実践的な説明。文章を記述すべきか単語のみを載せるべきかなどは条件によって判断して）
3. extra（${extraKind || "補足"}として、学習に役立つ詳細な補足。文章を記述すべきか単語のみを載せるべきかなど条件によって判断して）

要望は「${dynamicRequest}」で、1語分作成してください。
出力は自由な文章（形式に制限されない充実した内容）をJSON形式（{"cards":[{"front":string,"back":string,"extra":string}]})で、まとめてください。`
      }
    ];
    console.log('Regen prompt:', messages[1].content);

    const completion = await client.chat.completions.create({
      model: 'gpt-4o',
      temperature: 0.7,
      max_tokens: 2000,
      messages,
    });
    const content = completion.choices?.[0]?.message?.content ?? '';
    console.log('Regen raw response:', content);
    const json = safeParseJSON(content);
    if (!json || !Array.isArray(json.cards) || json.cards.length !== 1) {
      return res.status(502).json({ error: 'Invalid response format', raw: content });
    }
    const card = json.cards[0];
    if (target !== 'all' && card.front !== front) {
      console.warn('Front word mismatch:', { expected: front, got: card.front });
      return res.status(502).json({ error: `Front word mismatch (expected: ${front}, got: ${card.front})`, raw: content });
    }
    if (target === 'all' && existingTerms && existingTerms.includes(card.front)) {
      return res.status(502).json({ error: 'Generated duplicate term', raw: content });
    }
    // 保持項目を上書き（targetに応じて）
    if (target === 'back' && extra) card.extra = extra;
    if (target === 'extra' && back) card.back = back;
    res.json({ card });
  } catch (err) {
    console.error('Regen error:', err);
    res.status(500).json({ error: String(err) });
  }
});

const PORT = process.env.PORT || 5173; // Vercelは環境変数のPORTを使う
app.listen(PORT, () => {
  console.log(`Wordbook proto running at http://localhost:${PORT}`);
  console.log("Remember to set OPENAI_API_KEY in your environment.");
});