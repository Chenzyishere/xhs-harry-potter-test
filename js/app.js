/* =========================================================
 * 你是霍格沃茨哪个学院？ —— 交互 · 计分 · 分享卡
 * ========================================================= */

(function () {
  "use strict";

  const DATA = window.QUIZ_DATA;
  const TOTAL = DATA.questions.length;
  const PER_DIM = TOTAL / DATA.dimensions.length; // 每维题目数（计分归一化分母）

  // 当前状态
  const answers = new Array(TOTAL).fill(-1); // 每题选中的选项下标，-1 表示未选
  let current = 0;
  let result = null;
  let lastScores = [0, 0, 0, 0];

  // DOM
  const $ = (id) => document.getElementById(id);
  const lockScreen = $("lock-screen");
  const startScreen = $("start-screen");
  const quizScreen = $("quiz-screen");
  const resultScreen = $("result-screen");

  const unlockInput = $("unlock-input");
  const unlockError = $("unlock-error");
  const unlockBtn = $("unlock-btn");
  const lockHint = $("lock-hint");
  if (DATA.unlock.hint) lockHint.textContent = DATA.unlock.hint;

  const startFoot = $("start-foot");
  if (DATA.socialProof) startFoot.textContent = DATA.socialProof;
  else startFoot.style.display = "none";

  const progressBar = $("progress-bar");
  const qCurrent = $("q-current");
  const qTotal = $("q-total");
  const questionText = $("question-text");
  const optionsEl = $("options");
  const prevBtn = $("prev-btn");
  const nextBtn = $("next-btn");

  const canvas = $("share-canvas");
  const hat = $("sorting-hat");

  const PAID = !!DATA.paidMode;
  const COPY = PAID && DATA.generic ? Object.assign({}, DATA, DATA.generic) : DATA;

  function view(f) {
    if (!f) return f;
    if (!PAID) return f;
    return Object.assign({}, f, {
      name: f.nameGeneric || f.name,
      english: f.englishGeneric || f.english,
      founder: f.founderGeneric || f.founder,
      animal: f.animalGeneric || f.animal
    });
  }

  function track(event) {
    try {
      const key = DATA.statsKey || "quiz_stats";
      const s = JSON.parse(localStorage.getItem(key) || '{"unlock":0,"start":0,"complete":0,"save":0,"copy":0}');
      if (typeof s[event] === "number") s[event] += 1;
      s.updated = Date.now();
      localStorage.setItem(key, JSON.stringify(s));
      if (event === "complete" && s.start) {
        console.info("[quiz] 完成率", ((s.complete / s.start) * 100).toFixed(1) + "%", s);
      }
      if (event === "save" && s.complete) {
        console.info("[quiz] 保存率", ((s.save / s.complete) * 100).toFixed(1) + "%", s);
      }
    } catch (e) {}
  }

  function hydrateShell() {
    const title = COPY.title || DATA.title;
    document.title = title;
    const desc = document.querySelector('meta[name="description"]');
    if (desc) desc.setAttribute("content", TOTAL + " 道题，" + (COPY.subtitle || DATA.subtitle) + "。本测试仅供娱乐。");
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.setAttribute("content", title);
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.setAttribute("content", TOTAL + " 道题，" + (COPY.subtitle || DATA.subtitle));

    const setTxt = (id, val) => { const el = $(id); if (el && val != null && val !== "") el.textContent = val; };
    const setHtml = (id, val) => { const el = $(id); if (el && val) el.innerHTML = val; };

    setTxt("start-badge", DATA.brand);
    setHtml("start-title", COPY.titleHtml || DATA.titleHtml);
    setTxt("start-sub", TOTAL + " 道题 · " + DATA.duration + " · " + (COPY.subtitle || DATA.subtitle));
    setTxt("start-btn", COPY.startBtn || DATA.startBtn);
    setHtml("lock-title", COPY.lockTitleHtml || DATA.lockTitleHtml);
    setTxt("start-foot", COPY.socialProof || DATA.socialProof);
    setTxt("result-search", "小红书搜索「" + DATA.brand + "」");
    document.querySelectorAll(".disclaimer").forEach((el) => {
      el.textContent = DATA.disclaimer || "本测试仅供娱乐，结果不构成性格鉴定";
    });
  }
  hydrateShell();

  // ---------- 屏幕切换 ----------
  function show(id) {
    [lockScreen, startScreen, quizScreen, resultScreen].forEach((el) => el.classList.remove("is-active"));
    $(id).classList.add("is-active");
  }

  // ---------- 验证码 ----------
  const UNLOCK_KEY = "hogw_unlocked";

  // 归一化：去掉空格和横杠、转大写
  function normalize(raw) {
    return String(raw).replace(/[\s\-_]/g, "").toUpperCase();
  }

  // 校验位：前 N-1 位加盐做散列，取最后一位
  const ALPHABET = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // 去掉易混淆的 I O
  function checkDigit(body, salt) {
    let h = 2166136261;
    const s = body + "|" + salt;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return ALPHABET[h % ALPHABET.length];
  }

  // 验证：店铺密码 / 主密码 / 卡密（前缀+6位+校验）
  function isValidCode(input) {
    const cfg = DATA.unlock;
    const raw = normalize(input);
    if (!raw) return false;

    if (cfg.masterCode && raw === normalize(cfg.masterCode)) return true;
    if (cfg.shopCode && raw === normalize(cfg.shopCode)) return true;

    const prefix = normalize(cfg.prefix || "");
    let body = raw;
    if (prefix && raw.startsWith(prefix)) body = raw.slice(prefix.length);

    if (body.length !== 7) return false;
    const base = body.slice(0, 6);
    const given = body.slice(6);
    return checkDigit(base, cfg.salt) === given;
  }

  // ---------- 进度存续（防刷新丢答题） ----------
  const PROGRESS_KEY = "hogw_progress";

  function saveProgress() {
    try {
      sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ answers, current }));
    } catch (e) {}
  }

  function clearProgress() {
    try { sessionStorage.removeItem(PROGRESS_KEY); } catch (e) {}
  }

  function restoreProgress() {
    try {
      const raw = sessionStorage.getItem(PROGRESS_KEY);
      if (!raw) return false;
      const p = JSON.parse(raw);
      if (!p || !Array.isArray(p.answers) || p.answers.length !== TOTAL) return false;
      if (typeof p.current !== "number" || p.current < 0 || p.current >= TOTAL) return false;
      for (let i = 0; i < TOTAL; i++) {
        const v = p.answers[i];
        answers[i] = Number.isInteger(v) && v >= 0 && v < DATA.questions[i].options.length ? v : -1;
      }
      current = p.current;
      return true;
    } catch (e) { return false; }
  }

  // ---------- 解锁 ----------
  function tryUnlock() {
    const val = unlockInput.value;
    if (!normalize(val)) {
      unlockError.textContent = "请输入验证码";
      return;
    }
    if (isValidCode(val)) {
      unlockError.textContent = "";
      unlockInput.value = "";
      try { localStorage.setItem(UNLOCK_KEY, "1"); } catch (e) {}
      track("unlock");
      show("start-screen");
    } else {
      unlockError.textContent = "验证码不正确，请检查后重试";
    }
  }
  unlockBtn.addEventListener("click", tryUnlock);
  unlockInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") tryUnlock();
  });
  unlockInput.addEventListener("input", () => {
    unlockError.textContent = "";
    // 输入时自动转大写，提升体验
    const pos = unlockInput.selectionStart;
    unlockInput.value = unlockInput.value.toUpperCase();
    unlockInput.setSelectionRange(pos, pos);
  });

  // 已解锁过则跳过
  try {
    if (localStorage.getItem(UNLOCK_KEY) === "1") {
      if (restoreProgress()) {
        show("quiz-screen");
        renderQuestion();
      } else {
        show("start-screen");
      }
    }
  } catch (e) {}

  // ---------- 开始 ----------
  $("start-btn").addEventListener("click", () => {
    answers.fill(-1);
    current = 0;
    result = null;
    clearProgress();
    if (hat) hat.classList.remove("is-thinking", "is-nod");
    track("start");
    show("quiz-screen");
    renderQuestion();
  });

  // ---------- 渲染题目 ----------
  function renderQuestion() {
    const q = DATA.questions[current];
    questionText.textContent = q.text;
    qTotal.textContent = TOTAL;
    qCurrent.textContent = current + 1;
    progressBar.style.width = ((current / TOTAL) * 100) + "%";

    optionsEl.innerHTML = "";
    q.options.forEach((opt, i) => {
      const btn = document.createElement("button");
      btn.className = "option";
      btn.textContent = opt.text;
      btn.addEventListener("click", () => pick(i));
      if (answers[current] === i) btn.classList.add("is-picked");
      optionsEl.appendChild(btn);
    });

    updateNav();
  }

  // 选中一个选项：只记录答案，不自动跳转
  function pick(index) {
    answers[current] = index;
    const btns = optionsEl.querySelectorAll(".option");
    btns.forEach((b, i) => b.classList.toggle("is-picked", i === index));
    updateNav();
    saveProgress();
    nodHat();
  }

  // 分院帽点头（选中选项时）
  function nodHat() {
    if (!hat) return;
    hat.classList.remove("is-nod");
    void hat.offsetWidth;   // 强制重排，让动画可重复触发
    hat.classList.add("is-nod");
  }

  // 更新导航按钮状态与文案
  function updateNav() {
    prevBtn.disabled = current === 0;
    const hasAnswer = answers[current] !== -1;
    nextBtn.disabled = !hasAnswer;
    nextBtn.textContent = current === TOTAL - 1 ? "查看分院结果" : "下一题";
  }

  // ---------- 上一题 / 下一题 ----------
  prevBtn.addEventListener("click", () => {
    if (current > 0) { current--; renderQuestion(); saveProgress(); }
  });

  nextBtn.addEventListener("click", () => {
    if (answers[current] === -1) return;
    if (current < TOTAL - 1) {
      current++;
      renderQuestion();
      saveProgress();
    } else {
      thinkThenFinish();
    }
  });

  // 提交前分院帽低头沉思 0.9s
  function thinkThenFinish() {
    nextBtn.disabled = true;
    progressBar.style.width = "100%";
    if (hat) {
      hat.classList.remove("is-nod");
      hat.classList.add("is-thinking");
    }
    setTimeout(finish, 900);
  }

  // ---------- 结果匹配 ----------
  function match(scores) {
    // 归一化到 -1 ~ 1
    const u = scores.map((s) => s / PER_DIM);
    let best = null;
    let bestDist = Infinity;
    DATA.figures.forEach((f) => {
      const d = f.vector.reduce((sum, v, i) => sum + (v - u[i]) ** 2, 0);
      if (d < bestDist) { bestDist = d; best = f; }
    });
    return best;
  }

  function finish() {
    // 从答案重新累计四维得分
    const scores = [0, 0, 0, 0];
    answers.forEach((ansIdx, qi) => {
      if (ansIdx === -1) return;
      DATA.questions[qi].options[ansIdx].effect.forEach((v, d) => { scores[d] += v; });
    });
    progressBar.style.width = "100%";
    lastScores = scores;
    result = match(scores);
    clearProgress();
    track("complete");
    renderResult();
    show("result-screen");
  }

  // ---------- 渲染结果 ----------
  function renderResult() {
    const f = view(result);
    $("result-name").textContent = f.name;
    $("result-english").textContent = f.english;
    $("result-seal").textContent = f.seal;
    const personaEl = $("result-persona");
    if (personaEl) personaEl.textContent = f.persona || "";
    $("result-title").textContent = f.title;
    $("result-tagline").textContent = "「" + f.tagline + "」";
    $("result-house-meta").textContent = "学院动物 " + f.animal + " · 创办人 " + f.founder;
    $("result-advice").textContent = f.advice;

    const traitsEl = $("result-traits");
    traitsEl.innerHTML = "";
    f.traits.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = t;
      traitsEl.appendChild(li);
    });

    // 结果页用学院专属色
    $("result-name").style.color = f.color;
    $("result-seal").style.background = f.color;

    drawRadar(lastScores, f.color);
    renderLegend(lastScores);
  }

  // ---------- 四维雷达 ----------
  function hexA(hex, alpha) {
    const h = hex.replace("#", "");
    const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + alpha + ")";
  }

  function drawRadar(scores, color) {
    const cv = $("radar-canvas");
    const ctx = cv.getContext("2d");
    const W = cv.width, H = cv.height;
    const cx = W / 2, cy = H / 2;
    const R = 200;
    const dims = DATA.dimensions;
    const N = dims.length;

    ctx.clearRect(0, 0, W, H);

    // -4..4 归一化到 0..1，0 分落在 0.5（虚线中性环）
    const vals = scores.map((s) => 0.5 + Math.max(-1, Math.min(1, s / PER_DIM)) * 0.5);
    const angles = dims.map((_, i) => -Math.PI / 2 + (i * 2 * Math.PI) / N);

    const pt = (a, ratio) => [cx + Math.cos(a) * R * ratio, cy + Math.sin(a) * R * ratio];

    // 网格环
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.10)";
    for (let ring = 1; ring <= 4; ring++) {
      ctx.beginPath();
      angles.forEach((a, i) => {
        const p = pt(a, ring / 4);
        i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
      });
      ctx.closePath();
      ctx.stroke();
    }

    // 中性参考环（0 分）
    ctx.beginPath();
    angles.forEach((a, i) => {
      const p = pt(a, 0.5);
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.setLineDash([7, 7]);
    ctx.strokeStyle = "rgba(212, 160, 23, 0.4)";
    ctx.stroke();
    ctx.setLineDash([]);

    // 轴线
    ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
    angles.forEach((a) => {
      const p = pt(a, 1);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(p[0], p[1]);
      ctx.stroke();
    });

    // 数据多边形
    ctx.beginPath();
    angles.forEach((a, i) => {
      const p = pt(a, vals[i]);
      i === 0 ? ctx.moveTo(p[0], p[1]) : ctx.lineTo(p[0], p[1]);
    });
    ctx.closePath();
    ctx.fillStyle = hexA(color, 0.24);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 顶点
    angles.forEach((a, i) => {
      const p = pt(a, vals[i]);
      ctx.beginPath();
      ctx.arc(p[0], p[1], 7, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    });

    // 轴端标签（正向极），按方位调整对齐避免出界
    ctx.textBaseline = "middle";
    angles.forEach((a, i) => {
      const p = pt(a, 1.16);
      const cos = Math.cos(a);
      ctx.textAlign = Math.abs(cos) < 0.1 ? "center" : (cos > 0 ? "left" : "right");
      ctx.fillStyle = "#e8e0cf";
      ctx.font = 'bold 30px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      ctx.fillText(dims[i].pos, p[0], p[1]);
    });
  }

  // 雷达下方文字标签：显示偏哪一极
  function renderLegend(scores) {
    const el = $("radar-legend");
    el.innerHTML = "";
    scores.forEach((s, i) => {
      const d = DATA.dimensions[i];
      const span = document.createElement("span");
      span.textContent = "偏" + (s >= 0 ? d.pos : d.neg);
      el.appendChild(span);
    });
  }

  // ---------- 分享卡绘制 ----------
  function drawShareCard(raw) {
    const f = view(raw);
    const W = 1080, H = 1440;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    // 背景：暗色魔法渐变，底部透出学院色
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#171226");
    bg.addColorStop(0.55, "#1f1830");
    bg.addColorStop(1, hexA(f.color, 0.42));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    // 顶部金色细线
    ctx.fillStyle = "#d4a017";
    ctx.fillRect(0, 0, W, 10);

    // 顶部小字
    ctx.fillStyle = "#b9ad90";
    ctx.font = '34px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(COPY.cardKicker || DATA.cardKicker || "霍 格 沃 茨 分 院 帽", W / 2, 130);

    // 学院名（居中大字，学院专属色）
    ctx.fillStyle = f.color;
    ctx.font = 'bold 130px "Songti SC", "SimSun", serif';
    ctx.fillText(f.name, W / 2, 300);

    // 英文名
    ctx.fillStyle = "#d4a017";
    ctx.font = '52px Georgia, "Times New Roman", serif';
    ctx.fillText(f.english, W / 2, 380);

    // 学院徽章（印章）
    const sealSize = 96;
    const sealY = 490;
    ctx.save();
    ctx.translate(W / 2, sealY);
    ctx.rotate(-0.06);
    ctx.fillStyle = f.color;
    roundRect(ctx, -sealSize / 2, -sealSize / 2, sealSize, sealSize, 16);
    ctx.fill();
    ctx.strokeStyle = "#d4a017";
    ctx.lineWidth = 4;
    roundRect(ctx, -sealSize / 2, -sealSize / 2, sealSize, sealSize, 16);
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = 'bold 34px "Songti SC", "SimSun", serif';
    ctx.fillText(f.seal, 0, 12);
    ctx.restore();

    // 人格标签 + 定调
    ctx.fillStyle = f.color;
    ctx.font = 'bold 40px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText(f.persona || f.title, W / 2, 600);
    ctx.font = 'bold 36px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("—— " + f.title + " ——", W / 2, 655);

    // 金句
    ctx.fillStyle = "#efe8d8";
    ctx.font = 'bold 56px "Songti SC", "SimSun", serif';
    const lines = wrapText(ctx, "「" + f.tagline + "」", 820);
    let y = 730;
    lines.forEach((line) => {
      ctx.fillText(line, W / 2, y);
      y += 80;
    });

    // 分隔线
    ctx.strokeStyle = "rgba(212, 160, 23, 0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 90, y - 10);
    ctx.lineTo(W / 2 + 90, y - 10);
    ctx.stroke();

    // 相似点（动态 y，避免换行重叠）
    y += 70;
    ctx.textAlign = "left";
    f.traits.forEach((t) => {
      ctx.fillStyle = f.color;
      ctx.beginPath();
      ctx.arc(90, y - 14, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#efe8d8";
      ctx.font = '42px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
      const tl = wrapText(ctx, t, 800);
      tl.forEach((line) => {
        ctx.fillText(line, 130, y);
        y += 58;
      });
      y += 34;
    });

    // 底部建议（固定贴底）
    const boxY = 1180;
    ctx.textAlign = "center";
    ctx.fillStyle = hexA("#d4a017", 0.16);
    roundRect(ctx, 90, boxY, 900, 150, 16);
    ctx.fill();
    ctx.fillStyle = "#d4a017";
    ctx.fillRect(90, boxY, 10, 150);
    ctx.fillStyle = "#efe8d8";
    ctx.font = 'bold 40px "Songti SC", "SimSun", serif';
    const advLines = wrapText(ctx, f.advice, 760);
    const ay = boxY + (advLines.length > 1 ? 70 : 92);
    advLines.forEach((line, i) => {
      ctx.fillText(line, W / 2, ay + i * 52);
    });

    // 底部引流
    ctx.fillStyle = "#b9ad90";
    ctx.font = '28px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText("小红书搜索「" + DATA.brand + "」", W / 2, 1372);
    ctx.font = '24px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
    ctx.fillText((COPY.cardFooter || DATA.cardFooter || "测一测你的学院人格") + " · 仅供娱乐", W / 2, 1410);
  }

  // 圆角矩形路径
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 文字换行
  function wrapText(ctx, text, maxWidth) {
    const lines = [];
    let line = "";
    for (const ch of text) {
      const test = line + ch;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = ch;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    return lines;
  }

  // ---------- 轻提示 ----------
  let toastTimer = null;
  function toast(msg) {
    const el = $("toast");
    el.textContent = msg;
    el.classList.add("is-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("is-show"), 1800);
  }

  // ---------- 复制晒单文案 ----------
  function buildCaption(raw) {
    const f = view(raw);
    const share = DATA.share || {};
    const tpl = (PAID && share.templatePaid) || share.template || "{persona}（{name}） {title}";
    return tpl
      .replace(/\{name\}/g, f.name)
      .replace(/\{english\}/g, f.english || "")
      .replace(/\{animal\}/g, f.animal || "")
      .replace(/\{founder\}/g, f.founder || "")
      .replace(/\{persona\}/g, f.persona || "")
      .replace(/\{title\}/g, f.title)
      .replace(/\{tagline\}/g, f.tagline)
      .replace(/\{advice\}/g, f.advice)
      .replace(/\{brand\}/g, DATA.brand);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}
    // 降级：临时 textarea + execCommand
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.top = "-1000px";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      ta.setSelectionRange(0, ta.value.length);
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch (e) { return false; }
  }

  $("copy-btn").addEventListener("click", async () => {
    if (!result) return;
    const ok = await copyText(buildCaption(result));
    if (ok) track("copy");
    toast(ok ? "文案已复制，去小红书粘贴吧" : "复制失败，请长按手动复制");
  });

  // ---------- 保存分享卡 ----------
  const saveOverlay = $("save-overlay");
  const saveImg = $("save-img");

  function isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  }

  $("save-btn").addEventListener("click", () => {
    if (!result) return;
    track("save");
    drawShareCard(result);
    const url = canvas.toDataURL("image/png");

    // iOS Safari 不支持 a[download]，改为长按保存
    if (isIOS()) {
      saveImg.src = url;
      saveOverlay.classList.add("is-open");
      return;
    }

    const a = document.createElement("a");
    a.href = url;
    a.download = "我属于" + view(result).name + ".png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  });

  $("save-close").addEventListener("click", () => {
    saveOverlay.classList.remove("is-open");
  });
  saveOverlay.addEventListener("click", (e) => {
    if (e.target === saveOverlay) saveOverlay.classList.remove("is-open");
  });

  // ---------- 再测一次 ----------
  $("retake-btn").addEventListener("click", () => {
    show("start-screen");
  });
})();
