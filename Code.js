/**
 * ARTS Manager v1.0.1 FULL
 * KPI completed + in-app update center foundation.
 * 4 file distribution: Code.gs / Index.html / Style.html / Script.html
 */
const SPREADSHEET_ID = '1iIXf9noqUBgmrEOgEwB1tnfgjnXiq-pIyuMS5mcTBlA';

const APP = {
  VERSION: '1.1.1-test',
  NAME: 'ARTS Manager',
  TZ: 'Asia/Tokyo',
  TOKEN_TTL_SEC: 21600,
  RELEASE_NOTES: [
    'ログイン完成版を土台化',
    '更新センターV2を追加',
    'データ更新・マスタ修復・バックアップを安定化',
    'コード更新用マニフェストURL欄を追加',
    '更新履歴・バックアップ履歴を軽量表示',
    '更新/バックアップ戻り値を軽量化してnull落ち対策'
  ],
  SHEETS: {
    SETTINGS: '設定',
    STAFF: 'スタッフマスタ',
    STORES: '店舗マスタ',
    CARRIERS: 'キャリアマスタ',
    ITEMS: 'キャリア項目マスタ',
    RESULTS: '実績DB',
    CLOSE: '月締め',
    LOG: '更新履歴',
    BACKUP: 'バックアップログ',
    UPDATE: '更新センター',
    DEVLOG: '開発ログ',
    DEVREQ: '開発依頼DB',
    DEBUGLOG: 'DebugLogDB',
    RELEASEDB: 'ReleaseDB',
    DEPLOYQUEUE: 'DeployQueueDB',
    AIQUEUE: 'AI_QUEUE',
    AIDEPLOYQUEUE: 'DEPLOY_QUEUE'
  },
  AIQUEUE_HEADERS: ['ID','TaskID','状態','担当AI','優先度','作成日時','開始日時','完了日時','Prompt','Response','Build','Deploy','WorkerStatus','BuildVersion','ErrorMessage'],
  AIDEPLOYQUEUE_HEADERS: ['ID','TaskID','AIQueueID','状態','BuildVersion','作成日時','Build完了日時','Deploy日時','担当AI','備考'],
  RELEASEDB_HEADERS: ['ID','日時','バージョン','追加','修正','削除','リリースノート','状態','作成者'],
  DEPLOYQUEUE_HEADERS: ['ID','日時','バージョン','ReleaseID','状態','リクエスト者'],
  DEVREQ_HEADERS: ['ID','日時','種類','タイトル','内容','優先度','状態','担当','作成者','更新日'],
  DEBUGLOG_HEADERS: [
    'ID','日時','依頼ID',
    'Version','Build','アプリ更新日時',
    'ログインユーザー','権限','店舗','キャリア',
    '端末名','OS','ブラウザ','画面サイズ','言語','タイムゾーン',
    '発生日時','表示ページ','URL','ネットワーク状態','オンライン状態',
    'JSエラー','ConsoleError','ConsoleWarning','ConsoleLog直近100件',
    'STATE','Filter','ログイン状態',
    'スクリーンショット','画像URL'
  ],
  RESULT_HEADERS: [
    'ID','作成日時','更新日時','対象日','年','月','年月','店舗','スタッフ','キャリア','項目','件数','備考','入力者','操作','元ID','有効'
  ]
};

