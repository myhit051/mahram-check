// ========== STATE ==========
var currentGender = null, currentResult = null, currentInput = "", searchHistory = [], historyOpen = false;

// ========== LIFF ==========
var liffReady = false;
(async function() {
  try {
    var id = "2009526885-XOQVgErD";
    if (id !== "YOUR_LIFF_ID") { await liff.init({ liffId: id }); liffReady = true; }
  } catch(e) { console.log("LIFF skip:", e.message); }
})();

// ========== RULE ENGINE ==========
function norm(t) {
  return t.trim().toLowerCase().replace(/\s+/g," ").replace(/ๆ/g,"")
    .replace(/ค่ะ|คะ|ครับ|นะ|จ้า|จ๋า|จ้ะ|หน่อย|ของฉัน|ของเรา|ของผม|ของดิฉัน|ของหนู/g,"")
    .replace(/เเ/g,"แ").trim();
}

function findDB(db, inp) {
  var n = norm(inp);
  if (!n) return null;
  for (var i = 0; i < db.length; i++) for (var j = 0; j < db[i].a.length; j++) if (norm(db[i].a[j]) === n) return db[i];
  for (var i = 0; i < db.length; i++) for (var j = 0; j < db[i].a.length; j++) {
    var na = norm(db[i].a[j]);
    if (na.length >= 3 && n.includes(na) && na.length >= n.length * 0.6) return db[i];
    if (n.length >= 4 && na.includes(n) && n.length >= na.length * 0.6) return db[i];
  }
  var cl = n.replace(/ของ|ที่เป็น|ซึ่งเป็น|คือ|กับ|และ|หรือ|ที่|เป็น/g," ").replace(/\s+/g," ").trim();
  if (cl !== n) {
    for (var i = 0; i < db.length; i++) for (var j = 0; j < db[i].a.length; j++) if (norm(db[i].a[j]) === cl) return db[i];
    for (var i = 0; i < db.length; i++) for (var j = 0; j < db[i].a.length; j++) {
      var na = norm(db[i].a[j]);
      if (na.length >= 3 && cl.includes(na) && na.length >= cl.length * 0.6) return db[i];
    }
  }
  return null;
}

