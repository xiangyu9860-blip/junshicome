const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname)));

// ========== 数据加载 ==========
const STRATEGIST_FILE = path.join(__dirname, 'data', 'strategists.json');
let _strategistsCache = null;

function loadStrategists() {
  try {
    const raw = fs.readFileSync(STRATEGIST_FILE, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : (data.strategists || []);
  } catch (e) {
    console.error('Failed to load strategists:', e.message);
    return _strategistsCache || [];
  }
}

function getStrategists() {
  if (!_strategistsCache) {
    _strategistsCache = loadStrategists();
  }
  return _strategistsCache;
}

app.get('/api/strategists/reload', (req, res) => {
  _strategistsCache = null;
  const data = loadStrategists();
  res.json({ ok: true, count: data.length });
});

// ========== LLM 配置 ==========
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'deepseek';
const LLM_API_KEY  = proces…_KEY  || 'sk-7eb…1b33';
const LLM_BASE_URL = process.env.LLM_BASE_URL || 'https://api.deepseek.com';
const LLM_MODEL    = process.env.LLM_MODEL   || 'deepseek-chat';

async function callLLM(systemPrompt, userPrompt) {
  const response = await fetch(`${LLM_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: LLM_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.85,
      max_tokens: 800,
    }),
  });
  if (!response.ok) {
    const err = await response.text();
    throw new Error(`LLM API error: ${response.status} - ${err}`);
  }
  const data = await response.json();
  return data.choices[0].message.content.trim();
}

function buildStrategyPrompt(strategist, question) {
  return `你是${strategist.name}（${strategist.dynasty}），${strategist.persona}。用户的问题是：「${question}」请给出上、中、下三策，每策包含策名、策略正文（80-120字）、白话文解释、风险提示、适用条件。格式：【上策】...【中策】...【下策】...`;
}

app.get('/api/strategists', (req, res) => {
  const list = getStrategists().map(({ id, name, dynasty, tags, domains, persona, bio, thoughts }) => ({
    id, name, dynasty, tags, domains, persona, bio, thoughts
  }));
  res.json({ strategists: list });
});

app.post('/api/consult', async (req, res) => {
  const { question, strategistId } = req.body;
  if (!question || question.trim().length < 4) {
    return res.status(400).json({ error: '问题内容至少需要4个字' });
  }
  if (question.length > 300) {
    return res.status(400).json({ error: '问题内容不能超过300字' });
  }
  let strategist;
  if (strategistId) {
    const all = getStrategists();
    strategist = all.find(s => s.id === strategistId);
    if (!strategist) return res.status(404).json({ error: '找不到指定军师' });
  } else {
    const all = getStrategists();
    strategist = all[Math.floor(Math.random() * all.length)];
  }
  try {
    const prompt = buildStrategyPrompt(strategist, question.trim());
    const raw = await callLLM(strategist.systemPrompt, prompt);
    res.json({ strategist: { id: strategist.id, name: strategist.name, dynasty: strategist.dynasty }, strategies: [{ level: '上', title: '已生成', content: raw }] });
  } catch (err) {
    console.error('LLM call failed:', err.message);
    return res.status(500).json({ error: 'AI 服务暂时不可用' });
  }
});

// ========== 启动 ==========
const llmReady = !!LLM_API_KEY;
app.listen(PORT, '0.0.0.0', () => {  // ← 关键修复：监听 0.0.0.0
  console.log(`⚔️  服务已启动: http://0.0.0.0:${PORT}`);
  console.log(`LLM: ${LLM_PROVIDER} / ${LLM_MODEL}`);
});
