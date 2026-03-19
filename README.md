# ☪ มะหฺรอมเช็ค — Mahram Check LIFF App

ตรวจสอบความเป็นมะหฺรอมตามหลักอิสลาม ว่าจับมือสลามกันได้หรือไม่

## สถาปัตยกรรม

```
┌─────────────────────────────────────┐
│          LINE LIFF App              │
│  (public/index.html — static)      │
│                                     │
│  ┌─────────────┐  ┌──────────────┐ │
│  │ Rule-based  │  │  AI Fallback │ │
│  │ (ฐานข้อมูล)  │  │  (Gemini)    │ │
│  └─────────────┘  └──────┬───────┘ │
└──────────────────────────┼─────────┘
                           │
                    /api/mahram
                    (Vercel Serverless)
                           │
                    Google Gemini API
```

## ขั้นตอนการ Deploy

### 1️⃣ สมัคร Gemini API Key

1. ไปที่ https://aistudio.google.com/apikey
2. กด **Create API Key**
3. เก็บ key ไว้ (จะใช้ในขั้นตอน Vercel)

### 2️⃣ Deploy บน Vercel

1. Push โค้ดขึ้น GitHub:
   ```bash
   cd mahram-liff
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/mahram-check.git
   git push -u origin main
   ```

2. ไปที่ https://vercel.com → **Add New Project**
3. Import repo จาก GitHub
4. ตั้ง **Environment Variables**:
   - `GEMINI_API_KEY` = (API key จากขั้นตอน 1)
5. กด **Deploy**
6. จด URL ที่ได้ เช่น `https://mahram-check.vercel.app`

### 3️⃣ สร้าง LINE LIFF App

1. ไปที่ https://developers.line.biz/console/
2. สร้าง **Provider** ใหม่ (ถ้ายังไม่มี)
3. สร้าง **Channel** ประเภท **LINE Login**
4. ไปที่แท็บ **LIFF** → กด **Add**
5. กรอกข้อมูล:
   - **LIFF app name**: มะหฺรอมเช็ค
   - **Size**: Full
   - **Endpoint URL**: `https://mahram-check.vercel.app` (URL จาก Vercel)
   - **Scopes**: ติ๊ก `chat_message.write` (สำหรับแชร์)
6. กด **Add** → จะได้ **LIFF ID** (ตัวเลขยาวๆ)

### 4️⃣ ใส่ LIFF ID ในโค้ด

แก้ไฟล์ `public/index.html` บรรทัดที่มี:
```js
const liffId = "YOUR_LIFF_ID";
```
เปลี่ยนเป็น LIFF ID ที่ได้จากขั้นตอน 3 แล้ว push ขึ้น GitHub อีกครั้ง

### 5️⃣ สร้าง Rich Menu / แชร์ลิงก์

ลิงก์เปิด LIFF App:
```
https://liff.line.me/YOUR_LIFF_ID
```

สามารถใส่ลิงก์นี้ใน:
- Rich Menu ของ LINE Official Account
- ข้อความ Flex Message
- แชร์ตรงในแชท

## โครงสร้างไฟล์

```
mahram-liff/
├── api/
│   └── mahram.js          # Vercel Serverless — เรียก Gemini API
├── public/
│   └── index.html         # LIFF App หลัก (HTML + CSS + JS รวมไฟล์เดียว)
├── .env.example            # ตัวอย่าง environment variables
├── package.json
├── vercel.json             # Vercel routing config
└── README.md
```

## ค่าใช้จ่าย

| รายการ | ค่าใช้จ่าย |
|--------|-----------|
| Vercel Hosting | ฟรี (Hobby plan) |
| Gemini API | ฟรี (15 RPM / 1M tokens/day) |
| LINE LIFF | ฟรี |
| **รวม** | **ฟรี** |

## หมายเหตุ

- Rule-based ทำงานได้ทันทีโดยไม่ต้องเรียก API (ครอบคลุม ~90% ของคำถาม)
- AI จะทำงานเฉพาะเมื่อ rule-based หาคำตอบไม่ได้
- Gemini API free tier จำกัด 15 requests/นาที — เพียงพอสำหรับการใช้งานทั่วไป