function patMatch(g, inp) {
  var n = norm(inp);
  var P = [
    // Edge case: ภรรยา/เมียอื่นของพ่อตา (NOT mahram) — must be before general patterns
    {re:/(?:ภรรยา|เมีย)(?:ที่\s*\d+|ใหม่|อื่น|คนที่\s*\d+)?.*(?:ของ\s*)?(?:พ่อตา|พ่อสามี|พ่อผัว|พ่อของภรรยา|พ่อของเมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"ภรรยาอื่นของพ่อตา (แม่เลี้ยงของภรรยา) ไม่ใช่มะหฺรอม เฉพาะแม่แท้ของภรรยาเท่านั้นที่เป็นมะหฺรอม"}},
    {re:/(?:ภรรยา|เมีย)(?:ที่\s*\d+|ใหม่|อื่น|คนที่\s*\d+)?.*(?:ของ\s*)?(?:พ่อสามี|พ่อผัว|พ่อของสามี|พ่อของผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"ภรรยาอื่นของพ่อสามี (แม่เลี้ยงของสามี) ไม่ใช่มะหฺรอม"}},
    {re:/(?:แม่เลี้ยง).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"แม่เลี้ยงของภรรยา ไม่ใช่มะหฺรอม เฉพาะแม่แท้ของภรรยาเท่านั้นที่เป็นมะหฺรอม"}},
    {re:/(?:แม่เลี้ยง).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"แม่เลี้ยงของสามี ไม่ใช่มะหฺรอม"}},
    {re:/(?:พ่อเลี้ยง).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"พ่อเลี้ยงของภรรยา ไม่ใช่มะหฺรอม"}},
    {re:/(?:พ่อเลี้ยง).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"พ่อเลี้ยงของสามี ไม่ใช่มะหฺรอม"}},
    {re:/(?:แม่|มารดา).*(?:ของ\s*)?(?:แม่|มารดา|พ่อ|บิดา).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"ย่า/ยายของภรรยา (บรรพบุรุษหญิงทุกชั้น) เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:พ่อ|บิดา).*(?:ของ\s*)?(?:แม่|มารดา|พ่อ|บิดา).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"ปู่/ตาของภรรยา เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:แม่|มารดา).*(?:ของ\s*)?(?:แม่|มารดา|พ่อ|บิดา).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"ย่า/ยายของสามี (บรรพบุรุษหญิงทุกชั้น) เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:พ่อ|บิดา).*(?:ของ\s*)?(?:แม่|มารดา|พ่อ|บิดา).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"ปู่/ตาของสามี เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:แม่|มารดา).*(?:ของ\s*)?(?:แม่ภรรยา|แม่เมีย|แม่ยาย|พ่อภรรยา|พ่อเมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"ย่า/ยายของภรรยา เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:พ่อ|บิดา).*(?:ของ\s*)?(?:แม่ภรรยา|แม่เมีย|แม่ยาย|พ่อภรรยา|พ่อเมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"ปู่/ตาของภรรยา เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:แม่|มารดา).*(?:ของ\s*)?(?:พ่อสามี|พ่อผัว|แม่สามี|แม่ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"ย่า/ยายของสามี เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:พ่อ|บิดา).*(?:ของ\s*)?(?:พ่อสามี|พ่อผัว|แม่สามี|แม่ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"ปู่/ตาของสามี เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:พี่สาว|น้องสาว|พี่ชาย|น้องชาย|ลุง|ป้า|น้า|อา).*(?:ของ\s*)?(?:พ่อ|แม่|บิดา|มารดา).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"ญาติของพ่อ/แม่สามี ไม่ใช่มะหฺรอม"}},
    {re:/(?:พี่สาว|น้องสาว|พี่ชาย|น้องชาย|ลุง|ป้า|น้า|อา).*(?:ของ\s*)?(?:พ่อ|แม่|บิดา|มารดา).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"ญาติของพ่อ/แม่ภรรยา ไม่ใช่มะหฺรอม"}},
    {re:/ลูก(?:ชาย|สาว)?.*(?:ของ\s*)?(?:พี่ชาย|พี่สาว|น้องชาย|น้องสาว).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"ลูกของพี่น้องสามี ไม่ใช่มะหฺรอม"}},
    {re:/ลูก(?:ชาย|สาว)?.*(?:ของ\s*)?(?:พี่ชาย|พี่สาว|น้องชาย|น้องสาว).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"ลูกของพี่น้องภรรยา ไม่ใช่มะหฺรอม"}},
    {re:/(?:ลุง|อา|น้าชาย).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"ลุง/อา/น้าของสามี ไม่ใช่มะหฺรอม"}},
    {re:/(?:ป้า|อาหญิง|น้าสาว|น้าหญิง).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"ป้า/น้าของสามี ไม่ใช่มะหฺรอม"}},
    {re:/(?:ลุง|อา|น้าชาย).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"ลุง/อา/น้าของภรรยา ไม่ใช่มะหฺรอม"}},
    {re:/(?:ป้า|อาหญิง|น้าสาว|น้าหญิง).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"ป้า/น้าของภรรยา ไม่ใช่มะหฺรอม"}},
    {re:/(?:ปู่|ตา).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"ปู่/ตาของสามี เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:ย่า|ยาย).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"ย่า/ยายของภรรยา เป็นมะหฺรอมจากการสมรส"}},
    {re:/ลูก.*(?:ของ\s*)?ลูกพี่ลูกน้อง/,g:"both",r:{mahram:false,type:NOT_MAHRAM,reason:"ลูกของลูกพี่ลูกน้อง ไม่ใช่มะหฺรอม"}},
    {re:/(?:พี่ชาย|พี่|บัง).*(?:ของ\s*)?พ่อ/,g:"female",r:{mahram:true,type:NASAB,reason:"ลุงฝั่งพ่อ (العم) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:น้องชาย|น้อง).*(?:ของ\s*)?พ่อ/,g:"female",r:{mahram:true,type:NASAB,reason:"อาฝั่งพ่อ (العم) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:พี่ชาย|พี่|บัง).*(?:ของ\s*)?แม่/,g:"female",r:{mahram:true,type:NASAB,reason:"น้า/ลุงฝั่งแม่ (الخال) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:น้องชาย|น้อง).*(?:ของ\s*)?แม่/,g:"female",r:{mahram:true,type:NASAB,reason:"น้าชายฝั่งแม่ (الخال) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:พี่สาว|พี่).*(?:ของ\s*)?พ่อ/,g:"male",r:{mahram:true,type:NASAB,reason:"ป้าฝั่งพ่อ (العمة) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:น้องสาว|น้อง).*(?:ของ\s*)?พ่อ/,g:"male",r:{mahram:true,type:NASAB,reason:"อาหญิงฝั่งพ่อ (العمة) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:พี่สาว|พี่).*(?:ของ\s*)?แม่/,g:"male",r:{mahram:true,type:NASAB,reason:"ป้า/น้าสาวฝั่งแม่ (الخالة) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:น้องสาว|น้อง).*(?:ของ\s*)?แม่/,g:"male",r:{mahram:true,type:NASAB,reason:"น้าสาวฝั่งแม่ (الخالة) เป็นมะหฺรอมตลอดกาล"}},
    {re:/ลูกชาย.*(?:ของ\s*)?(?:พี่ชาย|พี่สาว|น้องชาย|น้องสาว)/,g:"female",r:{mahram:true,type:NASAB,reason:"หลานชาย (ลูกชายพี่น้อง) เป็นมะหฺรอมตลอดกาล"}},
    {re:/ลูกสาว.*(?:ของ\s*)?(?:พี่ชาย|พี่สาว|น้องชาย|น้องสาว)/,g:"male",r:{mahram:true,type:NASAB,reason:"หลานสาว (ลูกสาวพี่น้อง) เป็นมะหฺรอมตลอดกาล"}},
    {re:/ลูก.*(?:ของ\s*)?(?:ลุง|ป้า|น้า|อา)/,g:"both",r:{mahram:false,type:NOT_MAHRAM,reason:"ลูกพี่ลูกน้อง ไม่ใช่มะหฺรอม"}},
    {re:/สามี.*(?:ของ\s*)?(?:พี่สาว|น้องสาว|ป้า|น้า|อา)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"สามีของญาติฝ่ายหญิง ไม่ใช่มะหฺรอม"}},
    {re:/ภรรยา.*(?:ของ\s*)?(?:พี่ชาย|น้องชาย|ลุง|น้า|อา)|เมีย.*(?:ของ\s*)?(?:พี่ชาย|น้องชาย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"ภรรยาของญาติฝ่ายชาย ไม่ใช่มะหฺรอม"}},
    {re:/(?:พี่ชาย|น้องชาย|พี่|น้อง).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:false,type:NOT_MAHRAM,reason:"พี่น้องชายสามี ไม่ใช่มะหฺรอม 'พี่น้องสามีคือความตาย' (อัลบุคอรีย์)"}},
    {re:/(?:พี่สาว|น้องสาว|พี่|น้อง).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:false,type:NOT_MAHRAM,reason:"พี่น้องสาวภรรยา ไม่ใช่มะหฺรอม"}},
    {re:/(?:พ่อ|บิดา).*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"พ่อสามี เป็นมะหฺรอมจากการสมรส"}},
    {re:/(?:แม่|มารดา).*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"แม่ภรรยา เป็นมะหฺรอมจากการสมรส"}},
    {re:/ลูก(?:ชาย)?.*(?:ของ\s*)?(?:สามี|ผัว)/,g:"female",r:{mahram:true,type:MUSAHARAH,reason:"ลูกชายของสามี เป็นมะหฺรอมจากการสมรส"}},
    {re:/ลูก(?:สาว)?.*(?:ของ\s*)?(?:ภรรยา|เมีย)/,g:"male",r:{mahram:true,type:MUSAHARAH,reason:"ลูกสาวของภรรยา เป็นมะหฺรอมจากการสมรส"}},
    {re:/ลูกชาย.*(?:ของ\s*)?(?:ลูกชาย|ลูกสาว)/,g:"female",r:{mahram:true,type:NASAB,reason:"หลานชาย เป็นมะหฺรอมตลอดกาล"}},
    {re:/ลูกสาว.*(?:ของ\s*)?(?:ลูกชาย|ลูกสาว)/,g:"male",r:{mahram:true,type:NASAB,reason:"หลานสาว เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:พ่อ|บิดา).*(?:ของ\s*)?(?:พ่อ|แม่)/,g:"female",r:{mahram:true,type:NASAB,reason:"ปู่/ตา (الجد) เป็นมะหฺรอมตลอดกาล"}},
    {re:/(?:แม่|มารดา).*(?:ของ\s*)?(?:พ่อ|แม่)/,g:"male",r:{mahram:true,type:NASAB,reason:"ย่า/ยาย (الجدة) เป็นมะหฺรอมตลอดกาล"}},
  ];
  for (var i = 0; i < P.length; i++) {
    if ((P[i].g === "both" || P[i].g === g) && P[i].re.test(n)) return P[i].r;
  }
  return null;
}

