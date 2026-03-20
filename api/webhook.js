// /api/webhook.js — LINE Messaging API Webhook
// Auto-replies with mahram check results when users send messages

const CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LIFF_URL = "https://liff.line.me/2009526885-XOQVgErD";

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
    altText: "☪ มะหฺรอมเช็ค — ตรวจสอบว่าจับมือสลามกันได้ไหม",
    contents: {
      type: "bubble",
      size: "kilo",
      body: {
        type: "box",
        layout: "vertical",
        contents: [
          { type: "text", text: "☪ มะหฺรอมเช็ค", size: "lg", weight: "bold", color: "#b8903e" },
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

    // Text message — only respond to mahram-related triggers
    if (event.type === "message" && event.message?.type === "text") {
      const raw = event.message.text.trim();

      // "มะหฺรอม" or "mahram" — show welcome/help
      if (/^(มะหฺรอม|มะห์รอม|mahram|เมนูมะหฺรอม)$/i.test(raw)) {
        await reply(event.replyToken, [makeWelcome()]);
        continue;
      }

      // Prefix trigger: "เช็ค ..." or "#..."
      const prefixMatch = raw.match(/^(?:เช็ค|เช็ก|check)\s+(.+)$/i) || raw.match(/^#\s*(.+)$/);
      if (!prefixMatch) continue; // Not a mahram command — ignore, let other systems handle

      const input = prefixMatch[1].trim();
      if (!input) continue;

      // Call our own mahram API (default to female perspective for chat)
      try {
        const apiUrl = `https://${req.headers.host}/api/mahram`;
        const apiRes = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gender: "female", input }),
        });
        const result = await apiRes.json();

        if (result.error) {
          await reply(event.replyToken, [
            { type: "text", text: `❌ เกิดข้อผิดพลาด กรุณาลองใหม่\n\nหรือเปิดแอปเต็ม:\n${LIFF_URL}` },
          ]);
        } else {
          await reply(event.replyToken, [makeFlexResult(input, result)]);
        }
      } catch {
        await reply(event.replyToken, [
          { type: "text", text: `☪ มะหฺรอมเช็ค\n\nเปิดแอปเพื่อตรวจสอบ:\n${LIFF_URL}` },
        ]);
      }
    }
  }

  return res.status(200).json({ status: "ok" });
}
