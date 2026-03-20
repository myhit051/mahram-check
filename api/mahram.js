// /api/mahram.js — Vercel Serverless Function
// Uses deterministic rule engine first, AI only for input normalization

import { check, lookupByKey } from "./lib/rule-engine.js";

export default async function handler(req, res) {
  // CORS headers for LIFF
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gender, input } = req.body;
  if (!gender || !input) return res.status(400).json({ error: "Missing gender or input" });

  // Step 1: Try deterministic rule engine
  const ruleResult = check(gender, input);
  if (ruleResult) {
    return res.status(200).json({ ...ruleResult, source: "database" });
  }

  // Step 2: Use AI to normalize input → canonical relationship key
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(200).json({
      mahram: null,
      type: "ไม่สามารถระบุได้",
      reason: "ไม่พบในฐานข้อมูล กรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น",
      source: "unknown",
    });
  }

  const genderThai = gender === "female" ? "ผู้หญิง" : "ผู้ชาย";

  // AI prompt: ONLY normalize input, NEVER judge mahram status
  const prompt = `คุณเป็นตัวแปลงภาษาไทยสำหรับความสัมพันธ์ในครอบครัว
ผู้ถามเป็น${genderThai}

จงแปลง "${input}" เป็นความสัมพันธ์มาตรฐานภาษาไทย

ตัวอย่าง:
- "อาม่าของผัว" → "ย่าสามี" หรือ "ยายสามี"
- "ภรรยาที่2 ของพ่อตา" → "ภรรยาที่ 2 ของพ่อตา" (แม่เลี้ยงของภรรยา ไม่ใช่แม่ยาย)
- "ลูกของอา" → "ลูกอา"
- "น้องสาวแม่" → "น้าสาว"
- "พี่ชายแม่" → "น้าชาย" หรือ "ลุงฝั่งแม่"
- "ลูกเลี้ยงที่ยังไม่ได้เข้าหอกับแม่เขา" → "ลูกเลี้ยงหญิง"

ห้ามตัดสินว่าเป็นมะหฺรอมหรือไม่ ทำได้แค่แปลงความสัมพันธ์เท่านั้น

ตอบเป็น JSON เท่านั้น:
{"normalized": "ความสัมพันธ์มาตรฐาน", "parsed_as": "คำอธิบายสั้นๆ"}
ถ้าแปลงไม่ได้: {"normalized": null, "parsed_as": null}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return res.status(200).json({
        mahram: null,
        type: "ไม่สามารถระบุได้",
        reason: "ไม่พบในฐานข้อมูล กรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น",
        source: "unknown",
      });
    }

    // Parse AI response
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error("Failed to parse Gemini response:", text);
      return res.status(200).json({
        mahram: null,
        type: "ไม่สามารถระบุได้",
        reason: "AI ไม่สามารถวิเคราะห์ได้ กรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น",
        source: "unknown",
      });
    }

    // Step 3: Use normalized key to look up in rule engine
    if (parsed.normalized) {
      const normalizedResult = lookupByKey(gender, parsed.normalized);
      if (normalizedResult) {
        return res.status(200).json({
          ...normalizedResult,
          source: "ai_parsed",
          parsed_as: parsed.parsed_as || parsed.normalized,
        });
      }
    }

    // Step 4: If still no match, return unknown
    return res.status(200).json({
      mahram: null,
      type: "ไม่สามารถระบุได้",
      reason: `ไม่พบ "${input}" ในฐานข้อมูล${parsed.parsed_as ? ` (AI แปลงเป็น: ${parsed.parsed_as})` : ""} กรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น`,
      source: "unknown",
    });
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