function check(gender, input) {
  var db = gender === "female" ? FDB : MDB;
  var n = norm(input);
  var ofC = (n.match(/ของ/g) || []).length;
  var hasSp = /สามี|ผัว|ภรรยา|เมีย/.test(n);
  var compound = ofC >= 2 || n.length > 15 || (ofC >= 1 && hasSp);
  if (compound) { var p = patMatch(gender, input); if (p) return p; }
  var d = findDB(db, input);
  if (d) return { mahram: d.m, type: d.t, reason: d.r };
  if (!compound) { var p = patMatch(gender, input); if (p) return p; }
  return null;
}

// ========== AI FALLBACK ==========
async function aiCheck(gender, input) {
  try {
    var r = await fetch("/api/mahram", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gender: gender, input: input }) });
    if (!r.ok) throw 0;
    return await r.json();
  } catch(e) { return null; }
}

// ========== AUTOCOMPLETE ==========
var acIndex = -1;

function getAutocompleteSuggestions(inp) {
  if (!currentGender || !inp || inp.length < 1) return [];
  var db = currentGender === "female" ? FDB : MDB;
  var n = norm(inp);
  if (!n) return [];
  var results = [];
  var seen = {};
  for (var i = 0; i < db.length; i++) {
    for (var j = 0; j < db[i].a.length; j++) {
      var alias = db[i].a[j];
      var na = norm(alias);
      if (na.includes(n) || n.includes(na)) {
        var key = db[i].a[0];
        if (!seen[key]) {
          seen[key] = true;
          results.push({ text: db[i].a[0], mahram: db[i].m, type: db[i].t });
          if (results.length >= 8) return results;
        }
        break;
      }
    }
  }
  return results;
}

