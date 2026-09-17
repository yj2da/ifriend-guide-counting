/* ========================================================
   아이프렌드 27기 오프닝 세레모니 - REALTIME BACKEND SERVER
   (Node.js Built-in HTTP + Server-Sent Events 실시간 동기화)
   ======================================================== */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'scores_data.json');

// MIME 타입 매핑
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// 초기 기본 점수 데이터 구조
function createInitialScores() {
  const scores = {};
  for (let t = 1; t <= 6; t++) {
    scores[t] = {
      team: t,
      name: `${t}조`,
      officer: t <= 3 ? '예진' : '민혁',
      bingo: 0,
      tower: 0, // 높이 cm
      ball: 0,  // 둘레/크기 cm
      individualEntries: [],
      updatedAt: null
    };
  }
  return scores;
}

// 점수 파일 로드 및 저장
let currentScores = loadScoresFromFile();

function loadScoresFromFile() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      for (let t = 1; t <= 6; t++) {
        if (!parsed[t]) parsed[t] = createInitialScores()[t];
        if (!Array.isArray(parsed[t].individualEntries)) {
          parsed[t].individualEntries = [];
        }
      }
      return parsed;
    }
  } catch (err) {
    console.error('Error loading scores file:', err);
  }
  const initial = createInitialScores();
  saveScoresToFile(initial);
  return initial;
}

function saveScoresToFile(data) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving scores file:', err);
  }
}

// SSE (Server-Sent Events) 클라이언트 관리
let sseClients = [];

function broadcastScores(updatedScores, eventType = 'update') {
  currentScores = updatedScores;
  saveScoresToFile(currentScores);

  const payload = JSON.stringify({ type: eventType, scores: currentScores });
  const sseMessage = `data: ${payload}\n\n`;

  sseClients.forEach(client => {
    try {
      client.res.write(sseMessage);
    } catch (e) {
      // 연결 끊김 무시
    }
  });
}

// HTTP 요청 본문 파싱 헬퍼
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

// 서버 생성
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = decodeURIComponent(parsedUrl.pathname);

  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // 1. 실시간 이벤트 스트림 (SSE)
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    });

    const clientId = Date.now() + Math.random();
    const newClient = { id: clientId, res };
    sseClients.push(newClient);

    // 연결 직후 현재 상태 1회 전송
    res.write(`data: ${JSON.stringify({ type: 'init', scores: currentScores })}\n\n`);

    // 연결 종료 시 정리
    req.on('close', () => {
      sseClients = sseClients.filter(c => c.id !== clientId);
    });
    return;
  }

  // 2. 점수 조회 API
  if (pathname === '/api/scores' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, scores: currentScores }));
    return;
  }

  // 3. 점수 업데이트 API
  if (pathname === '/api/scores' && req.method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      if (data && data.scores) {
        broadcastScores(data.scores, 'update');
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: '점수가 성공적으로 동기화되었습니다.' }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: false, message: '유효하지 않은 데이터입니다.' }));
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: false, error: err.message }));
    }
    return;
  }

  // 4. 점수 초기화 API
  if (pathname === '/api/reset' && req.method === 'POST') {
    const clean = createInitialScores();
    broadcastScores(clean, 'reset');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, scores: clean }));
    return;
  }

  // 5. 샘플 데이터 적용 API
  if (pathname === '/api/sample' && req.method === 'POST') {
    const sample = {
      1: {
        team: 1, name: '1조', officer: '예진', bingo: 80, tower: 185.0, ball: 8.5,
        individualEntries: [{ name: '이지은', score: 15 }, { name: '박서준', score: 10 }],
        updatedAt: new Date().toISOString()
      },
      2: {
        team: 2, name: '2조', officer: '예진', bingo: 70, tower: 165.5, ball: 7.2,
        individualEntries: [{ name: '정해인', score: 20 }],
        updatedAt: new Date().toISOString()
      },
      3: {
        team: 3, name: '3조', officer: '예진', bingo: 90, tower: 140.0, ball: 9.8,
        individualEntries: [{ name: '김태리', score: 25 }, { name: '최우식', score: 5 }],
        updatedAt: new Date().toISOString()
      },
      4: {
        team: 4, name: '4조', officer: '민혁', bingo: 65, tower: 195.0, ball: 11.0,
        individualEntries: [{ name: '강동원', score: 30 }],
        updatedAt: new Date().toISOString()
      },
      5: {
        team: 5, name: '5조', officer: '민혁', bingo: 85, tower: 172.0, ball: 6.8,
        individualEntries: [{ name: '한소희', score: 10 }, { name: '안효섭', score: 10 }],
        updatedAt: new Date().toISOString()
      },
      6: {
        team: 6, name: '6조', officer: '민혁', bingo: 75, tower: 120.0, ball: 12.5,
        individualEntries: [{ name: '송중기', score: 15 }],
        updatedAt: new Date().toISOString()
      }
    };
    broadcastScores(sample, 'sample');
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, scores: sample }));
    return;
  }

  // 6. 정적 파일 서빙 (HTML, CSS, JS 등)
  let relativePath = pathname === '/' ? '/index.html' : pathname;
  let filePath = path.join(__dirname, relativePath);

  // 보안: 상위 디렉터리 접근 방지
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('403 Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // 404 처리
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 아이프렌드 27기 오프닝 세레모니 실시간 서버 구동`);
  console.log(`👉 로컬 접속: http://localhost:${PORT}`);
  console.log(`👉 실시간 SSE 동기화 지원 활성화됨`);
  console.log(`====================================================`);
});
