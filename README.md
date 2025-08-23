# Nexus Prompt - Chrome拡張機能

LLMプロンプトの作成・改善を支援する Chrome 拡張機能です。

このリポジトリは、Chrome 拡張機能「Nexus Prompt」のオープンソース実装です。登録したテンプレート（LLMプロンプト）とプロンプト設計フレームワークを使い、選択した LLM でプロンプトの自動改善が行えます。ポップアップ/サイドパネルで動作し、データのエクスポート/インポートにも対応しています。

## インストール

[<img src="./docs/chrome-web-store.png" alt="Chromeウェブストアからインストール" width="200">](https://chromewebstore.google.com/detail/nexus-prompt/epoolhelnffbjmkhleekobpgbjfnhaej)

## デモ
<img src="./docs/demo.gif" alt="Demo GIF showing the plugin in action" width="600">

## 機能
- 登録型のプロンプトフレームワーク管理（編集/保存/リセット）
- LLMプロンプトテンプレートの作成・編集・並べ替え・削除
- プレースホルダー差し込み（例: `{{user}}`）付きテンプレート組み立てとコピー
- 各種 LLM（Gemini / OpenAI / Anthropic）API を使ったプロンプトの自動改善
- 改善結果のコピー、入力のリセット、トースト通知表示
- データ管理（フレームワーク/LLMプロンプトの ZIP エクスポート・インポート）
- ポップアップとサイドパネルの両 UI に対応（環境に応じて自動判定）

対応プロバイダー/モデル（デフォルト内蔵）
- Google Gemini: `gemini-2.0-flash`, `gemini-2.5-flash`, `gemini-2.5-pro`
- OpenAI: `gpt-4.1-2025-04-14`, `gpt-4.1-mini-2025-04-14`, `gpt-4.1-nano-2025-04-14`, `o4-mini-2025-04-16`
- Anthropic: `claude-3-5-haiku-latest`, `claude-3-5-sonnet-latest`

主な画面構成
- メイン（プロンプトプレイグラウンド）: 登録済み LLM プロンプトを選択し、必要に応じてプレースホルダーへ値を差し込み、完成した文字列をコピーできます。
- プロンプト改善: モデル（プロバイダー/モデル名）と登録済み LLM プロンプトを選び、ユーザー入力と選択プロンプト、フレームワークを組み合わせて LLM による改善結果を生成します。
- LLMプロンプト管理: プロンプトの新規作成/編集/並べ替え/削除。サイドパネルでも編集可能です。フリープラン相当の制限として 20 件までが目安です。
- 設定: 各プロバイダーの API キー保存、データ管理（エクスポート/インポート）、フレームワーク編集への導線。

## 使い方

1. 拡張機能のアイコンをクリックしてポップアップを開きます。
2. 「LLMプロンプト管理」タブで、再利用可能なプロンプトテンプレートを作成します。
3. 「メイン画面」タブで、登録したプロンプトテンプレートを使用します。
4. 「設定」タブで、利用したいLLMプロバイダー（Gemini, OpenAI, Anthropic）のAPIキーを設定します。
5. 「プロンプト改善」タブで、改善したいプロンプトを入力し、使用するテンプレートとモデルを選択して「適用」をクリックします。
6. 改善されたプロンプトが表示されたら、「コピー」ボタンでクリップボードにコピーできます。
7. 「フレームワーク管理」タブで、プロンプトの構造を定義するフレームワークを作成します。

サイドパネルについて
- 拡張機能アイコンのメニュー（コンテキスト）から「サイドパネルを開く」を実行できます。
- サイドパネル API が利用できない環境では自動的にポップアップ UI にフォールバックします。

## フィードバック

ご意見・ご感想・バグ報告などは、以下のGoogleフォームからお寄せください。

[フィードバックを送信する](https://docs.google.com/forms/d/1GnBes2W30efxIYPVCICifyJRf6Mm1oFZf9zwV6tXcT8/viewform)

## 開発者向け情報

### 開発環境のセットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 開発（2 通りあります）

UI 開発（Chrome API はモックで動作）
- `npm run dev` を実行し、Vite のプレビューで画面を確認できます。
- `src/chrome-mock.ts` により最低限の Chrome API をモックしています。

拡張機能として実機確認（推奨）
- `npm run watch` で変更を監視しつつビルドします。
- Chrome の拡張機能ページで `dist` を読み込んで動作を確認します（手順は下記参照）。

### 3. ビルド（本番用）

```bash
npm run build
```

ビルドされたファイルは`dist`ディレクトリに出力されます。

### 4. 開発中の監視モード

```bash
npm run watch
```

ファイルの変更を監視して自動的にビルドします。

### 5. テストの実行

#### 単発テスト実行

```bash
npm run test
```

全てのテストを一度実行します。

#### 継続的テスト実行

```bash
npm run test:watch
```

ファイルの変更を監視してテストを自動実行します。開発中に使用してください。

#### カバレッジ付きテスト実行

```bash
npm run test:coverage
```

テストカバレッジレポートと共にテストを実行します。

#### E2Eテスト実行

```bash
npm run test:e2e
```

Playwrightを使用してE2Eテストを実行します。

```bash
npm run test:e2e:ui
```
Playwright UIモードでテストを実行します。

その他のスクリプト
- 型チェック: `npm run check-types`
- Lint: `npm run lint`
- E2E デバッグ: `npm run test:e2e:debug`

## Chrome拡張機能のインストール

1. `npm run build`でビルドを実行
2. Chromeで`chrome://extensions/`を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `dist`ディレクトリを選択

権限とホスト許可
- `storage`, `sidePanel`, `contextMenus`
- `https://api.openai.com/*`, `https://generativelanguage.googleapis.com/*`, `https://api.anthropic.com/*`

## 技術スタック

- TypeScript
- Svelte
- Vite
- Vitest (テスト)
- Playwright (E2Eテスト)
- Chrome Extension Manifest V3
- Gemini API, OpenAI API, Anthropic API

セキュリティ（APIキーの扱い）
- API キーは `chrome.storage.local` に保存する際に AES-GCM で暗号化されます。
- 暗号鍵は拡張機能 ID を材料に PBKDF2 で導出し、復号も拡張機能内でのみ可能です。
- LLM へのリクエストは Service Worker（`background.ts`）から送信し、401/403 の場合は認証エラーとして UI に伝播します。

ディレクトリ構成（抜粋）
- `src/components/`: 主要 UI（設定/管理/改善/プレイグラウンド）
- `src/services/`: API 呼び出し、ストレージ、インポート/エクスポート等のサービス
- `src/data/`: 組み込みプロバイダー/モデル定義
- `src/promptops/`: プロンプト/フレームワーク DSL とユーティリティ
- `public/manifest.json`: MV3 マニフェスト
- `e2e/`: Playwright による E2E テスト

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細については[LICENSE.md](LICENSE.md)をご覧ください。

## 動作環境
- Node.js 18 以上を推奨（Vite 5 系）
- Chrome 最新版