function renderAutocomplete() {
  var inp = document.getElementById("inputField").value.trim();
  var list = document.getElementById("autocompleteList");
  if (!inp || inp.length < 1) { list.innerHTML = ""; acIndex = -1; return; }
  var suggestions = getAutocompleteSuggestions(inp);
  if (!suggestions.length) { list.innerHTML = ""; acIndex = -1; return; }
  acIndex = -1;
  list.innerHTML = suggestions.map(function(s, i) {
    var iconCls = s.mahram ? "mahram" : "not-mahram";
    var icon = s.mahram ? "✓" : "✗";
    return '<div class="autocomplete-item" data-index="' + i + '" onclick="selectAutocomplete(\'' + s.text.replace(/'/g, "\\'") + '\')">' +
      '<span class="ac-icon ' + iconCls + '">' + icon + '</span>' +
      '<span class="ac-text">' + s.text + '</span>' +
      '<span class="ac-type">' + s.type + '</span></div>';
  }).join("");
}

function selectAutocomplete(text) {
  document.getElementById("inputField").value = text;
  document.getElementById("autocompleteList").innerHTML = "";
  acIndex = -1;
  document.getElementById("inputField").focus();
}

function handleAutocompleteKeys(e) {
  var list = document.getElementById("autocompleteList");
  var items = list.querySelectorAll(".autocomplete-item");
  if (!items.length) return;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    acIndex = Math.min(acIndex + 1, items.length - 1);
    updateActiveAC(items);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    acIndex = Math.max(acIndex - 1, -1);
    updateActiveAC(items);
  } else if (e.key === "Enter" && acIndex >= 0) {
    e.preventDefault();
    items[acIndex].click();
  } else if (e.key === "Escape") {
    list.innerHTML = "";
    acIndex = -1;
  }
}

function updateActiveAC(items) {
  for (var i = 0; i < items.length; i++) items[i].classList.toggle("active", i === acIndex);
  if (acIndex >= 0) items[acIndex].scrollIntoView({ block: "nearest" });
}

// ========== LOCALSTORAGE HISTORY ==========
var HISTORY_KEY = "mahram_history";

function saveHistory() {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(searchHistory)); } catch(e) {}
}

function loadHistory() {
  try {
    var saved = localStorage.getItem(HISTORY_KEY);
    if (saved) searchHistory = JSON.parse(saved);
  } catch(e) { searchHistory = []; }
}

