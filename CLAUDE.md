# note-amazon-pipeline

noteに投稿するAmazonアソシエイト記事（新製品・新刊まとめ）を、**Claude Proチャットと連携して**生成するCLIツール。
Anthropic APIキーは不要。CLIが商品スクレイピング + プロンプト生成を行い、ユーザーがClaude Proチャットにプロンプトを貼り付け、得られた記事本文をCLIに戻すと最終版が保存される。

## セットアップ

```bash
npm install
```

APIキーは不要（スクレイピングはDuckDuckGo、記事生成はClaude Proチャット側）。

## 環境変数

- `DEBUG` (任意): 設定するとエラー時にスタックトレースを表示

## 使い方

### 1. プロンプトを生成する

```bash
# ジャンル指定でプロンプトを生成
node src/index.js --genre gadget --count 5

# カスタムキーワードで生成
node src/index.js --query "ワイヤレスイヤホン 2026 新製品" --count 5

# 全ジャンル一括
node src/index.js --all

# npm script 経由
npm run gadget
npm run ai-books
npm run all
```

実行すると以下の2ファイルが `output/` に生成されます:

- `YYYYMMDD_{genre}_prompt.md` — **Claude Proチャットに貼り付けるプロンプト**
- `YYYYMMDD_{genre}_data.json` — スクレイピング結果（参考用）

### 2. Claude Proチャットに貼り付けて記事本文を生成

`*_prompt.md` の内容をすべてコピーし、Claude Pro（web/デスクトップ/このCLIのチャット等）に貼り付けます。Claudeが記事本文を出力します。

出力された記事本文をテキストファイル（例: `draft.md`）に保存してください。

### 3. ヘッダー/フッターを付けて最終版を保存

```bash
node src/index.js --finalize draft.md --genre gadget
```

`output/YYYYMMDD_{genre}.md` として以下が付与された最終版が保存されます:

- ファイル冒頭: 生成日時・ジャンルのHTMLコメント
- ファイル末尾: Amazonアソシエイトの免責表示 + ハッシュタグ

`--query` で生成した場合は `--genre` の代わりに同じ `--query` を指定するか、`--genre <slug>` にクエリ由来のスラッグを渡してください。

## 設定のカスタマイズ

`config/settings.json` を編集:

- `associateTag`: 自分のAmazonアソシエイトID（現在 `kobebooka1-22`）
- `defaultItemCount`: 記事1本あたりの商品数デフォルト
- `genres`: ジャンル定義（検索クエリ、ラベル、キーワード）

新しいジャンルを追加する場合は `genres` にエントリを追加するだけ:

```json
"kitchen": {
  "label": "キッチン・調理器具",
  "searchQueries": [
    "Amazon キッチン用品 新製品 {year}年",
    "おすすめ 調理器具 便利グッズ {year}"
  ],
  "keywords": ["キッチン", "調理器具", "料理"]
}
```

検索クエリ内のプレースホルダ `{year}`, `{month}`, `{season}` は実行時に自動置換されます。

## 出力

- `output/YYYYMMDD_{genre}_prompt.md`: Claude Proチャット貼り付け用プロンプト
- `output/YYYYMMDD_{genre}_data.json`: スクレイピングした商品情報（参考）
- `output/YYYYMMDD_{genre}.md`: `--finalize` で生成される最終記事（ヘッダー + 本文 + フッター）

## モジュール構成

- `src/index.js`: CLIエントリポイント（prepare / finalize 両モード）
- `src/scraper.js`: Web検索 & 商品情報スクレイピング (DuckDuckGo HTML版 + cheerio)
- `src/links.js`: Amazonアソシエイトリンク生成（ASIN→商品URL、なければ検索URLにフォールバック）
- `src/article.js`: Claude Proチャット貼り付け用のプロンプトを生成（APIコールなし）
- `src/templates.js`: タイトル・ハッシュタグ・定型文テンプレート

## 注意事項

- `config/settings.json` の `associateTag` を自分のタグに変更してください（現在 `kobebooka1-22`）
- スクレイピングは1リクエスト/秒にレート制限しています
- 生成された記事は必ず目視確認してからnoteに投稿してください
- Amazonアソシエイト規約・noteの利用規約を遵守してください
- スクレイピングの成功率は検索結果に依存します。0件の場合は `--query` でキーワードを調整してください
