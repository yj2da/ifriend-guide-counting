/* ========================================================
   아이프렌드 27기 오프닝 세레모니 - APPLICATION LOGIC
   (신문지탑/신문지공 cm 입력 & 1등 15점, 2등 10점, 3등 5점 자동 산출)
   ======================================================== */

const STORAGE_KEY = 'ifriend_27th_scores_v3';

const OFFICERS = {
  yejin: {
    id: 'yejin',
    name: '예진',
    role: '운영 임원',
    avatar: '👩‍💼',
    teams: [1, 2, 3]
  },
  minhyuk: {
    id: 'minhyuk',
    name: '민혁',
    role: '운영 임원',
    avatar: '👨‍💼',
    teams: [4, 5, 6]
  }
};

const GAMES = [
  { id: 'bingo', name: '빙고게임', unit: '점', tag: '게임 1', type: 'score' },
  { id: 'tower', name: '신문지탑', unit: 'cm', tag: '게임 2', type: 'max_cm', desc: '높을수록 우수' },
  { id: 'ball', name: '신문지공', unit: 'cm', tag: '게임 3', type: 'min_cm', desc: '작을수록 우수' }
];

// 초기 조별 기본 데이터 구조 (1조 ~ 6조)
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
      individualEntries: [], // { name: '이름', score: 점수 }
      updatedAt: null
    };
  }
  return scores;
}

// 전역 상태
const state = {
  scores: loadScores(),
  currentOfficer: null,
  currentTeam: 1,
  currentRankingTab: 'all'
};

// 로컬 스토리지 로드/저장
function loadScores() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (let t = 1; t <= 6; t++) {
        if (!parsed[t]) parsed[t] = createInitialScores()[t];
        if (!Array.isArray(parsed[t].individualEntries)) {
          parsed[t].individualEntries = [];
        }
      }
      return parsed;
    }
  } catch (e) {
    console.error('Failed to load scores:', e);
  }
  return createInitialScores();
}