function doGet() {
  ensureSchema_();
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

function bootstrap() {
  ensureSchema_();
  return {
    ok: true,
    appName: APP.NAME,
    version: APP.VERSION,
    publicData: getPublicData(),
    update: getUpdateStatus_()
  };
}

function getPublicData() {
  const __t0 = Date.now();
  try {
    // Try to use script cache for master data to reduce SpreadsheetApp calls
    const cache = CacheService.getScriptCache();
    const cacheKey = 'ARTS_MASTER_V1';
    try {
      const cached = cache.get(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (e) {
      // ignore cache errors and continue to build master
    }

    ensureSchema_();
    repairLoginMaster_();
    const staffRows = sheetObjects_(APP.SHEETS.STAFF);
    const storeRows = sheetObjects_(APP.SHEETS.STORES);
    const carrierRows = sheetObjects_(APP.SHEETS.CARRIERS);
    const itemRows = sheetObjects_(APP.SHEETS.ITEMS);
    let staff = staffRows.filter(r => truthy_(r['有効']) || String(r['有効']).trim() === '').map(r => ({
      id: r['スタッフID'], name: r['スタッフ名'], role: normalizeRole_(r['権限']), store: r['所属店舗'] || ''
    })).filter(s => s.name);
    if (!staff.length) {
      setupEmergencyLogin();
      staff = sheetObjects_(APP.SHEETS.STAFF).filter(r => truthy_(r['有効']) || String(r['有効']).trim() === '').map(r => ({
        id: r['スタッフID'], name: r['スタッフ名'], role: normalizeRole_(r['権限']), store: r['所属店舗'] || ''
      })).filter(s => s.name);
    }
    const out = {
      version: APP.VERSION,
      staff,
      stores: storeRows.filter(r => truthy_(r['有効']) || String(r['有効']).trim() === ''),
      carriers: carrierRows.filter(r => truthy_(r['有効']) || String(r['有効']).trim() === ''),
      items: itemRows.filter(r => truthy_(r['有効']) || String(r['有効']).trim() === '')
    };
    try { cache.put(cacheKey, JSON.stringify(out), 600); } catch (e) { /* ignore cache put errors */ }
    return out;
  } finally {
    const __t1 = Date.now();
    try { Logger.log('TIMING getPublicData start=%s end=%s duration=%dms', new Date(__t0).toISOString(), new Date(__t1).toISOString(), __t1 - __t0); } catch (e) {}
  }
}


function login(payload) {
  const __t0 = Date.now();
  try {
    ensureSchema_();
    payload = payload || {};
    let staffName = String(payload.staffName || '').trim();
    const pin = String(payload.pin || '0000').trim();
    repairLoginMaster_();
    if (!staffName) staffName = '管理者';
    const staff = sheetObjects_(APP.SHEETS.STAFF).find(r => String(r['スタッフ名']) === staffName && (truthy_(r['有効']) || String(r['有効']).trim() === ''));
    if (!staff) throw new Error('有効なスタッフが見つかりません。');
    const saved = String(staff['パスコード'] || '0000').trim();
    if (pin !== saved) throw new Error('パスコードが違います。');
    const user = {
      id: staff['スタッフID'] || '',
      staffName: staff['スタッフ名'],
      role: normalizeRole_(staff['権限']),
      store: staff['所属店舗'] || '',
      isAdmin: isAdmin_(staff['権限'])
    };
    const token = Utilities.getUuid().replace(/-/g, '') + Date.now();
    CacheService.getScriptCache().put('ARTS_TOKEN_' + token, JSON.stringify(user), APP.TOKEN_TTL_SEC);
    log_('LOGIN', user.staffName, user.staffName, 'ログイン');
    return { ok: true, token, user };
  } finally {
    const __t1 = Date.now();
    try { Logger.log('TIMING login start=%s end=%s duration=%dms', new Date(__t0).toISOString(), new Date(__t1).toISOString(), __t1 - __t0); } catch (e) {}
  }
}

function loginFull(payload) {
  const loginResult = login(payload);
  const token = loginResult && loginResult.token;
  const user = loginResult && loginResult.user;
  if (!token) throw new Error('loginFull: token生成失敗');
  const today = fmt_(new Date(), 'yyyy-MM-dd');
  const month = fmt_(new Date(), 'yyyy-MM');
  const app = {
    version: APP.VERSION,
    today,
    month,
    user,
    master: { version: APP.VERSION, staff: [], stores: [], carriers: [], items: [] },
    dashboard: {
      month,
      locked: false,
      filter: { month },
      scope: user.isAdmin ? 'ALL' : user.staffName,
      summary: { pi: 0, spsp: 0, hikari: 0, home5g: 0, card: 0, denki: 0, valuePass: 0, approach: 0, proposal: 0, ienaka: 0, rows: 0, target: 0, achievement: 0, remaining: 0 },
      byItem: [],
      byCarrier: [],
      byStore: [],
      ranking: [],
      daily: [],
      recent: [],
      filing: { years: [], months: [], stores: [], staff: [], carriers: [] }
    },
    results: [],
    settings: {}
  };

  return safeReturn_({ ok: true, token: token, user: user, app: app });
}

function logout(token) {
  if (token) CacheService.getScriptCache().remove('ARTS_TOKEN_' + token);
  return { ok: true };
}

function getAppData(token) {
  try {
    const today = fmt_(new Date(), 'yyyy-MM-dd');
    const ym = fmt_(new Date(), 'yyyy-MM');
    const fallbackDashboard = {
      month: ym,
      locked: false,
      filter: { month: ym },
      scope: 'ALL',
      summary: { pi: 0, spsp: 0, hikari: 0, home5g: 0, card: 0, denki: 0, valuePass: 0, approach: 0, proposal: 0, ienaka: 0, rows: 0, target: 0, achievement: 0, remaining: 0 },
      byItem: [],
      byCarrier: [],
      byStore: [],
      ranking: [],
      daily: [],
      recent: [],
      filing: { years: [], months: [], stores: [], staff: [], carriers: [] }
    };
    const fallbackUpdate = {
      ok: true,
      currentVersion: APP.VERSION,
      bundledVersion: APP.VERSION,
      needUpdate: false,
      mode: 'APP_INTERNAL_SCHEMA_UPDATE',
      note: '',
      history: []
    };

    let user = {};
    let master = { version: APP.VERSION, staff: [], stores: [], carriers: [], items: [] };
    let settings = {};
    let dashboard = fallbackDashboard;
    let results = [];
    let update = fallbackUpdate;

    try {
      user = verify_(token) || {};
    } catch (e) {
      user = {};
    }

    try {
      ensureSchema_();
    } catch (e) {
      // keep fallback values
    }

    try {
      const pub = getPublicData();
      if (pub && typeof pub === 'object') {
        master = pub;
        if (!user.isAdmin && Array.isArray(master.staff)) {
          master.staff = master.staff.filter(s => String(s.name) === String(user.staffName));
        }
      }
    } catch (e) {
      master = { version: APP.VERSION, staff: [], stores: [], carriers: [], items: [] };
    }

    try {
      settings = settings_() || {};
    } catch (e) {
      settings = {};
    }

    try {
      const d = getDashboard({ month: ym }, token);
      if (d && typeof d === 'object') {
        dashboard = d;
      }
    } catch (e) {
      dashboard = fallbackDashboard;
    }

    try {
      const rows = listResults({ month: ym }, token);
      if (Array.isArray(rows)) {
        results = rows;
      }
    } catch (e) {
      results = [];
    }

    try {
      if (user && user.isAdmin) {
        const u = getUpdateStatus_();
        if (u && typeof u === 'object') {
          update = u;
        }
      }
    } catch (e) {
      update = fallbackUpdate;
    }

    const safeMaster = master && typeof master === 'object' ? master : { version: APP.VERSION, staff: [], stores: [], carriers: [], items: [] };
    const safeSettings = settings && typeof settings === 'object' ? settings : {};
    const safeDashboard = dashboard && typeof dashboard === 'object' ? dashboard : fallbackDashboard;
    const safeResults = Array.isArray(results) ? results : [];
    const safeUpdate = update && typeof update === 'object' ? update : fallbackUpdate;

    return safeReturn_({
      ok: true,
      master: {
        version: APP.VERSION,
        staff: Array.isArray(safeMaster.staff) ? safeMaster.staff : [],
        stores: Array.isArray(safeMaster.stores) ? safeMaster.stores : [],
        carriers: Array.isArray(safeMaster.carriers) ? safeMaster.carriers : [],
        items: Array.isArray(safeMaster.items) ? safeMaster.items : []
      },
      dashboard: safeDashboard,
      results: safeResults,
      settings: safeSettings,
      update: safeUpdate,
      today,
      month: ym,
      version: APP.VERSION,
      user
    });
  } catch (e) {
    throw new Error(
      'getAppData: ' +
      e.message +
      '\n\n' +
      (e.stack || '')
    );
  }
}

function saveResult(payload, token) {
  const __t0 = Date.now();
  try {
    const user = verify_(token);
    ensureSchema_();
    payload = payload || {};
    validateResultPayload_(payload);
    if (!user.isAdmin && String(payload.staffName) !== String(user.staffName)) throw new Error('自分以外の実績は保存できません。');
    const date = parseDate_(payload.date);
    const ym = fmt_(date, 'yyyy-MM');
    if (isLocked_(ym)) throw new Error('この月は月締め済みです: ' + ym);

    const items = payload.results || {};
    const rowObjs = [];
    Object.keys(items).forEach(item => {
      const value = Number(items[item] || 0);
      rowObjs.push(makeResultRow_({
        date, store: payload.store, staffName: payload.staffName, carrier: payload.carrier,
        item, value, memo: payload.memo || '', actor: user.staffName, op: 'CREATE', sourceId: ''
      }));
    });
    if (!rowObjs.length) throw new Error('保存対象がありません。1項目以上入力してください。');
    const sh = sheet_(APP.SHEETS.RESULTS);
    const map = headerMap_(sh);
    const lastCol = Math.max(sh.getLastColumn(), APP.RESULT_HEADERS.length);
    const startRow = sh.getLastRow() + 1;
    const rowsToWrite = rowObjs.map(obj => {
      const arr = new Array(lastCol).fill('');
      Object.keys(obj).forEach(key => {
        const col = map[key];
        if (col) arr[col - 1] = obj[key];
      });
      return arr;
    });
    sh.getRange(startRow, 1, rowsToWrite.length, lastCol).setValues(rowsToWrite);
    log_('CREATE', rowObjs.map(r => r['ID']).join(','), user.staffName, `${fmt_(date,'yyyy-MM-dd')} ${payload.store} ${payload.carrier} ${rowObjs.length}件`);
    // invalidate sheetObjects cache so subsequent reads are fresh
    clearSheetObjectsCache(true);
    return { ok: true, message: `${rowObjs.length}件保存しました。`, dashboard: getDashboard({ month: ym }, token), results: listResults({ month: ym }, token) };
  } finally {
    const __t1 = Date.now();
    try { Logger.log('TIMING saveResult start=%s end=%s duration=%dms', new Date(__t0).toISOString(), new Date(__t1).toISOString(), __t1 - __t0); } catch (e) {}
  }
}

function updateResult(payload, token) {
  const user = verify_(token);
  payload = payload || {};
  if (!payload.id) throw new Error('IDがありません。');
  const sh = sheet_(APP.SHEETS.RESULTS);
  const data = table_(APP.SHEETS.RESULTS);
  const idx = data.rows.findIndex(r => String(r.obj['ID']) === String(payload.id) && truthy_(r.obj['有効']));
  if (idx < 0) throw new Error('対象実績が見つかりません。');
  const old = data.rows[idx].obj;
  if (!user.isAdmin && String(old['スタッフ']) !== String(user.staffName)) throw new Error('自分以外の実績は修正できません。');
  const ym = String(old['年月'] || '').slice(0,7);
  if (isLocked_(ym)) throw new Error('この月は月締め済みです: ' + ym);
  const rowNumber = data.rows[idx].rowNumber;
  const map = headerMap_(sh);
  if (payload.value !== undefined) sh.getRange(rowNumber, map['件数']).setValue(Number(payload.value || 0));
  if (payload.memo !== undefined) sh.getRange(rowNumber, map['備考']).setValue(payload.memo || '');
  sh.getRange(rowNumber, map['更新日時']).setValue(new Date());
  sh.getRange(rowNumber, map['操作']).setValue('UPDATE');
  log_('UPDATE', payload.id, user.staffName, `実績修正 ${payload.id}`);
  clearSheetObjectsCache(true);
  return { ok: true, message: '修正しました。', dashboard: getDashboard({ month: ym }, token), results: listResults({ month: ym }, token) };
}

function deleteResult(id, token) {
  const user = verify_(token);
  if (!id) throw new Error('IDがありません。');
  const sh = sheet_(APP.SHEETS.RESULTS);
  const data = table_(APP.SHEETS.RESULTS);
  const idx = data.rows.findIndex(r => String(r.obj['ID']) === String(id) && truthy_(r.obj['有効']));
  if (idx < 0) throw new Error('対象実績が見つかりません。');
  const old = data.rows[idx].obj;
  if (!user.isAdmin && String(old['スタッフ']) !== String(user.staffName)) throw new Error('自分以外の実績は削除できません。');
  const ym = String(old['年月'] || '').slice(0,7);
  if (isLocked_(ym)) throw new Error('この月は月締め済みです: ' + ym);
  const map = headerMap_(sh);
  sh.getRange(data.rows[idx].rowNumber, map['有効']).setValue(false);
  sh.getRange(data.rows[idx].rowNumber, map['更新日時']).setValue(new Date());
  sh.getRange(data.rows[idx].rowNumber, map['操作']).setValue('DELETE');
  log_('DELETE', id, user.staffName, `実績削除 ${id}`);
  clearSheetObjectsCache(true);
  return { ok: true, message: '削除しました。', dashboard: getDashboard({ month: ym }, token), results: listResults({ month: ym }, token) };
}

function listResults(filter, token) {
  const __t0 = Date.now();
  try {
    const user = verify_(token);
    filter = filter || {};
    const rows = activeResults_().filter(r => matchFilter_(r, filter));
    const scoped = user.isAdmin ? rows : rows.filter(r => String(r['スタッフ']) === String(user.staffName));
    const nonZero = scoped.filter(r => Number(r['件数'] || 0) > 0);
    const out = nonZero.slice(-200).reverse().filter(r => !isNaN(new Date(r['対象日']).getTime())).map(r => ({
      id: r['ID'], date: fmt_(new Date(r['対象日']), 'yyyy-MM-dd'), year: r['年'], month: r['月'], ym: r['年月'],
      store: r['店舗'], staff: r['スタッフ'], carrier: r['キャリア'], item: r['項目'], value: Number(r['件数'] || 0), memo: r['備考'] || ''
    }));
    try {
      const jsonStr = JSON.stringify(out);
      return JSON.parse(jsonStr);
    } catch (e) {
      throw e;
    }
  } finally {
    const __t1 = Date.now();
    try { Logger.log('TIMING listResults start=%s end=%s duration=%dms', new Date(__t0).toISOString(), new Date(__t1).toISOString(), __t1 - __t0); } catch (e) {}
  }
}

function getDashboard(filter, token) {
  const __t0 = Date.now();
  try {
    const user = verify_(token);
    filter = filter || {};
    const month = filter.month || filter.ym || fmt_(new Date(), 'yyyy-MM');
    filter.month = month;
    let rows = activeResults_().filter(r => matchFilter_(r, filter));
    if (!user.isAdmin) rows = rows.filter(r => String(r['スタッフ']) === String(user.staffName));
    const totalByItem = sumBy_(rows, '項目');
    const byCarrier = sumBy_(rows, 'キャリア');
    const byStore = sumByItem_(rows, '店舗', ['PI','MNP']);
    const byStaff = {};
    const daily = {};
    rows.forEach(r => {
      const targetDate = new Date(r['対象日']);
      if (isNaN(targetDate.getTime())) return; // 対象日が空・不正な行は集計から除外
      const value = Number(r['件数'] || 0);
      const staff = r['スタッフ'] || '未設定';
      byStaff[staff] = byStaff[staff] || { staff, pi: 0, total: 0 };
      byStaff[staff].total += value;
      if (isPi_(r['項目'])) byStaff[staff].pi += value;
      const d = fmt_(targetDate, 'MM/dd');
      daily[d] = daily[d] || { date: d, pi: 0, total: 0 };
      daily[d].total += value;
      if (isPi_(r['項目'])) daily[d].pi += value;
    });
    const pi = Number(totalByItem.PI || 0) + Number(totalByItem.MNP || 0);
    const spsp = Number(totalByItem.SPSP || 0) + Number(totalByItem['SP→SP'] || 0) + Number(totalByItem['機種変更'] || 0);
    const hikari = Number(totalByItem['ドコモ光'] || 0);
    const home5g = Number(totalByItem.home5G || totalByItem['home5G'] || 0);
    const card = Number(totalByItem['dカードGOLD'] || 0) + Number(totalByItem['dカードGOLD PLATINUM'] || 0) + Number(totalByItem['dカード'] || 0);
    const denki = Number(totalByItem['ドコモでんき'] || 0);
    const valuePass = Number(totalByItem['dバリューパス'] || 0);
    const approach = Number(totalByItem['アプローチ数'] || 0);
    const proposal = Number(totalByItem['提案数'] || 0);
    const ienaka = hikari + home5g + card + denki;
    const target = Number(settings_()['PI目標'] || 40);
    const out = {
      month,
      locked: isLocked_(month),
      filter,
      scope: user.isAdmin ? 'ALL' : user.staffName,
      summary: { pi, spsp, hikari, home5g, card, denki, valuePass, approach, proposal, ienaka, rows: rows.length, target, achievement: target ? pi / target : 0, remaining: Math.max(0, target - pi) },
      byItem: objArray_(totalByItem, 'item'),
      byCarrier: objArray_(byCarrier, 'carrier'),
      byStore: objArray_(byStore, 'store').slice(0,20),
      ranking: Object.values(byStaff).sort((a,b)=>b.pi-a.pi || b.total-a.total).slice(0,20),
      daily: Object.values(daily).sort((a,b)=>a.date.localeCompare(b.date)).slice(-31),
      recent: listResults({}, token).slice(0, 10),
      filing: getFilingOptions_(user)
    };
    try {
      const jsonStr = JSON.stringify(out);
      return JSON.parse(jsonStr);
    } catch (e) {
      throw e;
    }
  } finally {
    const __t1 = Date.now();
    try { Logger.log('TIMING getDashboard start=%s end=%s duration=%dms', new Date(__t0).toISOString(), new Date(__t1).toISOString(), __t1 - __t0); } catch (e) {}
  }
}

function getFilingOptions(tokenOrUser) {
  const user = typeof tokenOrUser === 'string' ? verify_(tokenOrUser) : tokenOrUser;
  return getFilingOptions_(user);
}
function getFilingOptions_(user) {
  let rows = activeResults_();
  if (user && !user.isAdmin) rows = rows.filter(r => String(r['スタッフ']) === String(user.staffName));
  const validDates = rows.map(r => new Date(r['対象日'])).filter(d => !isNaN(d.getTime()));
  const years = unique_(validDates.map(d => fmt_(d, 'yyyy'))).sort().reverse();
  const months = unique_(validDates.map(d => fmt_(d, 'yyyy-MM'))).sort().reverse();
  const stores = unique_(rows.map(r => r['店舗']).filter(Boolean)).sort();
  const staff = unique_(rows.map(r => r['スタッフ']).filter(Boolean)).sort();
  const carriers = unique_(rows.map(r => r['キャリア']).filter(Boolean)).sort();
  return { years, months, stores, staff, carriers };
}

function generateReport(type, filter, token) {
  const user = verify_(token);
  const dash = getDashboard(filter || {}, token);
  const s = dash.summary;
  const lines = [];
  if (type === 'daily') {
    lines.push('【日報】', `対象：${filter && filter.date ? filter.date : fmt_(new Date(),'yyyy-MM-dd')}`, `報告者：${user.staffName}`, '', '■実績', `PI：${s.pi}件`, `SPSP：${s.spsp}件`, `ドコモ光：${s.hikari}件`, `home5G：${s.home5g}件`, `dカード：${s.card}件`, `ドコモでんき：${s.denki}件`, '', '■所感', '実績状況を確認し、ファーストアプローチから料金見直し・イエナカ確認までの導線を意識して活動致しました。');
  } else if (type === 'weekly') {
    lines.push('【週報】', `対象月：${dash.month}`, `作成者：${user.staffName}`, '', '■店舗全体の状況', `月間PIは${s.pi}件、達成率は${Math.round(s.achievement*100)}%で推移しております。`, '', '■課題', 'PI獲得に加え、光・home5G・カード・でんきなどのイエナカ付帯率向上が課題です。', '', '■対策', '来店時のヒアリング項目を統一し、セカンドアプローチで通信費見直しへつなげます。');
  } else {
    lines.push('【月報】', `対象月：${dash.month}`, `作成者：${user.staffName}`, '', '■月間実績', `PI：${s.pi}件`, `SPSP：${s.spsp}件`, `イエナカ：${s.ienaka}件`, '', '■総括', '実績データをもとに、獲得が伸びた店舗・スタッフの行動を横展開し、未達項目を翌月重点改善項目として管理致します。');
  }
  log_('REPORT', type, user.staffName, `${type}生成 ${dash.month}`);
  return { ok: true, text: lines.join('\n'), dashboard: dash };
}

function getAiAnalysis(filter, token) {
  const user = verify_(token);
  const d = getDashboard(filter || {}, token);
  const s = d.summary;
  const achievement = Math.round((s.achievement || 0) * 100);
  const proposalRate = s.approach ? Math.round((s.proposal / s.approach) * 100) : 0;
  const ienakaRate = s.pi ? Math.round((s.ienaka / s.pi) * 100) : 0;
  const positives = [];
  const issues = [];
  const actions = [];
  if (achievement >= 100) positives.push('PI目標は達成済みです。維持行動と付帯商材強化に移れます。');
  else if (achievement >= 70) positives.push('PI進捗は追い込み圏内です。残件の日割り管理で達成が見えます。');
  else issues.push('PI進捗が目標に対して不足しています。残り件数を日別・スタッフ別に割り振る必要があります。');
  if (s.approach && proposalRate < 35) issues.push('アプローチに対する提案化率が低めです。切り口の統一が必要です。');
  if (s.pi && ienakaRate < 30) issues.push('PIに対するイエナカ付帯が弱めです。固定系・カード・でんきの同時ヒアリングを強化してください。');
  actions.push(`今月残りPIは${s.remaining}件です。朝礼時に残件を共有してください。`);
  if (d.ranking[0]) actions.push(`${d.ranking[0].staff}さんの動きを成功例として横展開してください。`);
  actions.push('店舗別・キャリア別の弱点を確認し、家電コーナーや白物コーナーでの接点創出を増やしてください。');
  return { ok: true, score: Math.min(100, Math.max(0, achievement)), proposalRate, ienakaRate, positives, issues, actions, meetingText: ['【AI分析】', `${d.month} PI ${s.pi}/${s.target}件 達成率${achievement}% 残${s.remaining}件`, '', '■良い点', positives.map(x=>'・'+x).join('\n') || '・現時点では入力データを増やす必要があります。', '', '■課題', issues.map(x=>'・'+x).join('\n') || '・大きな課題は限定的です。', '', '■次の打ち手', actions.map(x=>'・'+x).join('\n')].join('\n'), dashboard: d };
}

function getAdminData(token) {
  const user = verify_(token); requireAdmin_(user);
  return {
    settings: settings_(),
    staff: sheetObjects_(APP.SHEETS.STAFF),
    stores: sheetObjects_(APP.SHEETS.STORES),
    carriers: sheetObjects_(APP.SHEETS.CARRIERS),
    items: sheetObjects_(APP.SHEETS.ITEMS),
    locks: sheetObjects_(APP.SHEETS.CLOSE).slice(-36).reverse(),
    logs: sheetObjects_(APP.SHEETS.LOG).slice(-80).reverse(),
    backups: sheetObjects_(APP.SHEETS.BACKUP).slice(-40).reverse(),
    update: getUpdateStatus_()
  };
}

function updateSetting(key, value, token) {
  const user = verify_(token); requireAdmin_(user);
  setSetting_(key, value);
  log_('SETTING', key, user.staffName, `${key}=${value}`);
  return { ok: true, settings: settings_(), admin: getAdminData(token) };
}

function lockMonth(month, token) { return setMonthLock_(month, 'LOCKED', token); }
function unlockMonth(month, token) { return setMonthLock_(month, 'OPEN', token); }
function setMonthLock_(month, status, token) {
  const user = verify_(token); requireAdmin_(user);
  if (!/^\d{4}-\d{2}$/.test(String(month))) throw new Error('対象月は yyyy-MM 形式で指定してください。');
  sheet_(APP.SHEETS.CLOSE).appendRow([month, status, new Date(), user.staffName]);
  clearSheetObjectsCache(true);
  log_('MONTH_' + status, month, user.staffName, month + ' ' + status);
  if (status === 'LOCKED') createBackupLog_(month, user.staffName, 'MONTH_CLOSE');
  return { ok: true, message: status === 'LOCKED' ? '月締めしました。' : '月締めを解除しました。', dashboard: getDashboard({ month }, token), admin: getAdminData(token) };
}

function getUpdateStatus(token) {
  if (token) { const user = verify_(token); if (!user.isAdmin) throw new Error('管理者権限が必要です。'); }
  return getUpdateStatus_();
}
function getUpdateStatus_() {
  const st = settings_();
  const current = String(st['現在バージョン'] || APP.VERSION);
  const manifestUrl = String(st['更新マニフェストURL'] || '').trim();
  const out = {
    ok: true,
    currentVersion: current,
    bundledVersion: APP.VERSION,
    needUpdate: current !== APP.VERSION,
    mode: 'UPDATE_ENGINE_V2',
    note: '更新センターV2：シート・列・設定・マスタ・バックアップをアプリ内で更新します。コード更新はマニフェストURL設定後に実行できます。',
    copyPasteReduction: '今後の通常アップデートは更新センターに寄せます。大改修時のみ手動上書きの可能性があります。',
    manifestUrl: manifestUrl,
    releaseNotes: APP.RELEASE_NOTES || [],
    readiness: getCodeUpdateReadiness_(),
    history: sheetObjects_(APP.SHEETS.UPDATE).slice(-30).reverse()
  };
  return JSON.parse(JSON.stringify(out));
}
function runAppUpdate(token) {
  const user = verify_(token); requireAdmin_(user);
  const before = String(settings_()['現在バージョン'] || 'unknown');
  const result = ensureSchema_();

  setSetting_('現在バージョン', APP.VERSION);
  setSetting_('最終更新日時', fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'));
  setSetting_('最終更新者', user.staffName);
  setSetting_('更新方式', 'UPDATE_ENGINE_V2');

  sheet_(APP.SHEETS.UPDATE).appendRow([
    new Date(),
    before,
    APP.VERSION,
    user.staffName,
    result.join(' / ') || '差分なし',
    'DONE'
  ]);

  createBackupLog_('APP_UPDATE', user.staffName, 'UPDATE_CENTER_V2');
  log_('APP_UPDATE', APP.VERSION, user.staffName, before + ' → ' + APP.VERSION);

  return {
    ok: true,
    message: 'データ更新完了'
  };
}
function saveUpdateManifestUrl(url, token) {
  const user = verify_(token); requireAdmin_(user);
  const clean = String(url || '').trim();
  setSetting_('更新マニフェストURL', clean);
  log_('UPDATE_MANIFEST_URL', '設定', user.staffName, clean || '空欄');
  return { ok: true, message: '更新マニフェストURLを保存しました。', update: getUpdateStatus_() };
}
function checkCodeUpdateReadiness(token) {
  const user = verify_(token); requireAdmin_(user);
  const out = { ok: true, readiness: getCodeUpdateReadiness_(), update: getUpdateStatus_() };
  return JSON.parse(JSON.stringify(out));
}
function getCodeUpdateReadiness_() {
  const out = { scriptId: '', canUseUrlFetch: false, hasManifestUrl: false, message: '' };
  try { out.scriptId = ScriptApp.getScriptId(); } catch (e) { out.scriptId = ''; }
  try { out.canUseUrlFetch = !!UrlFetchApp; } catch (e) { out.canUseUrlFetch = false; }
  try { out.hasManifestUrl = !!String(settings_()['更新マニフェストURL'] || '').trim(); } catch (e) { out.hasManifestUrl = false; }
  if (!out.scriptId) {
    out.message = 'スクリプトIDが取得できません。';
  } else if (!out.hasManifestUrl) {
    out.message = '更新マニフェストURLが未設定です。';
  } else {
    out.message = 'コード更新準備OK。Apps Script APIが有効なら実行できます。';
  }
  return out;
}
function runCodeUpdateFromManifest(token) {
  const user = verify_(token); requireAdmin_(user);
  const url = String(settings_()['更新マニフェストURL'] || '').trim();
  if (!url) throw new Error('更新マニフェストURLが未設定です。');
  const before = settings_()['現在バージョン'] || 'unknown';
  const manifestRes = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  const status = manifestRes.getResponseCode();
  if (status < 200 || status >= 300) throw new Error('マニフェスト取得失敗: HTTP ' + status);
  const manifest = JSON.parse(manifestRes.getContentText());
  if (!manifest || !manifest.version || !Array.isArray(manifest.files)) throw new Error('マニフェスト形式が不正です。');
  const scriptId = ScriptApp.getScriptId();
  if (!scriptId) throw new Error('スクリプトIDが取得できません。');
  createBackupLog_('CODE_UPDATE_BEFORE_' + manifest.version, user.staffName, 'CODE_UPDATE');
  const current = fetchScriptContent_(scriptId);
  const merged = mergeProjectFiles_(current.files || [], manifest.files);
  updateScriptContent_(scriptId, merged);

  let deployError = '';
  try {
    deployToProduction_(scriptId, manifest.version, user.staffName);
  } catch (e) {
    deployError = String(e && e.message ? e.message : e);
  }

  if (!deployError) {
    setSetting_('現在バージョン', manifest.version);
    setSetting_('最終更新日時', fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'));
    setSetting_('最終更新者', user.staffName);
    sheet_(APP.SHEETS.UPDATE).appendRow([new Date(), before, manifest.version, user.staffName, (manifest.notes || []).join(' / ') || 'コード更新', 'CODE_DONE_DEPLOYED']);
    log_('CODE_UPDATE', manifest.version, user.staffName, `${before} → ${manifest.version}`);
    return { ok: true, message: 'コード更新・公開が完了しました。', update: getUpdateStatus_() };
  }

  sheet_(APP.SHEETS.UPDATE).appendRow([new Date(), before, manifest.version, user.staffName, 'DEPLOY_FAILED: ' + deployError, 'CODE_DONE_DEPLOY_FAILED']);
  log_('CODE_UPDATE_DEPLOY_FAILED', manifest.version, user.staffName, deployError);
  return { ok: false, partial: true, message: 'コード更新は完了しましたが、自動公開に失敗しました。\n----\n' + deployError + '\n----', update: getUpdateStatus_() };
}
function deployToProduction_(scriptId, versionDescription, actorName) {
  const productionDeploymentId = String(settings_()['本番DeploymentID'] || '').trim();
  if (!productionDeploymentId) throw new Error('本番DeploymentIDが設定シートに登録されていません。');
  const version = createScriptVersion_(scriptId, 'ARTS Manager ' + versionDescription);
  const deployments = listScriptDeployments_(scriptId);
  const target = deployments.find(d => d.deploymentId === productionDeploymentId);
  if (!target) throw new Error('本番DeploymentID(' + productionDeploymentId + ')に一致するDeploymentが見つかりません。');
  updateScriptDeployment_(scriptId, productionDeploymentId, version.versionNumber, 'ARTS Manager ' + versionDescription + ' / ' + actorName);
}
function createScriptVersion_(scriptId, description) {
  const url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/versions';
  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ description: description || '' }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('バージョン作成失敗: HTTP ' + res.getResponseCode() + ' / ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
function listScriptDeployments_(scriptId) {
  const url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/deployments';
  const res = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('デプロイ一覧取得失敗: HTTP ' + res.getResponseCode() + ' / ' + res.getContentText());
  const json = JSON.parse(res.getContentText());
  return json.deployments || [];
}
function updateScriptDeployment_(scriptId, deploymentId, versionNumber, description) {
  const url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/deployments/' + encodeURIComponent(deploymentId);
  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify({ deploymentConfig: { scriptId: scriptId, versionNumber: versionNumber, manifestFileName: 'appsscript', description: description || '' } }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('デプロイ更新失敗: HTTP ' + res.getResponseCode() + ' / ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
function fetchScriptContent_(scriptId) {
  const url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/content';
  const res = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (res.getResponseCode() >= 300) throw new Error('Apps Script API取得失敗: HTTP ' + res.getResponseCode() + ' / ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
function updateScriptContent_(scriptId, files) {
  const url = 'https://script.googleapis.com/v1/projects/' + encodeURIComponent(scriptId) + '/content';
  const res = UrlFetchApp.fetch(url, {
    method: 'put',
    contentType: 'application/json',
    payload: JSON.stringify({ files: files }),
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('Apps Script API更新失敗: HTTP ' + res.getResponseCode() + ' / ' + res.getContentText());
  return JSON.parse(res.getContentText());
}
function mergeProjectFiles_(currentFiles, updateFiles) {
  const map = {};
  currentFiles.forEach(f => { map[f.name] = f; });
  updateFiles.forEach(f => {
    if (!f.name || !f.source) throw new Error('更新ファイル形式が不正です。name/source が必要です。');
    map[f.name] = { name: f.name, type: f.type || (String(f.name).match(/\.html?$/i) ? 'HTML' : 'SERVER_JS'), source: f.source };
  });
  return Object.keys(map).map(k => map[k]);
}

function createBackupLog(token) {
  const user = verify_(token); requireAdmin_(user);
  createBackupLog_('MANUAL', user.staffName, 'LOG_ONLY');
  return {
    ok: true,
    message: 'バックアップログ作成しました'
  };
}
function createBackupLog_(target, actor, type) {
  const count = Math.max(0, sheet_(APP.SHEETS.RESULTS).getLastRow() - 1);
  sheet_(APP.SHEETS.BACKUP).appendRow([new Date(), type, target, actor, '実績DB ' + count + '行 / データ保持']);
  clearSheetObjectsCache(true);
}

function getDevRequests(token) {
  verify_(token);
  ensureSchema_();
  const rows = sheetObjects_(APP.SHEETS.DEVREQ);
  return safeReturn_(rows.slice(-200).reverse());
}

function getAiQueue(token) {
  verify_(token);
  ensureSchema_();
  const rows = sheetObjects_(APP.SHEETS.AIQUEUE);
  return safeReturn_(rows.slice(-200).reverse());
}

function buildAiQueuePrompt_(devReq) {
  const updated = devReq['更新日'] ? new Date(devReq['更新日']) : null;
  const updatedStr = (updated && !isNaN(updated.getTime())) ? fmt_(updated, 'yyyy-MM-dd HH:mm') : String(devReq['更新日'] || '');
  return [
    'TaskID: ' + (devReq['ID'] || ''),
    '種類: ' + (devReq['種類'] || ''),
    'タイトル: ' + (devReq['タイトル'] || ''),
    '内容: ' + (devReq['内容'] || ''),
    '優先度: ' + (devReq['優先度'] || ''),
    '状態: ' + (devReq['状態'] || ''),
    '担当: ' + (devReq['担当'] || ''),
    '作成者: ' + (devReq['作成者'] || ''),
    '更新日: ' + updatedStr,
    '',
    '【依頼】',
    'このタスクだけを対象に、必要最小限で実装してください。',
    '既存機能への影響を避けてください。'
  ].join('\n');
}

function saveAiQueueItem(payload, token) {
  verify_(token);
  ensureSchema_();
  payload = payload || {};
  const taskId = String(payload.taskId || '').trim();
  if (!taskId) throw new Error('TaskIDが指定されていません。');
  const devReq = sheetObjects_(APP.SHEETS.DEVREQ).find(r => String(r['ID']) === taskId);
  if (!devReq) throw new Error('対象の開発依頼が見つかりません。');
  const id = nextSeqId_(APP.SHEETS.AIQUEUE, 'AIQ');
  const now = new Date();
  const prompt = buildAiQueuePrompt_(devReq);
  sheet_(APP.SHEETS.AIQUEUE).appendRow([id, taskId, 'WAITING', 'Claude', devReq['優先度'] || '', now, '', '', prompt, '', '', '', '', '', '']);
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: 'Claude Queueへ登録しました。', id: id });
}

function getDeployQueue(token) {
  verify_(token);
  ensureSchema_();
  const rows = sheetObjects_(APP.SHEETS.AIDEPLOYQUEUE);
  return safeReturn_(rows.slice(-200).reverse());
}

function saveDeployQueueItem(payload, token) {
  verify_(token);
  ensureSchema_();
  payload = payload || {};
  const aiQueueId = String(payload.aiQueueId || '').trim();
  if (!aiQueueId) throw new Error('AIQueueIDが指定されていません。');
  const aiQueueRow = sheetObjects_(APP.SHEETS.AIQUEUE).find(r => String(r['ID']) === aiQueueId);
  if (!aiQueueRow) throw new Error('対象のAI Queueが見つかりません。');
  const existing = sheetObjects_(APP.SHEETS.AIDEPLOYQUEUE).find(r => String(r['AIQueueID']) === aiQueueId);
  if (existing) return safeReturn_({ ok: true, message: '既にDeploy Queueへ登録済みです。', id: existing['ID'] });
  const id = nextSeqId_(APP.SHEETS.AIDEPLOYQUEUE, 'DPQ');
  const now = new Date();
  sheet_(APP.SHEETS.AIDEPLOYQUEUE).appendRow([id, aiQueueRow['TaskID'] || '', aiQueueId, 'READY', aiQueueRow['BuildVersion'] || '', now, now, '', aiQueueRow['担当AI'] || '', '']);
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: 'Deploy Queueへ登録しました。', id: id });
}

function getMobileReleaseSummary(token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  const currentVersion = String(settings_()['現在バージョン'] || APP.VERSION);
  const releases = sheetObjects_(APP.SHEETS.RELEASEDB);
  const latestRelease = releases[releases.length - 1];
  const nextVersion = latestRelease ? String(latestRelease['バージョン'] || '-') : '-';
  const deployRows = sheetObjects_(APP.SHEETS.AIDEPLOYQUEUE);
  const readyQueue = deployRows.filter(r => String(r['状態']) === 'READY');
  const deployingCount = deployRows.filter(r => String(r['状態']) === 'DEPLOYING').length;
  return safeReturn_({
    ok: true,
    currentVersion: currentVersion,
    nextVersion: nextVersion,
    readyCount: readyQueue.length,
    deployingCount: deployingCount,
    readyQueue: readyQueue.slice(-50).reverse(),
    recentReleases: releases.slice(-5).reverse()
  });
}

function requestDeploy(payload, token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  payload = payload || {};
  const id = String(payload.id || '').trim();
  if (!id) throw new Error('IDが指定されていません。');
  const sh = sheet_(APP.SHEETS.AIDEPLOYQUEUE);
  const data = table_(APP.SHEETS.AIDEPLOYQUEUE);
  const row = data.rows.find(r => String(r.obj['ID']) === id);
  if (!row) throw new Error('対象のDeploy Queueが見つかりません。');
  const map = headerMap_(sh);
  if (map['状態']) sh.getRange(row.rowNumber, map['状態']).setValue('DEPLOYING');
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: 'Deployを開始しました。' });
}

function getNextDeployJob(token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  const rows = sheetObjects_(APP.SHEETS.AIDEPLOYQUEUE);
  const job = rows.find(r => String(r['状態']) === 'DEPLOYING');
  if (!job) return safeReturn_(null);
  return safeReturn_({
    'ID': job['ID'],
    'TaskID': job['TaskID'],
    'AIQueueID': job['AIQueueID'],
    'BuildVersion': job['BuildVersion'],
    '担当AI': job['担当AI']
  });
}

function finishDeployJob(deployQueueId, result, token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  const id = String(deployQueueId || '').trim();
  if (!id) throw new Error('DeployQueueIDが指定されていません。');
  const normalizedResult = String(result || '').trim().toUpperCase();
  if (normalizedResult !== 'SUCCESS' && normalizedResult !== 'FAILED') throw new Error('Resultは SUCCESS または FAILED を指定してください。');
  const sh = sheet_(APP.SHEETS.AIDEPLOYQUEUE);
  const data = table_(APP.SHEETS.AIDEPLOYQUEUE);
  const row = data.rows.find(r => String(r.obj['ID']) === id);
  if (!row) throw new Error('対象のDeploy Queueが見つかりません。');
  const map = headerMap_(sh);
  const newStatus = normalizedResult === 'SUCCESS' ? 'DEPLOYED' : 'FAILED';
  if (map['状態']) sh.getRange(row.rowNumber, map['状態']).setValue(newStatus);
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: 'Deploy結果を反映しました。', status: newStatus });
}

function createGitHubActionPayload(deployQueueId, token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  const id = String(deployQueueId || '').trim();
  if (!id) throw new Error('DeployQueueIDが指定されていません。');
  const sh = sheet_(APP.SHEETS.AIDEPLOYQUEUE);
  const data = table_(APP.SHEETS.AIDEPLOYQUEUE);
  const row = data.rows.find(r => String(r.obj['ID']) === id);
  if (!row) throw new Error('対象のDeploy Queueが見つかりません。');
  if (String(row.obj['状態']) !== 'DEPLOYING') throw new Error('状態がDEPLOYINGではありません。');
  const map = headerMap_(sh);
  if (map['備考']) sh.getRange(row.rowNumber, map['備考']).setValue('GitHub Actions payload generated');
  clearSheetObjectsCache(true);
  return safeReturn_({
    deployQueueId: row.obj['ID'],
    taskId: row.obj['TaskID'],
    aiQueueId: row.obj['AIQueueID'],
    buildVersion: row.obj['BuildVersion'],
    actor: row.obj['担当AI'],
    requestedAt: fmt_(new Date(), 'yyyy-MM-dd HH:mm:ss'),
    source: 'ARTS_MANAGER_MOBILE_RELEASE'
  });
}

function markGitHubActionDispatched(deployQueueId, token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  const id = String(deployQueueId || '').trim();
  if (!id) throw new Error('DeployQueueIDが指定されていません。');
  const sh = sheet_(APP.SHEETS.AIDEPLOYQUEUE);
  const data = table_(APP.SHEETS.AIDEPLOYQUEUE);
  const row = data.rows.find(r => String(r.obj['ID']) === id);
  if (!row) throw new Error('対象のDeploy Queueが見つかりません。');
  if (String(row.obj['状態']) !== 'DEPLOYING') throw new Error('状態がDEPLOYINGではありません。');
  const map = headerMap_(sh);
  if (map['備考']) sh.getRange(row.rowNumber, map['備考']).setValue('GitHub Actions dispatched');
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: 'GitHub Actions dispatchedを記録しました。' });
}

function saveDevRequest(payload, token) {
  const user = verify_(token);
  ensureSchema_();
  payload = payload || {};
  const type = String(payload.type || '').trim();
  const title = String(payload.title || '').trim();
  if (!type) throw new Error('種類を選択してください。');
  if (!title) throw new Error('タイトルを入力してください。');
  const prefixMap = { 'バグ': 'BUG', '新機能': 'REQ', 'UI改善': 'UI', 'その他': 'ETC' };
  const prefix = prefixMap[type] || 'ETC';
  const rows = sheetObjects_(APP.SHEETS.DEVREQ);
  const nums = rows
    .map(r => String(r['ID'] || ''))
    .filter(id => id.indexOf(prefix + '-') === 0)
    .map(id => parseInt(id.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  const id = prefix + '-' + ('000' + next).slice(-3);
  const now = new Date();
  sheet_(APP.SHEETS.DEVREQ).appendRow([id, now, type, title, payload.content || '', payload.priority || '', '未着手', payload.assignee || '', user.staffName, now]);
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: id + ' を登録しました。', id });
}

function updateDevRequest(payload, token) {
  verify_(token);
  ensureSchema_();
  payload = payload || {};
  const id = String(payload.id || '').trim();
  if (!id) throw new Error('IDが指定されていません。');
  const sh = sheet_(APP.SHEETS.DEVREQ);
  const data = table_(APP.SHEETS.DEVREQ);
  const row = data.rows.find(r => String(r.obj['ID']) === id);
  if (!row) throw new Error('対象の依頼が見つかりません。');
  const map = headerMap_(sh);
  if (payload.status !== undefined && map['状態']) sh.getRange(row.rowNumber, map['状態']).setValue(payload.status);
  if (payload.assignee !== undefined && map['担当']) sh.getRange(row.rowNumber, map['担当']).setValue(payload.assignee);
  if (payload.priority !== undefined && map['優先度']) sh.getRange(row.rowNumber, map['優先度']).setValue(payload.priority);
  if (map['更新日']) sh.getRange(row.rowNumber, map['更新日']).setValue(new Date());
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: id + ' を更新しました。' });
}

function truncateForCell_(v, max) {
  const s = String(v || '');
  return s.length > max ? s.slice(0, max) + '...(truncated)' : s;
}

function saveDebugLog(payload, token) {
  const user = verify_(token);
  ensureSchema_();
  payload = payload || {};
  const app = payload.app || {};
  const u = payload.user || {};
  const env = payload.env || {};
  const occurred = payload.occurred || {};
  const dbg = payload.debug || {};
  const state = payload.state || {};
  const sh = sheet_(APP.SHEETS.DEBUGLOG);
  const map = headerMap_(sh);
  const lastCol = Math.max(sh.getLastColumn(), APP.DEBUGLOG_HEADERS.length);
  const id = 'DBG-' + Utilities.getUuid().slice(0,8).toUpperCase();
  const now = new Date();
  const obj = {
    'ID': id,
    '日時': now,
    '依頼ID': payload.requestId || '',
    'Version': app.version || '',
    'Build': app.build || '',
    'アプリ更新日時': app.updatedAt || '',
    'ログインユーザー': u.name || '',
    '権限': u.role || '',
    '店舗': u.store || '',
    'キャリア': u.carrier || '',
    '端末名': env.device || '',
    'OS': env.os || '',
    'ブラウザ': env.browser || '',
    '画面サイズ': env.screen || '',
    '言語': env.language || '',
    'タイムゾーン': env.timezone || '',
    '発生日時': occurred.time || '',
    '表示ページ': occurred.page || '',
    'URL': occurred.url || '',
    'ネットワーク状態': occurred.network || '',
    'オンライン状態': String(occurred.online),
    'JSエラー': truncateForCell_(JSON.stringify(dbg.jsErrors || []), 45000),
    'ConsoleError': truncateForCell_(JSON.stringify(dbg.consoleErrors || []), 45000),
    'ConsoleWarning': truncateForCell_(JSON.stringify(dbg.consoleWarnings || []), 45000),
    'ConsoleLog直近100件': truncateForCell_(JSON.stringify(dbg.consoleLog || []), 45000),
    'STATE': truncateForCell_(JSON.stringify(state.state || {}), 45000),
    'Filter': truncateForCell_(JSON.stringify(state.filter || {}), 45000),
    'ログイン状態': String(state.loggedIn),
    'スクリーンショット': '',
    '画像URL': ''
  };
  const arr = new Array(lastCol).fill('');
  Object.keys(obj).forEach(key => { const col = map[key]; if (col) arr[col - 1] = obj[key]; });
  sh.getRange(sh.getLastRow() + 1, 1, 1, lastCol).setValues([arr]);
  clearSheetObjectsCache(true);
  return safeReturn_({ ok: true, message: 'デバッグ情報を保存しました。', id: id });
}

function nextSeqId_(sheetName, prefix) {
  const rows = sheetObjects_(sheetName);
  const nums = rows
    .map(r => String(r['ID'] || ''))
    .filter(id => id.indexOf(prefix + '-') === 0)
    .map(id => parseInt(id.slice(prefix.length + 1), 10))
    .filter(n => !isNaN(n));
  const next = (nums.length ? Math.max.apply(null, nums) : 0) + 1;
  return prefix + '-' + ('000' + next).slice(-3);
}

function getReleaseCenterSummary(token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  const currentVersion = String(settings_()['現在バージョン'] || APP.VERSION);
  const releases = sheetObjects_(APP.SHEETS.RELEASEDB).slice(-20).reverse();
  const queue = sheetObjects_(APP.SHEETS.DEPLOYQUEUE).slice(-20).reverse();
  return safeReturn_({ ok: true, currentVersion: currentVersion, releases: releases, queue: queue });
}

function saveReleasePrep(payload, token) {
  const user = verify_(token); requireAdmin_(user);
  ensureSchema_();
  payload = payload || {};
  const nextVersion = String(payload.nextVersion || '').trim();
  if (!nextVersion) throw new Error('次のバージョンを入力してください。');
  const additions = String(payload.additions || '').trim();
  const fixes = String(payload.fixes || '').trim();
  const removals = String(payload.removals || '').trim();
  const now = new Date();

  const releaseNote = [
    'v' + nextVersion + ' リリースノート',
    '',
    '■追加',
    additions || '（なし）',
    '',
    '■修正',
    fixes || '（なし）',
    '',
    '■削除',
    removals || '（なし）'
  ].join('\n');

  const releaseId = nextSeqId_(APP.SHEETS.RELEASEDB, 'REL');
  sheet_(APP.SHEETS.RELEASEDB).appendRow([releaseId, now, nextVersion, additions, fixes, removals, releaseNote, 'リリース準備完了', user.staffName]);

  log_('RELEASE_PREP', nextVersion, user.staffName, 'リリース準備: ' + nextVersion);

  const deployId = nextSeqId_(APP.SHEETS.DEPLOYQUEUE, 'DQ');
  sheet_(APP.SHEETS.DEPLOYQUEUE).appendRow([deployId, now, nextVersion, releaseId, 'Deploy待ち', user.staffName]);

  clearSheetObjectsCache(true);
  return safeReturn_({
    ok: true,
    message: 'v' + nextVersion + ' をDeployQueueへ追加しました。',
    releaseId: releaseId,
    deployId: deployId,
    releaseNote: releaseNote
  });
}

function getUpdateCenterSummary(token) {
  const user = verify_(token); requireAdmin_(user);
  return {
    ok: true,
    update: getUpdateStatus_(),
    histories: getLightRows_(APP.SHEETS.UPDATE, 12),
    backups: getLightRows_(APP.SHEETS.BACKUP, 12)
  };
}

function getLightRows_(sheetName, limit) {
  const rows = sheetObjects_(sheetName);
  return rows.slice(-limit).reverse().map(r => {
    const obj = {};
    Object.keys(r).forEach(k => {
      const v = r[k];
      obj[k] = v instanceof Date ? fmt_(v, 'yyyy-MM-dd HH:mm:ss') : v;
    });
    return obj;
  });
}


function setupEmergencyLogin() {
  ensureSchema_();
  const sh = sheet_(APP.SHEETS.STAFF);
  ensureHeadersSheet_(sh, ['スタッフID','スタッフ名','権限','所属店舗','パスコード','有効']);
  const data = table_(APP.SHEETS.STAFF);
  const hasAdmin = data.rows.some(r => String(r.obj['スタッフ名'] || '').trim() === '管理者');
  if (!hasAdmin) sh.appendRow(['S001','管理者','ADMIN','本部','0000',true]);
  const map = headerMap_(sh);
  table_(APP.SHEETS.STAFF).rows.forEach(r => {
    const name = String(r.obj['スタッフ名'] || '').trim();
    if (!name) return;
    if (map['有効']) sh.getRange(r.rowNumber, map['有効']).setValue(true);
    if (map['パスコード'] && String(r.obj['パスコード'] || '').trim() === '') sh.getRange(r.rowNumber, map['パスコード']).setValue('0000');
    if (map['権限'] && String(r.obj['権限'] || '').trim() === '') sh.getRange(r.rowNumber, map['権限']).setValue(name === '管理者' ? 'ADMIN' : 'STAFF');
  });
  // invalidate caches to ensure master cache is fresh after edits
  clearSheetObjectsCache(true);
  log_('EMERGENCY_LOGIN_SETUP', 'スタッフマスタ', 'SYSTEM', 'ログイン候補を強制作成/補修');
  return debugLoginState();
}

function debugLoginState() {
  try {
    ensureSchema_();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetNames = ss.getSheets().map(s => s.getName());
    const sh = ss.getSheetByName(APP.SHEETS.STAFF);
    const rows = sheetObjects_(APP.SHEETS.STAFF);
    return {
      ok: true,
      version: APP.VERSION,
      spreadsheetName: ss.getName(),
      staffSheetName: APP.SHEETS.STAFF,
      sheetExists: !!sh,
      lastRow: sh ? sh.getLastRow() : 0,
      lastColumn: sh ? sh.getLastColumn() : 0,
      sheets: sheetNames,
      staffRawCount: rows.length,
      staff: rows.map(r => ({ name: r['スタッフ名'] || '', role: r['権限'] || '', pin: r['パスコード'] ? 'あり' : '空', active: String(r['有効']) }))
    };
  } catch (e) {
    return { ok:false, error: String(e && e.message ? e.message : e), stack: String(e && e.stack ? e.stack : '') };
  }
}

function ensureSchema_() {
  const changes = [];
  const specs = {};
  specs[APP.SHEETS.SETTINGS] = ['設定名','値'];
  specs[APP.SHEETS.STAFF] = ['スタッフID','スタッフ名','権限','所属店舗','パスコード','有効'];
  specs[APP.SHEETS.STORES] = ['店舗ID','店舗名','エリア','有効'];
  specs[APP.SHEETS.CARRIERS] = ['キャリアID','キャリア名','色','有効'];
  specs[APP.SHEETS.ITEMS] = ['キャリア','入力項目','表示順','有効'];
  specs[APP.SHEETS.RESULTS] = APP.RESULT_HEADERS;
  specs[APP.SHEETS.CLOSE] = ['対象月','状態','処理日時','処理者'];
  specs[APP.SHEETS.LOG] = ['日時','操作','対象ID','実行者','内容'];
  specs[APP.SHEETS.BACKUP] = ['日時','種類','対象','実行者','内容'];
  specs[APP.SHEETS.UPDATE] = ['日時','更新前','更新後','実行者','内容','状態'];
  specs[APP.SHEETS.DEVLOG] = ['日時','レベル','場所','内容'];
  specs[APP.SHEETS.DEVREQ] = APP.DEVREQ_HEADERS;
  specs[APP.SHEETS.DEBUGLOG] = APP.DEBUGLOG_HEADERS;
  specs[APP.SHEETS.RELEASEDB] = APP.RELEASEDB_HEADERS;
  specs[APP.SHEETS.DEPLOYQUEUE] = APP.DEPLOYQUEUE_HEADERS;
  specs[APP.SHEETS.AIQUEUE] = APP.AIQUEUE_HEADERS;
  specs[APP.SHEETS.AIDEPLOYQUEUE] = APP.AIDEPLOYQUEUE_HEADERS;
  Object.keys(specs).forEach(name => {
    const sh = sheet_(name);
    const beforeCols = sh.getLastColumn();
    const beforeRows = sh.getLastRow();
    ensureHeadersSheet_(sh, specs[name]);
    if (beforeRows === 0) changes.push(name + ' 作成');
    else if (sh.getLastColumn() > beforeCols) changes.push(name + ' 列追加');
  });
  seed_();
  migrateResults_();
  return changes;
}


function repairLoginMaster_() {
  const sh = sheet_(APP.SHEETS.STAFF);
  ensureHeadersSheet_(sh, ['スタッフID','スタッフ名','権限','所属店舗','パスコード','有効']);
  const map = headerMap_(sh);
  const data = table_(APP.SHEETS.STAFF);
  const usable = data.rows.some(r => String(r.obj['スタッフ名'] || '').trim() && (truthy_(r.obj['有効']) || String(r.obj['有効']).trim() === ''));
  if (!usable) {
    sh.appendRow(['S001','管理者','ADMIN','本部','0000',true]);
    log_('REPAIR_STAFF', 'スタッフマスタ', 'SYSTEM', 'ログイン用の初期管理者を自動作成');
    return;
  }
  data.rows.forEach(r => {
    if (String(r.obj['スタッフ名'] || '').trim() && String(r.obj['有効']).trim() === '') {
      sh.getRange(r.rowNumber, map['有効']).setValue(true);
    }
    if (String(r.obj['スタッフ名'] || '').trim() && String(r.obj['パスコード']).trim() === '') {
      sh.getRange(r.rowNumber, map['パスコード']).setValue('0000');
    }
    if (String(r.obj['スタッフ名'] || '').trim() && String(r.obj['権限']).trim() === '') {
      sh.getRange(r.rowNumber, map['権限']).setValue('STAFF');
    }
  });
}

function seed_() {
  if (sheet_(APP.SHEETS.SETTINGS).getLastRow() < 2) {
    sheet_(APP.SHEETS.SETTINGS).getRange(2,1,9,2).setValues([
      ['アプリ名', APP.NAME], ['現在バージョン', APP.VERSION], ['PI目標', 40], ['開発モード', 'OFF'], ['最終更新日時', ''], ['最終更新者', ''], ['更新方式', 'UPDATE_ENGINE_V2'], ['コード更新メモ', '大改修時のみ手動上書き'], ['更新マニフェストURL', '']
    ]);
  } else if (!settings_()['現在バージョン']) setSetting_('現在バージョン', APP.VERSION);
  if (sheet_(APP.SHEETS.STAFF).getLastRow() < 2) sheet_(APP.SHEETS.STAFF).appendRow(['S001','管理者','ADMIN','本部','0000',true]);
  if (sheet_(APP.SHEETS.STORES).getLastRow() < 2) sheet_(APP.SHEETS.STORES).appendRow(['ST001','本部','共通',true]);
  if (sheet_(APP.SHEETS.CARRIERS).getLastRow() < 2) {
    sheet_(APP.SHEETS.CARRIERS).getRange(2,1,6,4).setValues([
      ['C001','docomo','red',true],['C002','au','orange',true],['C003','UQ','purple',true],['C004','SoftBank','blue',true],['C005','Y!mobile','green',true],['C006','楽天','pink',true]
    ]);
  }
  if (sheet_(APP.SHEETS.ITEMS).getLastRow() < 2) {
    sheet_(APP.SHEETS.ITEMS).getRange(2,1,22,4).setValues([
      ['docomo','PI',1,true],['docomo','SPSP',2,true],['docomo','純新規',3,true],['docomo','ドコモ光',4,true],['docomo','home5G',5,true],['docomo','dカードGOLD',6,true],['docomo','dカードGOLD PLATINUM',7,true],['docomo','ドコモでんき',8,true],['docomo','dバリューパス',9,true],['docomo','アプローチ数',10,true],['docomo','提案数',11,true],
      ['au','MNP',1,true],['au','機種変更',2,true],['au','新規',3,true],['au','auひかり',4,true],
      ['UQ','MNP',1,true],['UQ','機種変更',2,true],
      ['SoftBank','MNP',1,true],['SoftBank','機種変更',2,true],
      ['Y!mobile','MNP',1,true],['Y!mobile','機種変更',2,true],['楽天','MNP',1,true]
    ]);
  }
  // ensure any seed changes invalidate cache
  clearSheetObjectsCache(true);
}

function migrateResults_() {
  const sh = sheet_(APP.SHEETS.RESULTS);
  if (sh.getLastRow() < 2) return;
  const map = headerMap_(sh);
  if (!map['対象日']) return;
  const numRows = sh.getLastRow() - 1;
  const values = sh.getRange(2,1,numRows,sh.getLastColumn()).getValues();
  const colUpdates = {};
  ['年','月','年月'].forEach(key => {
    if (map[key]) colUpdates[map[key]] = { changed: false, values: values.map(row => [row[map[key]-1]]) };
  });
  values.forEach((row, i) => {
    const d = row[map['対象日']-1];
    if (!d) return;
    const date = new Date(d);
    if (isNaN(date.getTime())) return;
    const year = fmt_(date, 'yyyy');
    const month = fmt_(date, 'MM');
    const ym = fmt_(date, 'yyyy-MM');
    if (map['年'] && !row[map['年']-1]) { colUpdates[map['年']].values[i][0] = year; colUpdates[map['年']].changed = true; }
    if (map['月'] && !row[map['月']-1]) { colUpdates[map['月']].values[i][0] = month; colUpdates[map['月']].changed = true; }
    if (map['年月'] && !row[map['年月']-1]) { colUpdates[map['年月']].values[i][0] = ym; colUpdates[map['年月']].changed = true; }
  });
  Object.keys(colUpdates).forEach(col => {
    if (colUpdates[col].changed) sh.getRange(2, Number(col), numRows, 1).setValues(colUpdates[col].values);
  });
}

function makeResultRow_(o) {
  const now = new Date();
  return {
    'ID': 'R-' + Utilities.getUuid().slice(0,8).toUpperCase(),
    '作成日時': now,
    '更新日時': now,
    '対象日': o.date,
    '年': fmt_(o.date,'yyyy'),
    '月': fmt_(o.date,'MM'),
    '年月': fmt_(o.date,'yyyy-MM'),
    '店舗': o.store,
    'スタッフ': o.staffName,
    'キャリア': o.carrier,
    '項目': o.item,
    '件数': Number(o.value || 0),
    '備考': o.memo || '',
    '入力者': o.actor || '',
    '操作': o.op || 'CREATE',
    '元ID': o.sourceId || '',
    '有効': true
  };
}
function validateResultPayload_(p) {
  ['date','store','staffName','carrier'].forEach(k => { if (!p[k]) throw new Error(k + ' が未入力です。'); });
  if (!p.results || !Object.keys(p.results).length) throw new Error('入力項目がありません。');
}
function matchFilter_(r, f) {
  const targetDate = new Date(r['対象日']);
  const dateValid = !isNaN(targetDate.getTime());
  if (f.date) {
    if (!dateValid || fmt_(targetDate, 'yyyy-MM-dd') !== f.date) return false;
  }
  if (f.year) {
    if (!dateValid || fmt_(targetDate, 'yyyy') !== String(f.year)) return false;
  }
  if (f.month) {
    if (!dateValid || fmt_(targetDate, 'yyyy-MM') !== String(f.month)) return false;
  }
  if (f.ym) {
    if (!dateValid || fmt_(targetDate, 'yyyy-MM') !== String(f.ym)) return false;
  }
  if (f.store && String(r['店舗']) !== String(f.store)) return false;
  if (f.staff && String(r['スタッフ']) !== String(f.staff)) return false;
  if (f.carrier && String(r['キャリア']) !== String(f.carrier)) return false;
  return true;
}
function activeResults_() {
  const all = sheetObjects_(APP.SHEETS.RESULTS);
  const active = all.filter(r => truthy_(r['有効']) && String(r['有効']).trim() !== '');
  return active;
}
function parseDate_(s) { const d = new Date(s); if (isNaN(d.getTime())) throw new Error('日付が不正です。'); return d; }
function isPi_(item) { return ['PI','MNP'].includes(String(item).toUpperCase()); }
function isLocked_(month) { const rows = sheetObjects_(APP.SHEETS.CLOSE).filter(r => String(r['対象月']) === String(month)); if (!rows.length) return false; return String(rows[rows.length-1]['状態']).toUpperCase() === 'LOCKED'; }
function verify_(token) { if (!token) throw new Error('ログインしてください。'); const raw = CacheService.getScriptCache().get('ARTS_TOKEN_' + token); if (!raw) throw new Error('ログイン期限が切れました。再ログインしてください。'); return JSON.parse(raw); }
function requireAdmin_(u) { if (!u || !u.isAdmin) throw new Error('管理者権限が必要です。'); }
function isAdmin_(role) { const r = String(role || '').toUpperCase(); return r === 'ADMIN' || r === 'OWNER' || String(role) === '管理者'; }
function normalizeRole_(role) { return isAdmin_(role) ? 'ADMIN' : 'STAFF'; }
function sheet_(name) {
  let ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    if (!SPREADSHEET_ID) {
      throw new Error('スプレッドシートIDが未設定です。Code.gs の SPREADSHEET_ID に対象スプレッドシートIDを設定してください。');
    }
    ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  }
  return ss.getSheetByName(name) || ss.insertSheet(name);
}
function ensureHeadersSheet_(sh, headers) { if (sh.getLastRow() === 0 || sh.getLastColumn() === 0) { sh.getRange(1,1,1,headers.length).setValues([headers]); sh.setFrozenRows(1); return; } const current = sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0].map(String); const missing = headers.filter(h => !current.includes(h)); if (missing.length) sh.getRange(1,current.length+1,1,missing.length).setValues([missing]); sh.setFrozenRows(1); }
function headerMap_(sh) { const h = sh.getRange(1,1,1,Math.max(1,sh.getLastColumn())).getValues()[0]; const m = {}; h.forEach((x,i)=>{ if (x) m[String(x)] = i+1; }); return m; }
function table_(name) { const sh = sheet_(name); const values = sh.getDataRange().getValues(); if (values.length < 2) return { headers: values[0] || [], rows: [] }; const headers = values[0].map(String); return { headers, rows: values.slice(1).map((row,i)=>{ const obj = {}; headers.forEach((h,j)=>obj[h]=row[j]); return { rowNumber: i+2, obj }; }).filter(r => Object.values(r.obj).some(v => v !== '')) }; }
function sheetObjects_(name) {
  // per-invocation memoization to reduce duplicate sheet reads in a single execution
  if (!this._sheetObjectsCache) this._sheetObjectsCache = {};
  if (this._sheetObjectsCache[name]) return this._sheetObjectsCache[name];
  const objs = table_(name).rows.map(r => r.obj);
  this._sheetObjectsCache[name] = objs;
  return objs;
}

