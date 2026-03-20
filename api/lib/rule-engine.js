// ========== SERVER-SIDE RULE ENGINE ==========
// Mirrors client-side logic from app.js but runs on the server
// AI NEVER decides mahram — only this engine decides

import { FDB, MDB, getPatterns } from "./mahram-db.js";

// Normalize Thai text for matching
function norm(t) {
  return t.trim().toLowerCase().replace(/\s+/g, " ").replace(/ๆ/g, "")
    .replace(/ค่ะ|คะ|ครับ|นะ|จ้า|จ๋า|จ้ะ|หน่อย|ของฉัน|ของเรา|ของผม|ของดิฉัน|ของหนู/g, "")
    .replace(/เเ/g, "แ").trim();
}

// Direct alias lookup
function findDB(db, inp) {
  const n = norm(inp);
  if (!n) return null;

  // Exact match
  for (const entry of db) {
    for (const alias of entry.a) {
      if (norm(alias) === n) return entry;
    }
  }

  // Fuzzy match
  for (const entry of db) {
    for (const alias of entry.a) {
      const na = norm(alias);
      if (na.length >= 3 && n.includes(na) && na.length >= n.length * 0.6) return entry;
      if (n.length >= 4 && na.includes(n) && n.length >= na.length * 0.6) return entry;
    }
  }

  // Clean connectors and try again
  const cl = n.replace(/ของ|ที่เป็น|ซึ่งเป็น|คือ|กับ|และ|หรือ|ที่|เป็น/g, " ").replace(/\s+/g, " ").trim();
  if (cl !== n) {
    for (const entry of db) {
      for (const alias of entry.a) {
        if (norm(alias) === cl) return entry;
      }
    }
    for (const entry of db) {
      for (const alias of entry.a) {
        const na = norm(alias);
        if (na.length >= 3 && cl.includes(na) && na.length >= cl.length * 0.6) return entry;
      }
    }
  }

  return null;
}

// Pattern matching for compound relationships
function patMatch(gender, inp) {
  const n = norm(inp);
  const patterns = getPatterns();
  for (const p of patterns) {
    if ((p.g === "both" || p.g === gender) && p.re.test(n)) return p.r;
  }
  return null;
}

// Main check function — deterministic, no AI
function check(gender, input) {
  const db = gender === "female" ? FDB : MDB;
  const n = norm(input);
  const ofCount = (n.match(/ของ/g) || []).length;
  const hasSpouse = /สามี|ผัว|ภรรยา|เมีย/.test(n);
  const compound = ofCount >= 2 || n.length > 15 || (ofCount >= 1 && hasSpouse);

  // For compound terms, try pattern first
  if (compound) {
    const p = patMatch(gender, input);
    if (p) return p;
  }

  // Direct DB lookup
  const d = findDB(db, input);
  if (d) return { mahram: d.m, type: d.t, reason: d.r };

  // For simple terms that didn't match DB, try pattern
  if (!compound) {
    const p = patMatch(gender, input);
    if (p) return p;
  }

  return null;
}

// Lookup by canonical key from AI normalization
function lookupByKey(gender, key) {
  const db = gender === "female" ? FDB : MDB;
  const nkey = norm(key);
  if (!nkey) return null;

  // Try to find by alias match
  const d = findDB(db, key);
  if (d) return { mahram: d.m, type: d.t, reason: d.r };

  // Also try pattern match
  const p = patMatch(gender, key);
  if (p) return p;

  return null;
}

export { check, lookupByKey, norm };
