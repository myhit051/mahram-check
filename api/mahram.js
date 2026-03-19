// /api/mahram.js — Vercel Serverless Function
// Calls Gemini API to analyze mahram relationships

export default async function handler(req, res) {
  // CORS headers for LIFF
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { gender, input } = req.body;
  if (!gender || !input) return res.status(400).json({ error: "Missing gender or input" });

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) return res.status(500).json({ error: "API key not configured" });

  const genderThai = gender === "female" ? "ผู้หญิง" : "ผู้ชาย";

  const prompt = `คุณเป็นนักวิชาการอิสลามที่เชี่ยวชาญเรื่องมะหฺรอม (محرم) ตามหลักศาสนาอิสลาม

ผู้ถามเป็น${genderThai} ต้องการตรวจสอบว่า "${input}" เป็นมะหฺรอมของตนหรือไม่

กรุณาวิเคราะห์ตามหลักฟิกฮ์อิสลาม โดยพิจารณา:
1. มะหฺรอมสายเลือด (نسب) — ตามซูเราะฮฺ อันนิซาอฺ 4:23
2. มะหฺรอมสายนม (رضاعة) — ตามหะดีษ "สิ่งที่หะรอมจากสายเลือด หะรอมจากสายนม"
3. มะหฺรอมสายสมรส (مصاهرة) — พ่อแม่/ลูกหลานของคู่สมรส

ตอบเป็น JSON เท่านั้น ห้ามมี markdown, backtick, หรือข้อความอื่นนอกเหนือจาก JSON
รูปแบบ:
{"mahram": true/false, "type": "ประเภท", "reason": "เหตุผลสั้นๆ ภาษาไทย"}

ค่า type ที่เป็นไปได้: "สายเลือด (نسب)", "สายนม (رضاعة)", "สายสมรส (مصاهرة)", "ไม่ใช่มะหฺรอม", "คู่สมรส"
ถ้าไม่แน่ใจ: {"mahram": null, "type": "ไม่สามารถระบุได้", "reason": "เหตุผล"}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: "application/json",
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", JSON.stringify(data));
      return res.status(500).json({ error: "Gemini API error", details: data });
    }

    // Gemini 2.5 may return multiple parts (thinking + response)
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("\n");
    const clean = text.replace(/```json|```/g, "").trim();

    try {
      const parsed = JSON.parse(clean);
      return res.status(200).json(parsed);
    } catch {
      console.error("Failed to parse Gemini response:", text);
      return res.status(200).json({
        mahram: null,
        type: "ไม่สามารถระบุได้",
        reason: "AI ไม่สามารถวิเคราะห์ได้ กรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น",
      });
    }
  } catch (err) {
    console.error("Server error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
