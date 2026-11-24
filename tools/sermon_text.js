/* 설교문 파일(hwp, hwpx, docx)에서 글자를 뽑는다. 브라우저 페이지 안에서 돈다(받은 파일을 PC에 내려받지 않는다).
   쓰는 법: 이 글 전체를 javascript_tool 로 한 번 실행한 뒤
     await window.__sermonNew(20189)   → 그 번호보다 새 글 목록 [{ n, c, board, info, hasDoc, url }]
     await window.__sermonDoc(20188)   → { n, kind, chars } (설교문을 받아 글자를 뽑아 둔다)
     window.__sermonPart(0, 12000)     → 뽑아 둔 글의 앞 12,000자. 더 길면 (12000, 12000) 처럼 이어 받는다
   pdf 와 그림 파일은 글자를 뽑지 못한다(kind 가 'pdf' 나 'other', text 는 빈 글). */
(() => {
  const u16 = (b, o) => b[o] | (b[o + 1] << 8), u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  const cat = arr => { let n = 0; arr.forEach(a => n += a.length); const o = new Uint8Array(n); let p = 0; arr.forEach(a => { o.set(a, p); p += a.length; }); return o; };
  /* 압축을 푼다. 한글 파일은 압축 뒤에 남는 바이트가 있어 끝에서 오류가 날 수 있으므로, 그때까지 풀린 것을 쓴다 */
  const inflateRaw = async u8 => { const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(u8).catch(() => {}); w.close().catch(() => {}); const rd = ds.readable.getReader(), out = []; try { for (;;) { const r = await rd.read(); if (r.done) break; out.push(r.value); } } catch (e) { if (!out.length) throw e; } return cat(out); };
  async function unzip(b) {
    let e = b.length - 22; while (e >= 0 && u32(b, e) !== 0x06054b50) e--; if (e < 0) throw new Error('zip 끝을 찾지 못함');
    const n = u16(b, e + 10); let p = u32(b, e + 16); const out = {};
    for (let i = 0; i < n; i++) {
      const method = u16(b, p + 10), csize = u32(b, p + 20), nl = u16(b, p + 28), xl = u16(b, p + 30), cl = u16(b, p + 32), lo = u32(b, p + 42);
      const name = new TextDecoder().decode(b.subarray(p + 46, p + 46 + nl));
      out[name] = { method, csize, lo }; p += 46 + nl + xl + cl;
    }
    return { names: Object.keys(out), read: async name => { const f = out[name], ds = f.lo + 30 + u16(b, f.lo + 26) + u16(b, f.lo + 28), raw = b.subarray(ds, ds + f.csize); return f.method === 0 ? raw : await inflateRaw(raw); } };
  }
  const xml = u8 => new DOMParser().parseFromString(new TextDecoder().decode(u8), 'application/xml');
  async function hwpx(b) {
    const z = await unzip(b), secs = z.names.filter(n => /^Contents\/section\d+\.xml$/.test(n)).sort((x, y) => parseInt(x.match(/\d+/)[0], 10) - parseInt(y.match(/\d+/)[0], 10)), lines = [];
    for (const n of secs) {
      const d = xml(await z.read(n));
      for (const p of d.getElementsByTagName('*')) {
        if (p.localName !== 'p') continue; let up = p.parentNode, inner = false; while (up && up.nodeType === 1) { if (up.localName === 'p') { inner = true; break; } up = up.parentNode; } if (inner) continue;
        let t = ''; for (const x of p.getElementsByTagName('*')) if (x.localName === 't') t += x.textContent; lines.push(t);
      }
    }
    return lines.join('\n');
  }
  async function docx(b) {
    const z = await unzip(b), d = xml(await z.read('word/document.xml')), lines = [];
    for (const p of d.getElementsByTagName('*')) {
      if (p.localName !== 'p') continue; let t = '';
      for (const x of p.getElementsByTagName('*')) { if (x.localName === 't') t += x.textContent; else if (x.localName === 'br' || x.localName === 'cr') t += '\n'; else if (x.localName === 'tab') t += '\t'; }
      lines.push(t);
    }
    return lines.join('\n');
  }
  async function hwp(b) {
    const FREE = 0xFFFFFFFA, sec = 1 << u16(b, 30), mini = 1 << u16(b, 32), nFat = u32(b, 44), dirStart = u32(b, 48), cutoff = u32(b, 56), miniFatStart = u32(b, 60); let difat = u32(b, 68);
    const off = n => (n + 1) * sec, fatSecs = [];
    for (let i = 0; i < 109 && fatSecs.length < nFat; i++) { const s = u32(b, 76 + i * 4); if (s < FREE) fatSecs.push(s); }
    let guard = 0;
    while (difat < FREE && fatSecs.length < nFat && guard++ < 10000) { const o = off(difat); for (let i = 0; i < sec / 4 - 1 && fatSecs.length < nFat; i++) { const s = u32(b, o + i * 4); if (s < FREE) fatSecs.push(s); } difat = u32(b, o + sec - 4); }
    const fat = []; for (const s of fatSecs) { const o = off(s); for (let i = 0; i < sec / 4; i++) fat.push(u32(b, o + i * 4)); }
    const chain = start => { const out = []; let s = start, seen = 0; while (s < FREE && seen++ < fat.length + 1) { out.push(b.subarray(off(s), off(s) + sec)); s = s < fat.length ? fat[s] : FREE + 1; } return cat(out); };
    const d = chain(dirStart), ents = [];
    for (let o = 0; o + 128 <= d.length; o += 128) { const nl = Math.min(64, u16(d, o + 64)); ents.push({ name: new TextDecoder('utf-16le').decode(d.subarray(o, o + Math.max(0, nl - 2))), type: d[o + 66], left: u32(d, o + 68), right: u32(d, o + 72), child: u32(d, o + 76), start: u32(d, o + 116), size: u32(d, o + 120) }); }
    const miniS = chain(ents[0].start), miniFat = miniFatStart < FREE ? chain(miniFatStart) : new Uint8Array(0);
    const read = e => { if (e.size >= cutoff) return chain(e.start).subarray(0, e.size); const out = []; let s = e.start, got = 0, seen = 0; while (s < FREE && got < e.size && seen++ < 1000000) { out.push(miniS.subarray(s * mini, (s + 1) * mini)); got += mini; s = (s * 4 + 4) <= miniFat.length ? u32(miniFat, s * 4) : FREE + 1; } return cat(out).subarray(0, e.size); };
    const kids = (i, acc, depth) => { if (i >= ents.length || depth > 200) return acc; const e = ents[i]; kids(e.left, acc, depth + 1); acc.push(e); kids(e.right, acc, depth + 1); return acc; };
    const body = ents.find(e => e.name === 'BodyText' && e.type === 1); if (!body) return '';
    const secs = kids(body.child, [], 0).filter(e => /^Section\d+$/.test(e.name)).sort((x, y) => parseInt(x.name.slice(7), 10) - parseInt(y.name.slice(7), 10)), lines = [];
    for (const s of secs) {
      const raw = read(s); let x; try { x = await inflateRaw(raw); } catch (e) { x = raw; }
      let p = 0; const n = x.length;
      while (p + 4 <= n) {
        const h = u32(x, p); p += 4; const tag = h & 0x3FF; let size = h >>> 20; if (size === 0xFFF) { if (p + 4 > n) break; size = u32(x, p); p += 4; }
        if (tag === 67) { const lim = Math.min(size, n - p); let i = 0, t = ''; while (i + 2 <= lim) { const c = u16(x, p + i); if (c >= 32) { t += String.fromCharCode(c); i += 2; } else if (c === 10 || c === 13) { t += '\n'; i += 2; } else if (c === 0 || (c >= 24 && c <= 31)) i += 2; else i += 16; } lines.push(t.replace(/\n+$/, '')); }
        p += size;
      }
    }
    return lines.join('\n');
  }
  window.__sermonText = async u8 => {
    const b = u8 instanceof Uint8Array ? u8 : new Uint8Array(u8);
    if (b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0) return { kind: 'hwp', text: await hwp(b) };
    if (b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46) return { kind: 'pdf', text: '' };
    if (b[0] === 0x50 && b[1] === 0x4b) { const z = await unzip(b); if (z.names.includes('word/document.xml')) return { kind: 'docx', text: await docx(b) }; if (z.names.some(n => /^Contents\/section\d+\.xml$/.test(n))) return { kind: 'hwpx', text: await hwpx(b) }; return { kind: 'zip', text: '' }; }
    return { kind: 'other', text: '' };
  };
  window.__sermonFetch = async url => { const r = await fetch(url, { credentials: 'include' }); if (!r.ok) return { kind: 'error', status: r.status, chars: 0, text: '' }; const o = await window.__sermonText(new Uint8Array(await r.arrayBuffer())); o.chars = o.text.length; window.__lastSermon = o; return o; };
  /* 게시판(pageCode): 6 주일예배, 7 젊은이예배, 8 수요예배, 9 새벽기도회, 39 금요성령집회, 40 화요중보기도회, 45 특별예배 */
  const BOARDS = { 6: '주일예배', 7: '젊은이예배', 8: '수요예배', 9: '새벽기도회', 39: '금요성령집회', 40: '화요중보기도회', 45: '특별예배' };
  const page = async url => { const d = new DOMParser().parseFromString(await (await fetch(url, { credentials: 'include' })).text(), 'text/html'); d.querySelectorAll('script,style').forEach(x => x.remove()); return d; };
  /* 글 하나의 제목 줄("제목 설교자|본문|조회수|날짜")과 설교문 파일이 있는지 */
  window.__sermonMeta = async (n, c) => { const d = await page('/main/sub.html?Mode=view&num=' + n + '&pageCode=' + c), box = d.querySelector('.videoTitle'), info = (box ? box.textContent : '').replace(/\s+/g, ' ').replace(/음성 다운로드|설교문 다운로드|음성듣기/g, '').trim(); return { n: n, c: c, board: BOARDS[c] || String(c), info: info, hasDoc: !!d.querySelector('a[href*="download.php?num="]'), url: 'https://www.gsmch.org/main/sub.html?Mode=view&num=' + n + '&pageCode=' + c }; };
  /* last 보다 번호가 큰 새 글을 일곱 게시판의 첫 쪽(게시판마다 최근 15편)에서 찾는다. 번호 작은 것부터 */
  window.__sermonNew = async last => { const out = []; for (const c of Object.keys(BOARDS).map(Number)) { const d = await page('/main/sub.html?pageCode=' + c), seen = new Set(); for (const a of d.querySelectorAll('a[href*="Mode=view"][href*="num="]')) { const n = +((a.getAttribute('href').match(/num=(\d+)/) || [])[1]); if (!n || n <= last || seen.has(n)) continue; seen.add(n); out.push(await window.__sermonMeta(n, c)); } } return out.sort((x, y) => x.n - y.n); };
  /* 설교문 글자. 긴 글은 from 부터 size 글자씩 나눠 받는다 */
  window.__sermonDoc = async n => { const o = await window.__sermonFetch('/user/module/vod/download.php?num=' + n); return { n: n, kind: o.kind, chars: o.chars }; };
  window.__sermonPart = (from, size) => (window.__lastSermon ? window.__lastSermon.text : '').slice(from || 0, (from || 0) + (size || 12000));
  return 'ok';
})()
