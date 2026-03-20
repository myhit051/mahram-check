// /api/webhook.js — LINE Messaging API Webhook
// Auto-replies with mahram check results when users send messages

import { check, lookupByKey } from "./lib/rule-engine.js";

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_URL = "https://liff.line.me/2009526885-XOQVgErD";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Simple in-memory gender cache (resets on cold start — acceptable)
const userGenders = new Map();

async function reply(replyToken, messages) {
  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ replyToken, messages }),
  });
}

function makeFlexResult(input, result) {
  const isMahram = result.mahram === true;
  const isUnknown = result.mahram === null;
  const icon = isMahram ? "\u{1F91D}" : isUnknown ? "\u2753" : "\u{1F6AB}";
  const status = isMahram
    ? "เป็นมะหฺรอม"
    : isUnknown
    ? "ไม่สามารถระบุได้"
    : "ไม่เป็นมะหฺรอม";
  const statusColor = isMahram ? "#3a9e6e" : isUnknown ? "#8a7e74" : "#d45555";
  const sub = isMahram
    ? "จับมือสลามกันได้"
    : isUnknown
    ? "ลองถามใหม่ให้ชัดเจนขึ้น"
    : "ไม่อนุญาตให้สัมผัส";

  return {
    type: "flex",
    altText: `${icon} ${status}: "${input}"`,
    contents: {
      type: "bubble",
      size: "kilo",
      header: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: `${icon} มะหฺรอมเช็ค`, size: "sm", color: "#b8903e", weight: "bold" },
        ],
        paddingBottom: "none",
      },
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: `"${input}"`, size: "md", weight: "bold", wrap: true },
          { type: "text", text: status, size: "xl", weight: "bold", color: statusColor, margin: "md" },
          { type: "text", text: sub, size: "xs", color: "#8a7e74", margin: "xs" },
          { type: "separator", margin: "lg" },
          { type: "text", text: result.type, size: "sm", color: "#b8903e", margin: "lg", weight: "bold" },
          { type: "text", text: result.reason, size: "sm", color: "#555555", wrap: true, margin: "sm" },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: { type: "uri", label: "เปิดแอปตรวจสอบเพิ่มเติม", uri: LIFF_URL },
            style: "primary",
            color: "#d4a853",
            height: "sm",
          },
        ],
      },
    },
  };
}

function makeWelcome() {
  return {
    type: "flex",
    altText: "🤝 มะหฺรอมเช็ค — ตรวจสอบว่าจับมือสลามกันได้ไหม",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "🤝 มะหฺรอมเช็ค", size: "lg", weight: "bold", color: "#b8903e" },
          { type: "text", text: "ตรวจสอบว่าจับมือสลามกันได้ไหม\nตามหลักอิสลาม", size: "sm", color: "#555555", wrap: true, margin: "md" },
          { type: "separator", margin: "lg" },
          { type: "text", text: "💬 พิมพ์ความสัมพันธ์ส่งมาได้เลย เช่น", size: "sm", color: "#8a7e74", margin: "lg" },
          { type: "text", text: "• ลุง\n• พี่ชายของสามี\n• ลูกพี่ลูกน้อง\n• แม่ยาย", size: "sm", color: "#555555", margin: "sm", wrap: true },
        ],
      },
      footer: {
        type: "box",
        layout: "vertical",
        contents: [
          {
            type: "button",
            action: { type: "uri", label: "เปิดแอปเต็ม (เลือกเพศได้)", uri: LIFF_URL },
            style: "primary",
            color: "#d4a853",
            height: "sm",
          },
        ],
      },
    },
  };
}

// Infer gender from input text
function inferGender(text) {
  if (/สามี|ผัว|พ่อสามี|พ่อผัว|พี่ชายสามี|น้องชายสามี|พี่สามี|น้องสามี/.test(text)) return "female";
  if (/ภรรยา|เมีย|แม่ยาย|แม่เมีย|พี่สาวภรรยา|น้องสาวภรรยา|พ่อตา/.test(text)) return "male";
  return null;
}

// AI normalization (same as in mahram.js but called directly)
async function aiNormalize(input, gender) {
  if (!GEMINI_API_KEY) return null;
  const genderThai = gender === "female" ? "ผู้หญิง" : "ผู้ชาย";
  const prompt = `คุณเป็นตัวแปลงภาษาไทยสำหรับความสัมพันธ์ในครอบครัว
ผู้ถามเป็น${genderThai}

จงแปลง "${input}" เป็นความสัมพันธ์มาตรฐานภาษาไทย
ห้ามตัดสินว่าเป็นมะหฺรอมหรือไม่ ทำได้แค่แปลงความสัมพันธ์เท่านั้น

ตอบเป็น JSON เท่านั้น:
{"normalized": "ความสัมพันธ์มาตรฐาน", "parsed_as": "คำอธิบายสั้นๆ"}
ถ้าแปลงไม่ได้: {"normalized": null, "parsed_as": null}`;

  try {
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0, maxOutputTokens: 256, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    const data = await resp.json();
    if (!resp.ok) return null;
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map(p => p.text || "").join("\n").replace(/```json|```/g, "").trim();
    return JSON.parse(text);
  } catch { return null; }
}

