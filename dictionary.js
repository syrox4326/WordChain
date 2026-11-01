'use strict';

const fs = require('fs');
const path = require('path');

const BACK = 'aıou';
const VOICELESS = 'çfhkpsşt';
const VOWELS = 'aıoueiöü';
const FOUR = { a: 'ı', ı: 'ı', e: 'i', i: 'i', o: 'u', u: 'u', ö: 'ü', ü: 'ü' };

function lastVowel(w) {
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i])) return w[i];
  return null;
}

// Kökün sonuna gelebilen yaygın ekler (ünlü uyumuna göre).
// Ünsüzle başlayan ekler seçildi; böylece ünsüz yumuşaması ya da ünlü düşmesi gerekmiyor.
// Ekler: -lar/-ler, -lık/-lik/-luk/-lük, -cı/-ci/-cu/-cü (-çı...), -lı/-li/-lu/-lü, -sız/-siz/-suz/-süz, -ca/-ce (-ça/-çe)
function allowedSuffixes(stem) {
  const v = lastVowel(stem);
  if (!v) return [];
  const A = BACK.includes(v) ? 'a' : 'e';
  const I = FOUR[v];
  const c = VOICELESS.includes(stem[stem.length - 1]) ? 'ç' : 'c';
  return ['l' + A + 'r', 'l' + I + 'k', c + I, 'l' + I, 's' + I + 'z', c + A];
}

function load(file) {
  let list;
  try {
    list = fs.readFileSync(file || path.join(__dirname, 'words.txt'), 'utf8').split('\n');
  } catch (e) {
    return null;
  }
  const set = new Set();
  for (const line of list) {
    const w = line.trim();
    if (w) set.add(w);
  }

  function isRoot(w) {
    return set.has(w);
  }

  function derived(word, depth) {
    for (let cut = 2; cut <= 3; cut++) {
      if (word.length - cut < 2) break;
      const stem = word.slice(0, word.length - cut);
      if (/m[ae]k$/.test(stem)) continue; // fiil kökü değil, isim ve sıfat kökleri
      const suf = word.slice(word.length - cut);
      if (!allowedSuffixes(stem).includes(suf)) continue;
      if (isRoot(stem)) return true;
      if (depth > 1 && derived(stem, depth - 1)) return true;
    }
    return false;
  }

  return {
    size: set.size,
    has(word) {
      const folded = word.replace(/[âîû]/g, (c) => ({ 'â': 'a', 'î': 'i', 'û': 'u' }[c]));
      return isRoot(word) || isRoot(folded) || derived(word, 2) || derived(folded, 2);
    },
  };
}

module.exports = { load };