function getFirebaseUrl() {
  let url = localStorage.getItem('ifriend_firebase_url') || window.FIREBASE_CONFIG?.databaseURL || '';
  url = url.trim();
  if (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

function saveScores() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
    updateMainDashboard();

    // 1. Firebase Realtime Database로 전송 (LTE, 5G, 어디서든 실시간 동기화)
    const fireUrl = getFirebaseUrl();
    if (fireUrl) {
      fetch(`${fireUrl}/scores.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state.scores)
      }).catch(err => {
        console.warn('Firebase sync failed:', err);
      });
    }

    // 2. 로컬 백엔드 서버로 전송 (로컬 서버 구동 시)
    const isStatic = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';
    if (!isStatic) {
      fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scores: state.scores })
      }).catch(() => {});
    }
  } catch (e) {
    console.error('Failed to save scores:', e);
  }
}

/* ========================================================
   순위 및 배점 계산 엔진
   - 신문지탑: 높을수록 1등 (1등 15점, 2등 10점, 3등 5점)
   - 신문지공: 작을수록 1등 (1등 15점, 2등 10점, 3등 5점, 0cm/미입력은 0점)
   ======================================================== */
function calculateGameRankingsAndPoints() {
  const results = {
    tower: {}, // team -> { rank, points, cm }
    ball: {}   // team -> { rank, points, cm }
  };

  for (let t = 1; t <= 6; t++) {
    results.tower[t] = { rank: null, points: 0, cm: Number(state.scores[t].tower) || 0 };
    results.ball[t] = { rank: null, points: 0, cm: Number(state.scores[t].ball) || 0 };
  }

  // 1. 신문지탑 순위 (높을수록, 즉 내림차순, cm > 0만 참여)
  const towerValid = [];
  for (let t = 1; t <= 6; t++) {
    const cm = Number(state.scores[t].tower) || 0;
    if (cm > 0) towerValid.push({ team: t, cm });
  }
  towerValid.sort((a, b) => b.cm - a.cm);

  let curTowerRank = 1;
  for (let i = 0; i < towerValid.length; i++) {
    if (i > 0 && towerValid[i].cm < towerValid[i - 1].cm) {
      curTowerRank = i + 1;
    }
    let pts = 0;
    if (curTowerRank === 1) pts = 15;
    else if (curTowerRank === 2) pts = 10;
    else if (curTowerRank === 3) pts = 5;

    results.tower[towerValid[i].team] = {
      rank: curTowerRank,
      points: pts,
      cm: towerValid[i].cm
    };
  }

  // 2. 신문지공 순위 (작을수록, 즉 오름차순, cm > 0만 참여, 0cm는 미입력으로 0점!)
  const ballValid = [];
  for (let t = 1; t <= 6; t++) {
    const cm = Number(state.scores[t].ball) || 0;
    if (cm > 0) ballValid.push({ team: t, cm });
  }
  ballValid.sort((a, b) => a.cm - b.cm);

  let curBallRank = 1;
  for (let i = 0; i < ballValid.length; i++) {
    if (i > 0 && ballValid[i].cm > ballValid[i - 1].cm) {
      curBallRank = i + 1;
    }
    let pts = 0;
    if (curBallRank === 1) pts = 15;
    else if (curBallRank === 2) pts = 10;
    else if (curBallRank === 3) pts = 5;

    results.ball[ballValid[i].team] = {
      rank: curBallRank,
      points: pts,
      cm: ballValid[i].cm
    };
  }

  return results;
}

// 조별 총점 계산 (빙고 점수 + 신문지탑 획득점수 + 신문지공 획득점수)
function getTeamFinalScore(teamNum, calcResults) {
  const calc = calcResults || calculateGameRankingsAndPoints();
  const bingo = Number(state.scores[teamNum].bingo) || 0;
  const towerPts = calc.tower[teamNum].points;
  const ballPts = calc.ball[teamNum].points;
  return bingo + towerPts + ballPts;
}

/* ========================================================
   화면 네비게이션
   ======================================================== */
function showView(viewId) {
  document.querySelectorAll('.view-section').forEach(el => {
    el.classList.remove('active');
  });

  const target = document.getElementById(viewId);
  if (target) {
    target.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (viewId === 'view-main') {
    updateMainDashboard();
  } else if (viewId === 'view-progress') {
    renderProgressRanking(state.currentRankingTab);
  } else if (viewId === 'view-final') {
    renderFinalResults();
  }
}

/* ========================================================
   1. 메인 대시보드
   ======================================================== */
function updateMainDashboard() {
  const calc = calculateGameRankingsAndPoints();

  ['yejin', 'minhyuk'].forEach(officerKey => {
    const officer = OFFICERS[officerKey];
    let filledCount = 0;
    let officerTotal = 0;

    officer.teams.forEach(t => {
      const team = state.scores[t];
      const total = getTeamFinalScore(t, calc);
      officerTotal += total;
      if (team.updatedAt || total > 0 || team.tower > 0 || team.ball > 0) {
        filledCount++;
      }
    });

    const statusEl = document.getElementById(`${officerKey}-status-text`);
    if (statusEl) {
      statusEl.textContent = `${filledCount}/3개 조 입력완료 · 합계 ${officerTotal}점`;
    }
  });

  let totalSaved = 0;
  for (let t = 1; t <= 6; t++) {
    const team = state.scores[t];
    if (team.updatedAt || getTeamFinalScore(t, calc) > 0 || team.tower > 0 || team.ball > 0) {
      totalSaved++;
    }
  }
  const summaryEl = document.getElementById('main-summary-text');
  if (summaryEl) {
    summaryEl.innerHTML = `전체 <strong>${totalSaved} / 6개 조</strong> 입력 완료`;
  }
}

function openOfficerInput(officerKey) {
  const officer = OFFICERS[officerKey];
  if (!officer) return;

  state.currentOfficer = officer;
  state.currentTeam = officer.teams[0];

  renderOfficerTabs();
  loadCurrentTeamForm();
  showView('view-officer');
}

/* ========================================================
   2. 점수 입력 화면 (임원 전용 뷰)
   ======================================================== */
function renderOfficerTabs() {
  const officer = state.currentOfficer;
  if (!officer) return;

  const calc = calculateGameRankingsAndPoints();
  document.getElementById('input-officer-title').textContent = `${officer.name} 임원 점수 입력`;

  const tabContainer = document.getElementById('team-tab-bar');
  tabContainer.innerHTML = '';

  officer.teams.forEach(teamNum => {
    const btn = document.createElement('div');
    btn.className = `team-tab-item ${teamNum === state.currentTeam ? 'active' : ''}`;
    const total = getTeamFinalScore(teamNum, calc);
    btn.innerHTML = `
      <span>${teamNum}조</span>
      <span class="tab-score">${total}점</span>
    `;
    btn.onclick = () => {
      saveCurrentFormValuesToMemory();
      state.currentTeam = teamNum;
      renderOfficerTabs();
      loadCurrentTeamForm();
    };
    tabContainer.appendChild(btn);
  });
}

function loadCurrentTeamForm() {
  const teamNum = state.currentTeam;
  const teamData = state.scores[teamNum];

  document.getElementById('current-team-name-title').textContent = `${teamNum}조 점수 및 기록 입력`;
  updateCurrentTeamSumBadge();

  // 기본 게임 3종목 인풋 채우기
  const bingoInput = document.getElementById('input-bingo');
  if (bingoInput) bingoInput.value = teamData.bingo || 0;

  const towerInput = document.getElementById('input-tower');
  if (towerInput) towerInput.value = teamData.tower || 0;

  const ballInput = document.getElementById('input-ball');
  if (ballInput) ballInput.value = teamData.ball || 0;

  // 개별점수 렌더링
  renderIndividualRows(teamData.individualEntries || []);
}

function updateCurrentTeamSumBadge() {
  const teamNum = state.currentTeam;
  const calc = calculateGameRankingsAndPoints();

  // 현재 인풋의 최신 값 반영
  const bingoInput = document.getElementById('input-bingo');
  const bingo = bingoInput ? parseFloat(bingoInput.value) || 0 : (state.scores[teamNum].bingo || 0);

  const towerInfo = calc.tower[teamNum];
  const ballInfo = calc.ball[teamNum];

  const total = bingo + towerInfo.points + ballInfo.points;

  const sumBadge = document.getElementById('current-team-sum-badge');
  if (sumBadge) {
    let towerText = towerInfo.rank ? `탑:${towerInfo.points}점(${towerInfo.rank}위)` : `탑:0점`;
    let ballText = ballInfo.rank ? `공:${ballInfo.points}점(${ballInfo.rank}위)` : `공:0점`;
    sumBadge.textContent = `현재 합계: ${total}점 (${towerText}, ${ballText})`;
  }
}

function adjustScore(field, delta) {
  const input = document.getElementById(`input-${field}`);
  if (!input) return;

  let cur = parseFloat(input.value);
  if (isNaN(cur)) cur = 0;
  let next = Math.round((cur + delta) * 10) / 10; // 소수점 오차 방지
  if (next < 0) next = 0;

  input.value = next;
  saveCurrentFormValuesToMemory();
  updateCurrentTeamSumBadge();
}

function saveCurrentFormValuesToMemory() {
  const teamNum = state.currentTeam;
  if (!state.scores[teamNum]) return;

  const bingoInput = document.getElementById('input-bingo');
  if (bingoInput) {
    const val = bingoInput.value.trim() === '' ? 0 : parseFloat(bingoInput.value);
    state.scores[teamNum].bingo = isNaN(val) ? 0 : val;
  }

  const towerInput = document.getElementById('input-tower');
  if (towerInput) {
    const val = towerInput.value.trim() === '' ? 0 : parseFloat(towerInput.value);
    state.scores[teamNum].tower = isNaN(val) ? 0 : val;
  }

  const ballInput = document.getElementById('input-ball');
  if (ballInput) {
    const val = ballInput.value.trim() === '' ? 0 : parseFloat(ballInput.value);
    state.scores[teamNum].ball = isNaN(val) ? 0 : val;
  }

  // 개별점수 인풋 태그 동기화
  const nameInputs = document.querySelectorAll('.indiv-name-input');
  const scoreInputs = document.querySelectorAll('.indiv-score-input');
  nameInputs.forEach((el, i) => {
    if (state.scores[teamNum].individualEntries[i]) {
      state.scores[teamNum].individualEntries[i].name = el.value.trim();
    }
  });
  scoreInputs.forEach((el, i) => {
    if (state.scores[teamNum].individualEntries[i]) {
      const v = parseFloat(el.value);
      state.scores[teamNum].individualEntries[i].score = isNaN(v) ? 0 : v;
    }
  });
}

function handleSaveCurrentScore(showToastMsg = true) {
  const teamNum = state.currentTeam;
  saveCurrentFormValuesToMemory();
  state.scores[teamNum].updatedAt = new Date().toISOString();
  saveScores();
  renderOfficerTabs();

  if (showToastMsg) {
    showToast(`✓ ${teamNum}조 점수/기록이 저장되었습니다.`);
  }
}

function handleNextTeam() {
  handleSaveCurrentScore(false);
  const officer = state.currentOfficer;
  if (!officer) return;

  const curIdx = officer.teams.indexOf(state.currentTeam);
  if (curIdx < officer.teams.length - 1) {
    state.currentTeam = officer.teams[curIdx + 1];
    renderOfficerTabs();
    loadCurrentTeamForm();
    showToast(`→ ${state.currentTeam}조로 이동했습니다.`);
  } else {
    showToast(`✓ ${officer.name} 임원의 담당 조 저장이 완료되었습니다.`);
    showView('view-main');
  }
}

/* ========================================================
   개별점수 명단 관리
   ======================================================== */
function renderIndividualRows(entries) {
  const container = document.getElementById('indiv-list-container');
  if (!container) return;

  container.innerHTML = '';

  if (!entries || entries.length === 0) {
    container.innerHTML = `
      <div class="indiv-empty-text">
        아직 등록된 개별점수가 없습니다. 우측 '+ 인원 추가' 버튼을 눌러보세요.
      </div>
    `;
    return;
  }

  entries.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'indiv-row';
    row.innerHTML = `
      <input type="text" class="indiv-name-input" placeholder="이름 (예: 김철수)" value="${item.name || ''}" data-idx="${index}" oninput="updateIndivData(${index}, 'name', this.value)">
      <input type="number" class="indiv-score-input" placeholder="점수 (미기입시 0)" value="${item.score !== undefined ? item.score : 0}" data-idx="${index}" oninput="updateIndivData(${index}, 'score', this.value)">
      <button type="button" class="btn-remove-row" onclick="removeIndividualRow(${index})" title="삭제">✕</button>
    `;
    container.appendChild(row);
  });
}

function addIndividualRow() {
  const teamNum = state.currentTeam;
  saveCurrentFormValuesToMemory();

  if (!state.scores[teamNum].individualEntries) {
    state.scores[teamNum].individualEntries = [];
  }

  state.scores[teamNum].individualEntries.push({ name: '', score: 0 });
  renderIndividualRows(state.scores[teamNum].individualEntries);
}

function removeIndividualRow(index) {
  const teamNum = state.currentTeam;
  saveCurrentFormValuesToMemory();
  state.scores[teamNum].individualEntries.splice(index, 1);
  renderIndividualRows(state.scores[teamNum].individualEntries);
}

function updateIndivData(index, field, value) {
  const teamNum = state.currentTeam;
  if (!state.scores[teamNum].individualEntries[index]) return;

  if (field === 'score') {
    const num = parseFloat(value);
    state.scores[teamNum].individualEntries[index].score = isNaN(num) ? 0 : num;
  } else {
    state.scores[teamNum].individualEntries[index].name = value;
  }
}

/* ========================================================
   3. 진행 화면 (실시간 게임별 순위)
   ======================================================== */
function setRankingTab(tabId) {
  state.currentRankingTab = tabId;
  document.querySelectorAll('.tab-pill-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabId);
  });
  renderProgressRanking(tabId);
}

function renderProgressRanking(tabId = 'all') {
  const container = document.getElementById('ranking-container');
  if (!container) return;

  const calc = calculateGameRankingsAndPoints();
  let html = '';

  // 1. 빙고게임 렌더링
  if (tabId === 'all' || tabId === 'bingo') {
    const list = [];
    for (let t = 1; t <= 6; t++) {
      list.push({
        team: t,
        name: state.scores[t].name,
        officer: state.scores[t].officer,
        score: Number(state.scores[t].bingo) || 0
      });
    }
    list.sort((a, b) => b.score - a.score);

    html += `
      <div class="clean-card ranking-card">
        <div class="ranking-card-header">
          <span class="ranking-card-title">🎯 빙고게임 순위</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">점수 높은 순</span>
        </div>
        <div class="rank-table-list">
    `;

    let curR = 1;
    for (let i = 0; i < list.length; i++) {
      if (i > 0 && list[i].score < list[i - 1].score) curR = i + 1;
      const item = list[i];
      html += `
        <div class="rank-row ${curR === 1 ? 'top-rank-1' : ''}">
          <div class="rank-row-left">
            <div class="rank-number-box">${curR}</div>
            <div>
              <span class="rank-team-text">${item.name}</span>
              <span class="rank-officer-text">${item.officer}</span>
            </div>
          </div>
          <span class="rank-score-text">${item.score}점</span>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  // 2. 신문지탑 렌더링 (높을수록 순위 높음)
  if (tabId === 'all' || tabId === 'tower') {
    const list = [];
    for (let t = 1; t <= 6; t++) {
      const info = calc.tower[t];
      list.push({
        team: t,
        name: state.scores[t].name,
        officer: state.scores[t].officer,
        cm: info.cm,
        rank: info.rank,
        points: info.points
      });
    }
    // cm 내림차순 정렬
    list.sort((a, b) => b.cm - a.cm);

    html += `
      <div class="clean-card ranking-card">
        <div class="ranking-card-header">
          <div>
            <span class="ranking-card-title">🗼 신문지탑 순위 (높이)</span>
            <div style="font-size: 0.78rem; color: var(--primary); margin-top: 0.2rem;">
              높을수록 1등 · 1등 15점, 2등 10점, 3등 5점
            </div>
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">높이 순</span>
        </div>
        <div class="rank-table-list">
    `;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const rankBadge = item.rank ? `${item.rank}` : '-';
      const isTop1 = item.rank === 1;

      html += `
        <div class="rank-row ${isTop1 ? 'top-rank-1' : ''}">
          <div class="rank-row-left">
            <div class="rank-number-box">${rankBadge}</div>
            <div>
              <span class="rank-team-text">${item.name}</span>
              <span class="rank-officer-text">${item.officer}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="rank-score-text">${item.cm} cm</span>
            <div style="font-size: 0.8rem; font-weight: 700; color: ${item.points > 0 ? 'var(--primary)' : 'var(--text-light)'};">
              +${item.points}점 획득
            </div>
          </div>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  // 3. 신문지공 렌더링 (작을수록 순위 높음)
  if (tabId === 'all' || tabId === 'ball') {
    const list = [];
    for (let t = 1; t <= 6; t++) {
      const info = calc.ball[t];
      list.push({
        team: t,
        name: state.scores[t].name,
        officer: state.scores[t].officer,
        cm: info.cm,
        rank: info.rank,
        points: info.points
      });
    }
    // cm > 0 작은 순 우선 정렬, 0cm는 최하단
    list.sort((a, b) => {
      if (a.cm <= 0 && b.cm <= 0) return 0;
      if (a.cm <= 0) return 1;
      if (b.cm <= 0) return -1;
      return a.cm - b.cm;
    });

    html += `
      <div class="clean-card ranking-card">
        <div class="ranking-card-header">
          <div>
            <span class="ranking-card-title">⚾ 신문지공 순위 (둘레/크기)</span>
            <div style="font-size: 0.78rem; color: var(--primary); margin-top: 0.2rem;">
              작을수록 1등 · 1등 15점, 2등 10점, 3등 5점 (0cm 미입력은 0점)
            </div>
          </div>
          <span style="font-size: 0.8rem; color: var(--text-muted);">작은 순</span>
        </div>
        <div class="rank-table-list">
    `;

    for (let i = 0; i < list.length; i++) {
      const item = list[i];
      const rankBadge = item.rank ? `${item.rank}` : '-';
      const isTop1 = item.rank === 1;

      html += `
        <div class="rank-row ${isTop1 ? 'top-rank-1' : ''}">
          <div class="rank-row-left">
            <div class="rank-number-box">${rankBadge}</div>
            <div>
              <span class="rank-team-text">${item.name}</span>
              <span class="rank-officer-text">${item.officer}</span>
            </div>
          </div>
          <div style="text-align: right;">
            <span class="rank-score-text">${item.cm > 0 ? item.cm + ' cm' : '미기입'}</span>
            <div style="font-size: 0.8rem; font-weight: 700; color: ${item.points > 0 ? 'var(--primary)' : 'var(--text-light)'};">
              +${item.points}점 획득
            </div>
          </div>
        </div>
      `;
    }
    html += `</div></div>`;
  }

  // 4. 개별점수 렌더링 (인원별 순위만)
  if (tabId === 'all' || tabId === 'individual') {
    const individuals = [];

    for (let t = 1; t <= 6; t++) {
      const data = state.scores[t];
      const entries = data.individualEntries || [];

      entries.forEach(entry => {
        const s = Number(entry.score) || 0;
        if (entry.name && entry.name.trim() !== '') {
          individuals.push({
            name: entry.name.trim(),
            team: data.name,
            officer: data.officer,
            score: s
          });
        }
      });
    }

    individuals.sort((a, b) => b.score - a.score);

    html += `
      <div class="clean-card ranking-card">
        <div class="ranking-card-header">
          <span class="ranking-card-title">⭐ 개별점수 순위 (개인별)</span>
          <span style="font-size: 0.8rem; color: var(--text-muted);">총 ${individuals.length}명</span>
        </div>
        <div class="rank-table-list">
    `;

    if (individuals.length === 0) {
      html += `<div style="text-align:center; padding: 1.25rem; color: var(--text-muted); font-size: 0.88rem;">등록된 개별점수 인원이 없습니다.</div>`;
    } else {
      let curR = 1;
      for (let i = 0; i < individuals.length; i++) {
        if (i > 0 && individuals[i].score < individuals[i - 1].score) curR = i + 1;
        const p = individuals[i];
        html += `
          <div class="rank-row ${curR === 1 ? 'top-rank-1' : ''}">
            <div class="rank-row-left">
              <div class="rank-number-box">${curR}</div>
              <div>
                <span class="rank-team-text">${p.name}</span>
                <span class="rank-officer-text">${p.team} (${p.officer})</span>
              </div>
            </div>
            <span class="rank-score-text">${p.score}점</span>
          </div>
        `;
      }
    }

    html += `</div></div>`;
  }

  container.innerHTML = html;
}

/* ========================================================
   4. 최종 결과 화면 (3개 게임 최종 점수 합산)
   ======================================================== */
function renderFinalResults() {
  const calc = calculateGameRankingsAndPoints();
  const list = [];

  for (let t = 1; t <= 6; t++) {
    const data = state.scores[t];
    const bingo = Number(data.bingo) || 0;
    const tower = calc.tower[t];
    const ball = calc.ball[t];
    const total = bingo + tower.points + ball.points;

    list.push({
      team: t,
      name: data.name,
      officer: data.officer,
      bingo: bingo,
      towerCm: tower.cm,
      towerRank: tower.rank,
      towerPts: tower.points,
      ballCm: ball.cm,
      ballRank: ball.rank,
      ballPts: ball.points,
      total: total
    });
  }

  list.sort((a, b) => b.total - a.total);

  const top1 = list[0] || { name: '-', total: 0 };
  const top2 = list[1] || { name: '-', total: 0 };
  const top3 = list[2] || { name: '-', total: 0 };

  document.getElementById('final-1st-name').textContent = top1.name;
  document.getElementById('final-1st-score').textContent = `${top1.total}점`;

  document.getElementById('final-2nd-name').textContent = top2.name;
  document.getElementById('final-2nd-score').textContent = `${top2.total}점`;

  document.getElementById('final-3rd-name').textContent = top3.name;
  document.getElementById('final-3rd-score').textContent = `${top3.total}점`;

  const tbody = document.getElementById('final-table-body');
  if (tbody) {
    let tbodyHtml = '';
    let curR = 1;
    for (let i = 0; i < list.length; i++) {
      if (i > 0 && list[i].total < list[i - 1].total) curR = i + 1;
      const item = list[i];

      const towerDetail = item.towerCm > 0
        ? `<strong>+${item.towerPts}점</strong> <span style="font-size:0.8rem; color:var(--text-light);">(${item.towerCm}cm, ${item.towerRank}위)</span>`
        : `<span style="color:var(--text-light);">0점 (미기입)</span>`;

      const ballDetail = item.ballCm > 0
        ? `<strong>+${item.ballPts}점</strong> <span style="font-size:0.8rem; color:var(--text-light);">(${item.ballCm}cm, ${item.ballRank}위)</span>`
        : `<span style="color:var(--text-light);">0점 (미기입)</span>`;

      tbodyHtml += `
        <tr>
          <td style="font-weight: 700; color: ${curR === 1 ? 'var(--gold)' : 'var(--text-title)'};">${curR}위</td>
          <td class="td-team">${item.name} <span style="font-size:0.75rem; color:var(--text-light); font-weight:normal;">(${item.officer})</span></td>
          <td>${item.bingo}점</td>
          <td>${towerDetail}</td>
          <td>${ballDetail}</td>
          <td class="td-total">${item.total}점</td>
        </tr>
      `;
    }
    tbody.innerHTML = tbodyHtml;
  }

  if (typeof Confetti !== 'undefined' && Confetti.start) {
    Confetti.start(4000);
  }
}

/* ========================================================
   유틸 및 샘플/리셋 로직
   ======================================================== */
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2200);
}

function openResetModal() {
  const modal = document.getElementById('reset-modal');
  if (modal) modal.classList.add('active');
}

function closeResetModal() {
  const modal = document.getElementById('reset-modal');
  if (modal) modal.classList.remove('active');
}

async function confirmResetData() {
  state.scores = createInitialScores();
  saveScores();
  closeResetModal();
  updateMainDashboard();

  try {
    await fetch('/api/reset', { method: 'POST' });
  } catch (e) {
    console.warn('Server reset sync failed:', e);
  }

  showToast('✓ 모든 점수 및 측정 기록이 0으로 초기화되었습니다.');
}

async function loadSampleData() {
  try {
    const res = await fetch('/api/sample', { method: 'POST' });
    const data = await res.json();
    if (data && data.scores) {
      state.scores = data.scores;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
      updateMainDashboard();
      showToast('✓ 센티미터(cm) 기반 샘플 데이터가 채워졌습니다.');
      return;
    }
  } catch (e) {
    console.warn('Server sample sync fallback:', e);
  }

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

  state.scores = sample;
  saveScores();
  showToast('✓ 센티미터(cm) 기반 샘플 데이터가 채워졌습니다.');
  updateMainDashboard();
}

/* ========================================================
   실시간 동기화 엔진 (Firebase Realtime DB & Local Server)
   ======================================================== */
let currentEventSource = null;

function updateSyncBadgeUI(isConnected, text) {
  const pill = document.getElementById('sync-status-pill');
  const label = document.getElementById('sync-status-label');
  if (!pill || !label) return;

  if (isConnected) {
    pill.classList.add('connected');
    label.textContent = text;
  } else {
    pill.classList.remove('connected');
    label.textContent = text;
  }
}

function initRealtimeSync() {
  const fireUrl = getFirebaseUrl();
  const isStaticHosting = window.location.hostname.endsWith('github.io') || window.location.protocol === 'file:';

  // 1. Firebase Database URL이 등록되어 있는 경우 (LTE, 5G, 모든 기기 실시간 동기화)
  if (fireUrl) {
    updateSyncBadgeUI(true, '🔥 Firebase 실시간 연동 중 (LTE·5G 지원)');

    // 1-1. 초기 최신 데이터 1회 가져오기
    fetch(`${fireUrl}/scores.json`)
      .then(res => res.json())
      .then(data => {
        if (data && typeof data === 'object') {
          state.scores = data;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
          refreshCurrentActiveView();
        }
      })
      .catch(err => {
        console.warn('Initial Firebase fetch error:', err);
      });

    // 1-2. Firebase Realtime SSE 스트림 연결
    if (typeof EventSource !== 'undefined') {
      try {
        if (currentEventSource) currentEventSource.close();
        currentEventSource = new EventSource(`${fireUrl}/scores.json`);

        currentEventSource.addEventListener('put', (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.path === '/' && payload.data) {
              state.scores = payload.data;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
              refreshCurrentActiveView();
            } else if (payload && payload.path && payload.path !== '/') {
              // 하위 필드 변경 시 전체 재조회
              fetch(`${fireUrl}/scores.json`)
                .then(r => r.json())
                .then(d => {
                  if (d) {
                    state.scores = d;
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
                    refreshCurrentActiveView();
                  }
                });
            }
          } catch (e) {
            console.error('Firebase SSE parse error:', e);
          }
        });

        currentEventSource.onerror = () => {
          console.warn('Firebase EventSource reconnecting...');
        };
      } catch (e) {
        console.warn('Firebase EventSource init failed:', e);
      }
    }
    return;
  }

  // 2. Firebase 미설정 상태에서 로컬 서버(Node.js server.js)로 실행 중인 경우
  if (!isStaticHosting) {
    updateSyncBadgeUI(true, '💻 로컬 서버 연동 중 (동일 Wi-Fi)');

    fetch('/api/scores')
      .then(res => res.json())
      .then(data => {
        if (data && data.scores) {
          state.scores = data.scores;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
          refreshCurrentActiveView();
        }
      })
      .catch(() => {});

    if (typeof EventSource !== 'undefined') {
      try {
        if (currentEventSource) currentEventSource.close();
        currentEventSource = new EventSource('/api/events');

        currentEventSource.onmessage = (event) => {
          try {
            const payload = JSON.parse(event.data);
            if (payload && payload.scores) {
              state.scores = payload.scores;
              localStorage.setItem(STORAGE_KEY, JSON.stringify(state.scores));
              refreshCurrentActiveView();
            }
          } catch (e) {}
        };
      } catch (e) {}
    }
    return;
  }

  // 3. GitHub Pages 정적 배포 환경에서 아직 Firebase 미연동 상태인 경우
  updateSyncBadgeUI(false, '⚙️ 실시간 동기화 설정 (Firebase 연동 필요)');
}

function refreshCurrentActiveView() {
  updateMainDashboard();

  const isOfficerActive = document.getElementById('view-officer')?.classList.contains('active');
  const hasFocusedInput = document.activeElement && (document.activeElement.tagName === 'INPUT');

  if (isOfficerActive && !hasFocusedInput) {
    renderOfficerTabs();
    loadCurrentTeamForm();
  } else if (document.getElementById('view-progress')?.classList.contains('active')) {
    renderProgressRanking(state.currentRankingTab);
  } else if (document.getElementById('view-final')?.classList.contains('active')) {
    renderFinalResults();
  }
}

/* ========================================================
   Firebase 설정 모달 제어
   ======================================================== */
function openFirebaseModal() {
  const modal = document.getElementById('firebase-modal');
  const input = document.getElementById('modal-firebase-url');
  if (modal) {
    if (input) input.value = getFirebaseUrl();
    modal.classList.add('active');
  }
}

function closeFirebaseModal() {
  const modal = document.getElementById('firebase-modal');
  if (modal) modal.classList.remove('active');
}

function saveFirebaseUrlFromModal() {
  const input = document.getElementById('modal-firebase-url');
  if (!input) return;

  let url = input.value.trim();
  if (url.endsWith('/')) url = url.slice(0, -1);

  if (url && !url.startsWith('https://')) {
    alert('올바른 Firebase Realtime Database URL(https://...)을 입력해주세요.');
    return;
  }

  if (url) {
    localStorage.setItem('ifriend_firebase_url', url);
    closeFirebaseModal();
    showToast('🔥 Firebase 실시간 동기화가 설정되었습니다!');
    // 즉시 현재 점수를 Firebase에 최초 업로드 및 동기화 시작
    saveScores();
    initRealtimeSync();
  } else {
    localStorage.removeItem('ifriend_firebase_url');
    closeFirebaseModal();
    showToast('Firebase 설정이 해제되었습니다.');
    initRealtimeSync();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateMainDashboard();
  initRealtimeSync();

  ['bingo', 'tower', 'ball'].forEach(field => {
    const input = document.getElementById(`input-${field}`);
    if (input) {
      input.addEventListener('input', () => {
        saveCurrentFormValuesToMemory();
        updateCurrentTeamSumBadge();
      });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleSaveCurrentScore(true);
      });
    }
  });
});
