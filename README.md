# Nexus Prompt - Chrome拡張機能

LLMプロンプトの改善を支援するChrome拡張機能です。

このリポジトリは、Chrome拡張機能「Nexus Prompt」のコア機能を提供するオープンソースプロジェクトです。

## インストール

[<img src="./docs/chrome-web-store.png" alt="Chromeウェブストアからインストール" width="200">](https://chromewebstore.google.com/detail/nexus-prompt/epoolhelnffbjmkhleekobpgbjfnhaej)

## デモ
<img src="./docs/demo.gif" alt="Demo GIF showing the plugin in action" width="600">

## 機能
- プロンプトフレームワークの管理
- LLMプロンプトテンプレートの作成・編集・削除
- 各種LLM（Gemini, OpenAI, Anthropic）APIを使用したプロンプトの自動改善
- 改善されたプロンプトのコピー機能

## 使い方

1. 拡張機能のアイコンをクリックしてポップアップを開きます。
2. 「設定」タブで、利用したいLLMプロバイダー（Gemini, OpenAI, Anthropic）のAPIキーを設定します。
3. 「フレームワーク管理」タブで、プロンプトの構造を定義するフレームワークを作成します。
4. 「LLMプロンプト管理」タブで、再利用可能なプロンプトテンプレートを作成します。
5. 「プロンプト改善」タブで、改善したいプロンプトを入力し、使用するテンプレートとモデルを選択して「適用」をクリックします。
6. 改善されたプロンプトが表示されたら、「コピー」ボタンでクリップボードにコピーできます。

## フィードバック

ご意見・ご感想・バグ報告などは、以下のGoogleフォームからお寄せください。

[フィードバックを送信する](https://docs.google.com/forms/d/1GnBes2W30efxIYPVCICifyJRf6Mm1oFZf9zwV6tXcT8/viewform)

## 開発者向け情報

### 開発環境のセットアップ

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 開発サーバーの起動

```bash
npm run dev
```

### 3. ビルド

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

## Chrome拡張機能のインストール

1. `npm run build`でビルドを実行
2. Chromeで`chrome://extensions/`を開く
3. 「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `dist`ディレクトリを選択

## 技術スタック

- TypeScript
- Svelte
- Vite
- Vitest (テスト)
- Playwright (E2Eテスト)
- Chrome Extension Manifest V3
- Gemini API, OpenAI API, Anthropic API

## ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細については[LICENSE.md](LICENSE.md)をご覧ください。