function clearHistory() {
  searchHistory = [];
  historyOpen = false;
  try { localStorage.removeItem(HISTORY_KEY); } catch(e) {}
  hide("historyArea");
}

// ========== UI ==========
function selectGender(g) {
  currentGender = g;
  document.getElementById("genderScreen").style.display = "none";
  document.getElementById("mainScreen").style.display = "block";
  document.getElementById("genderBadge").textContent = g === "female" ? "♀ หญิง" : "♂ ชาย";
  document.getElementById("inputField").placeholder = g === "female" ? "เช่น พี่ชายของแม่, ลุง..." : "เช่น พี่สาวของพ่อ, ป้า...";
  renderTags();
  loadHistory();
  renderHist();
  setTimeout(function() { document.getElementById("inputField").focus(); }, 300);
}

function goBack() {
  currentGender = null; currentResult = null; currentInput = "";
  historyOpen = false;
  document.getElementById("genderScreen").style.display = "";
  document.getElementById("mainScreen").style.display = "none";
  document.getElementById("inputField").value = "";
  document.getElementById("autocompleteList").innerHTML = "";
  hide("resultArea"); hide("shareArea"); hide("historyArea");
}

function renderTags() {
  var cats = currentGender === "female" ? QF_CATS : QM_CATS;
  var html = "";
  for (var c = 0; c < cats.length; c++) {
    html += '<div class="quick-category">';
    html += '<div class="quick-cat-label">' + cats[c].label + '</div>';
    html += '<div class="quick-tags">';
    for (var t = 0; t < cats[c].tags.length; t++) {
      html += '<button class="quick-tag ' + cats[c].cls + '" onclick="setInp(\'' + cats[c].tags[t].replace(/'/g, "\\'") + '\')">' + cats[c].tags[t] + '</button>';
    }
    html += '</div></div>';
  }
  document.getElementById("quickTags").innerHTML = html;
}

function setInp(t) {
  document.getElementById("inputField").value = t;
  document.getElementById("autocompleteList").innerHTML = "";
  hide("resultArea"); hide("shareArea");
  document.getElementById("inputField").focus();
}

async function doCheck() {
  var inp = document.getElementById("inputField").value.trim();
  if (!inp || !currentGender) return;
  currentInput = inp;
  document.getElementById("autocompleteList").innerHTML = "";
  hide("resultArea"); hide("shareArea"); show("loadingArea");
  document.getElementById("checkBtn").disabled = true;
  document.getElementById("loadingText").textContent = "กำลังตรวจสอบ...";

  var res = check(currentGender, inp), src = "rule";
  if (!res) {
    document.getElementById("loadingText").textContent = "AI กำลังวิเคราะห์...";
    res = await aiCheck(currentGender, inp);
    src = res ? "ai" : "error";
    if (!res) res = { mahram: null, type: "ไม่สามารถระบุได้", reason: "ลองพิมพ์ใหม่ เช่น 'พี่ชายของแม่'" };
  }
  currentResult = { mahram: res.mahram, type: res.type, reason: res.reason, source: src, input: inp };
  searchHistory.unshift(currentResult);
  if (searchHistory.length > 15) searchHistory.pop();
  saveHistory();
  hide("loadingArea");
  document.getElementById("checkBtn").disabled = false;
  renderResult(res, src, inp);
  renderHist();
}

function renderResult(res, src, inp) {
  var cls = res.mahram === true ? "mahram" : res.mahram === false ? "not-mahram" : "unknown";
  var icon = res.mahram === true ? "🤝" : res.mahram === false ? "🚫" : "❓";
  var st = res.mahram === true ? "เป็นมะหฺรอม" : res.mahram === false ? "ไม่เป็นมะหฺรอม" : "ไม่สามารถระบุได้";
  var sub = res.mahram === true ? "จับมือสลามกันได้" : res.mahram === false ? "ไม่อนุญาตให้สัมผัส" : "กรุณาลองอีกครั้ง";
  var showQ = res.type && res.type !== NOT_MAHRAM && res.type !== SPOUSE && res.type !== "ไม่สามารถระบุได้";

  document.getElementById("resultArea").innerHTML =
    '<div class="result-wrap">' +
      '<div class="result-banner ' + cls + '">' +
        '<div class="result-icon">' + icon + '</div>' +
        '<div class="result-status ' + cls + '">' + st + '</div>' +
        '<div class="result-sub">' + sub + '</div>' +
      '</div>' +
      '<div class="detail-card">' +
        '<div class="detail-header">' +
          '<span class="detail-label">รายละเอียด</span>' +
          '<span class="detail-type">' + res.type + '</span>' +
        '</div>' +
        '<div class="detail-query">"' + inp + '"</div>' +
        '<div class="detail-reason">' + res.reason + '</div>' +
        (showQ ? '<div class="quran-ref">📖 อ้างอิง: ซูเราะฮฺ อันนิซาอฺ (4:23)</div>' : '') +
        '<div class="source-badge">' + (src === "rule" ? "📚 ฐานข้อมูล" : src === "ai" || src === "ai_parsed" ? "📚 ฐานข้อมูล + 🤖 AI แปลงภาษา" : src === "database" ? "📚 ฐานข้อมูล" : "") + '</div>' +
      '</div>' +
    '</div>';
  show("resultArea"); show("shareArea");
  document.getElementById("resultArea").scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderHist() {
  if (!searchHistory.length) { hide("historyArea"); return; }
  show("historyArea");
  document.getElementById("histCount").textContent = searchHistory.length;
  var list = document.getElementById("historyList");
  list.innerHTML = searchHistory.map(function(it, i) {
    var ic = it.mahram === true ? "🤝" : it.mahram === false ? "🚫" : "❓";
    return '<button class="history-item" onclick="replay(' + i + ')"><span class="history-icon">' + ic + '</span><span class="history-text">' + it.input + '</span><span class="history-src">' + (it.source === "rule" ? "📚" : "🤖") + '</span></button>';
  }).join("");
  if (historyOpen) list.classList.remove("hidden");
}

function toggleHistory() {
  historyOpen = !historyOpen;
  document.getElementById("historyList").classList.toggle("hidden", !historyOpen);
  document.getElementById("histArrow").classList.toggle("open", historyOpen);
}

function replay(i) {
  var it = searchHistory[i];
  if (!it) return;
  document.getElementById("inputField").value = it.input;
  renderResult(it, it.source, it.input);
}

function shareResult() {
  if (!currentResult) return;
  var ic = currentResult.mahram === true ? "🤝" : currentResult.mahram === false ? "🚫" : "❓";
  var st = currentResult.mahram === true ? "เป็นมะหฺรอม — จับมือสลามได้" : currentResult.mahram === false ? "ไม่เป็นมะหฺรอม — ไม่อนุญาตให้สัมผัส" : "ไม่สามารถระบุได้";
  var txt = ic + " มะหฺรอมเช็ค\n\nตรวจสอบ: \"" + currentResult.input + "\"\nผลลัพธ์: " + st + "\nประเภท: " + currentResult.type + "\nเหตุผล: " + currentResult.reason;
  if (liffReady && liff.isInClient()) {
    liff.shareTargetPicker([{ type: "text", text: txt }]).catch(function() { fallback(txt); });
  } else {
    fallback(txt);
  }
}

function fallback(txt) {
  if (navigator.share) {
    navigator.share({ title: "มะหฺรอมเช็ค", text: txt }).catch(function() {});
  } else {
    navigator.clipboard.writeText(txt).then(function() { alert("คัดลอกแล้ว!"); }).catch(function() {});
  }
}

function show(id) { document.getElementById(id).classList.remove("hidden"); }
function hide(id) { document.getElementById(id).classList.add("hidden"); }

// ========== INIT ==========
document.addEventListener("DOMContentLoaded", function() {
  var inputField = document.getElementById("inputField");
  inputField.addEventListener("input", renderAutocomplete);
  inputField.addEventListener("keydown", function(e) {
    if (e.key === "Enter") {
      var list = document.getElementById("autocompleteList");
      if (acIndex >= 0 && list.querySelectorAll(".autocomplete-item").length) {
        handleAutocompleteKeys(e);
      } else {
        list.innerHTML = "";
        doCheck();
      }
    } else {
      handleAutocompleteKeys(e);
    }
  });

  document.addEventListener("click", function(e) {
    if (!e.target.closest(".search-card")) {
      document.getElementById("autocompleteList").innerHTML = "";
      acIndex = -1;
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(function(e) {
      console.log("SW skip:", e.message);
    });
  }
});