function clearSheetObjectsCache(clearMasterCache) {
  try { this._sheetObjectsCache = {}; } catch (e) { this._sheetObjectsCache = {}; }
  if (clearMasterCache) {
    try { CacheService.getScriptCache().remove('ARTS_MASTER_V1'); } catch (e) { /* ignore */ }
  }
}
// 「設定」シート専用：1行目がタイトル、見出し（設定名/項目・値）が下の行にあるレイアウトのため、
// 共通のtable_()/headerMap_()には頼らずA列/B列を直接読み書きする。
var SETTINGS_HEADER_LABELS_ = ['設定名', '項目'];
function settings_() {
  const sh = sheet_(APP.SHEETS.SETTINGS);
  const lastRow = sh.getLastRow();
  const obj = {};
  if (lastRow < 1) return obj;
  const values = sh.getRange(1, 1, lastRow, 2).getValues();
  let dataStarted = false;
  values.forEach(row => {
    const key = String(row[0] || '').trim();
    if (!dataStarted) {
      if (SETTINGS_HEADER_LABELS_.indexOf(key) !== -1) dataStarted = true;
      return; // タイトル行・見出し行はスキップ
    }
    if (!key) return; // A列が空の行はスキップ
    const val = row[1];
    if (val !== '' && val !== null && val !== undefined) obj[key] = val;
    else if (!(key in obj)) obj[key] = val; // 空値は既存の非空値を上書きしない
  });
  return obj;
}
function setSetting_(key, value) {
  const sh = sheet_(APP.SHEETS.SETTINGS);
  const lastRow = sh.getLastRow();
  const keyStr = String(key).trim();
  const matchRows = [];
  if (lastRow >= 1) {
    sh.getRange(1, 1, lastRow, 1).getValues().forEach((row, i) => {
      if (String(row[0] || '').trim() === keyStr) matchRows.push(i + 1);
    });
  }
  if (matchRows.length > 0) {
    matchRows.forEach(rowNumber => sh.getRange(rowNumber, 2).setValue(value));
  } else {
    sh.appendRow([key, value]);
  }
  clearSheetObjectsCache(true);
}
function log_(action, target, actor, detail) { try { sheet_(APP.SHEETS.LOG).appendRow([new Date(), action, target, actor, detail]); } catch(e) {} }
function fmt_(date, pattern) { return Utilities.formatDate(new Date(date), APP.TZ, pattern); }
function truthy_(v) { return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === '1' || v === '有効' || v === ''; }
function unique_(arr) { return Array.from(new Set(arr.map(String).filter(Boolean))); }
function sumBy_(rows, key) { const o = {}; rows.forEach(r => { const k = r[key] || '未設定'; o[k] = (o[k] || 0) + Number(r['件数'] || r['実績'] || 0); }); return o; }
function sumByItem_(rows, groupKey, itemNames) { const names = itemNames.map(x => String(x).toUpperCase()); const o = {}; rows.forEach(r => { if (!names.includes(String(r['項目']).toUpperCase())) return; const k = r[groupKey] || '未設定'; o[k] = (o[k] || 0) + Number(r['件数'] || 0); }); return o; }
function objArray_(obj, keyName) { return Object.keys(obj).map(k => ({ [keyName]: k, value: obj[k] })).sort((a,b)=>b.value-a.value); }

function safeReturn_(value) {
  return JSON.parse(JSON.stringify(value, function(key, val) {
    if (val instanceof Date) {
      return Utilities.formatDate(val, APP.TZ, 'yyyy-MM-dd HH:mm:ss');
    }
    return val;
  }));
}