// Full check: rule engine → AI normalize → rule engine again
async function fullCheck(gender, input) {
  // Step 1: Direct rule engine
  const result = check(gender, input);
  if (result) return { ...result, source: "database" };

  // Step 2: AI normalization → rule engine
  const parsed = await aiNormalize(input, gender);
  if (parsed?.normalized) {
    const normalized = lookupByKey(gender, parsed.normalized);
    if (normalized) return { ...normalized, source: "ai_parsed", parsed_as: parsed.parsed_as };
  }

  return null;
}

function makeGenderAsk(pendingInput) {
  return {
    type: "text",
    text: `🤝 มะหฺรอมเช็ค\n\nกรุณาเลือกเพศของคุณก่อนนะคะ\n(ผลลัพธ์จะแตกต่างกันตามเพศผู้ถาม)`,
    quickReply: {
      items: [
        { type: "action", action: { type: "message", label: "♂ ผู้ชาย", text: `เพศ:ชาย ${pendingInput}` } },
        { type: "action", action: { type: "message", label: "♀ ผู้หญิง", text: `เพศ:หญิง ${pendingInput}` } },
      ],
    },
  };
}

export default async function handler(req, res) {
  if (req.method === "GET") return res.status(200).send("OK");
  if (req.method !== "POST") return res.status(405).end();

  const events = req.body?.events || [];

  for (const event of events) {
    // Follow / Join — send welcome
    if (event.type === "follow" || event.type === "join") {
      await reply(event.replyToken, [makeWelcome()]);
      continue;
    }

    // Text message
    if (event.type === "message" && event.message?.type === "text") {
      const raw = event.message.text.trim();
      const userId = event.source?.userId;

      // "เปลี่ยนเพศ" — reset gender
      if (/^เปลี่ยนเพศ$/i.test(raw)) {
        if (userId) userGenders.delete(userId);
        await reply(event.replyToken, [{
          type: "text",
          text: "รีเซ็ตเพศแล้ว ครั้งต่อไปจะถามเพศใหม่ค่ะ",
        }]);
        continue;
      }

      // "มะหฺรอม" or "mahram" — show welcome/help
      if (/^(มะหฺรอม|มะห์รอม|mahram|เมนูมะหฺรอม)$/i.test(raw)) {
        await reply(event.replyToken, [makeWelcome()]);
        continue;
      }

      // Gender selection from Quick Reply: "เพศ:ชาย ..." or "เพศ:หญิง ..."
      const genderMatch = raw.match(/^เพศ:(ชาย|หญิง)\s*(.*)$/);
      if (genderMatch) {
        const gender = genderMatch[1] === "ชาย" ? "male" : "female";
        if (userId) userGenders.set(userId, gender);
        const pendingInput = genderMatch[2]?.trim();
        if (pendingInput) {
          // Process the pending query with selected gender
          try {
            const result = await fullCheck(gender, pendingInput);
            if (result) {
              await reply(event.replyToken, [makeFlexResult(pendingInput, result)]);
            } else {
              await reply(event.replyToken, [{
                type: "text",
                text: `❓ ไม่พบ "${pendingInput}" ในฐานข้อมูล\nกรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น\n\nหรือเปิดแอปเต็ม:\n${LIFF_URL}`,
              }]);
            }
          } catch {
            await reply(event.replyToken, [{ type: "text", text: `🤝 เปิดแอปเพื่อตรวจสอบ:\n${LIFF_URL}` }]);
          }
        } else {
          await reply(event.replyToken, [{ type: "text", text: `✅ บันทึกเพศ: ${genderMatch[1]}\nพิมพ์ "เช็ค ..." เพื่อตรวจสอบได้เลยค่ะ` }]);
        }
        continue;
      }

      // Prefix trigger: "เช็ค ..." or "#..."
      const prefixMatch = raw.match(/^(?:เช็ค|เช็ก|check)\s+(.+)$/i) || raw.match(/^#\s*(.+)$/);
      if (!prefixMatch) continue;

      const input = prefixMatch[1].trim();
      if (!input) continue;

      // Determine gender: cached > inferred > ask
      let gender = userId ? userGenders.get(userId) : null;
      if (!gender) gender = inferGender(input);

      if (!gender) {
        // Ask gender with Quick Reply
        await reply(event.replyToken, [makeGenderAsk(input)]);
        continue;
      }

      // Store inferred gender for future use
      if (userId && !userGenders.has(userId)) userGenders.set(userId, gender);

      // Process with rule engine
      try {
        const result = await fullCheck(gender, input);
        if (result) {
          await reply(event.replyToken, [makeFlexResult(input, result)]);
        } else {
          await reply(event.replyToken, [{
            type: "text",
            text: `❓ ไม่พบ "${input}" ในฐานข้อมูล\nกรุณาลองพิมพ์ใหม่ให้ชัดเจนขึ้น\n\nหรือเปิดแอปเต็ม:\n${LIFF_URL}`,
          }]);
        }
      } catch {
        await reply(event.replyToken, [{ type: "text", text: `🤝 เปิดแอปเพื่อตรวจสอบ:\n${LIFF_URL}` }]);
      }
    }
  }

  return res.status(200).json({ status: "ok" });
}
