# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 日本語

- 必ず日本語で回答すること
- コード内の英語は変更しなくてよい
- 初心者向けに説明すること
- 専門用語はできるだけ少なくすること

## プロジェクト

このプロジェクトはGoogle Apps Script(WebApp)で開発している会社向け業務アプリです。

目的は会社で実際に運用することです。

技術より

- 品質
- 保守性
- 分かりやすさ
- 開発速度

を優先してください。

## 開発ルール

必ず

① 原因調査
② 修正案提示
③ 実装
④ 自己レビュー
⑤ テスト項目

の順番で進めること。

1タスク＝1目的。依頼された箇所以外は変更しないこと。

## アップデートルール（コードをApps Script側へ反映するとき）

コードの変更をApps Script側へ反映する際は、必ず以下の順番で進めること。

1. 実装
2. 自己レビュー
3. Git Commit
4. Git Push
5. 更新マニフェスト（`docs/arts-update-manifest.json`。`node scripts/build-manifest.js "更新メモ"`で生成）を更新
6. Git Push
7. 「更新センターからコード更新してください」とユーザーに伝えて停止する

実際にApps Scriptプロジェクトへコードを反映する処理（新Version作成・本番Deploymentの切り替え）は、アプリ内の更新センター（`runCodeUpdateFromManifest`）が行う。Claude Code側では行わない。

## 禁止事項

- 勝手なリファクタリング
- 勝手な最適化
- clasp push
- Apps Scriptエディタでの手動更新
- 手動デプロイ

## 出力ルール

最後に必ず

- 変更ファイル一覧
- 変更理由
- 影響範囲
- 自己レビュー

を出力すること。

## Project overview

ARTS Manager is a Google Apps Script (GAS) web app for tracking daily sales/KPI results (docomo/au/SoftBank etc. carrier sales counts) for retail staff. It is a single Apps Script project with exactly 4 source files — there is no build step, no package manager, and no test framework:

- `Code.js` — all server-side logic (GAS `.gs` equivalent, runs on V8). Handles auth, spreadsheet I/O, dashboard aggregation, and a self-update mechanism.
- `Index.html` — the single HTML page/template, rendered via `HtmlService.createTemplateFromFile('Index')` in `doGet()`.
- `Script.html` — all client-side JavaScript, inlined into `Index.html` via `<?!= include('Script'); ?>`.
- `Style.html` — all CSS, inlined into `Index.html` via `<?!= include('Style'); ?>`.

`appsscript.json` is the GAS manifest (timezone `Asia/Tokyo`, V8 runtime, webapp executes as the deploying user, accessible to anyone).

## Data storage

There is no database — all data lives in a single Google Spreadsheet, hardcoded as `SPREADSHEET_ID` at the top of `Code.js`. Sheet (tab) names are defined in `APP.SHEETS` and their expected column headers are defined inline in `ensureSchema_()`. Key sheets:

- `実績DB` (results) — one row per carrier-item entry, columns defined in `APP.RESULT_HEADERS`. Deletes are soft: the `有効` (active) column is set to `false` rather than removing the row (see `deleteResult`).
- `スタッフマスタ` / `店舗マスタ` / `キャリアマスタ` / `キャリア項目マスタ` — master data (staff, stores, carriers, per-carrier input items).
- `設定` — key/value app settings (PI target, current version, update manifest URL, etc.), read via `settings_()` and written via `setSetting_()`.
- `月締め` — per-month lock state; a locked month rejects new/edited/deleted results (`isLocked_`).
- `更新履歴` / `バックアップログ` / `開発ログ` — audit logs for the in-app update center.

`ensureSchema_()` runs on every `doGet()`/`bootstrap()` and is idempotent: it creates missing sheets/columns and calls `seed_()` to insert default rows (default admin staff `管理者`/PIN `0000`, default store/carriers/items) only when a sheet is empty.

## Auth model

There is no real authentication. Login (`login()`/`loginFull()`) matches a selected staff name against a 4-digit PIN stored in plaintext in the `スタッフマスタ` sheet (default `0000`). On success a random token is stored in `CacheService.getScriptCache()` for `APP.TOKEN_TTL_SEC` (6 hours) mapped to the user object; every subsequent server call takes this `token` as its last argument and resolves the user via `verify_(token)`. Admin-only endpoints call `requireAdmin_(user)`. `isAdmin_()` treats role `ADMIN`/`OWNER`/`管理者` as admin.

## Client/server bridge

`Script.html` never calls `google.script.run` directly except through the `server(fn, ...args)` wrapper (`Script.html:5`), which is a hardcoded `switch` mapping function names to `google.script.run.<fn>(...)` calls. **Any new server function exposed to the client must be added to this switch statement**, or `server()` rejects with "Unsupported function".

## Caching layers (important when changing data-read/write logic)

- `sheetObjects_(name)` memoizes each sheet's rows-as-objects for the duration of a single server invocation (`this._sheetObjectsCache`).
- `getPublicData()` additionally caches the combined master data (staff/stores/carriers/items) in the script cache under key `ARTS_MASTER_V1` for 10 minutes.
- Any function that writes to a sheet must call `clearSheetObjectsCache(true)` afterward so the next read sees fresh data and the master cache is invalidated. Existing write paths (`saveResult`, `updateResult`, `deleteResult`, `setSetting_`, `setMonthLock_`, `setupEmergencyLogin`, `seed_`, `createBackupLog_`) already do this — follow the same pattern for new writes.

## In-app update center

`getUpdateStatus_`/`runAppUpdate`/`runCodeUpdateFromManifest` implement a self-update system: `runAppUpdate` re-runs `ensureSchema_()` and bumps the stored version setting; `runCodeUpdateFromManifest` fetches a JSON manifest URL and uses the Apps Script API (`script.googleapis.com`) to overwrite the project's own files (`fetchScriptContent_`/`updateScriptContent_`/`mergeProjectFiles_`). This is admin-only and distinct from normal `clasp push` deploys — treat changes here carefully since it can rewrite live script source.

## Local dev workflow

- This repo is pushed/pulled with `clasp` (Google's Apps Script CLI): `clasp login`, `clasp push`, `clasp pull`, `clasp open`.
- `.vscode/settings.json` configures the `emeraldwalk.runonsave` extension to automatically run `clasp push` whenever `Code.js`, `Index.html`, `Script.html`, `Style.html`, or `appsscript.json` is saved in VS Code — be aware that saving these files locally may auto-deploy to the linked Apps Script project if that extension is active.
- There are no automated tests, linter, or build command in this repo. Verifying a change means reasoning through the GAS execution model and, where possible, asking the user to test in the deployed web app.

## Conventions in this codebase

- Sheet column names and most user-facing strings are Japanese; keep new fields/messages consistent with the existing Japanese terminology (e.g. `店舗`=store, `スタッフ`=staff, `キャリア`=carrier, `項目`=item, `件数`=count/value, `有効`=active).
- Private/internal helper functions are suffixed with `_` (e.g. `sheet_`, `verify_`, `fmt_`); functions without the suffix are called from the client via `server()`.
- Version number lives in `APP.VERSION` in `Code.js` and is mirrored into the `設定` sheet's `現在バージョン` value by `runAppUpdate`.
