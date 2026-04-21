# note-amazon-pipeline

noteに投稿するAmazonアソシエイト記事（新製品・新刊まとめ）を自動生成するCLIツール。

## セットアップ

```bash
npm install
cp .env.example .env
# .env を編集して ANTHROPIC_API_KEY を設定
```

## 環境変数

- `ANTHROPIC_API_KEY` (必須): Anthropic APIキー
- `DEBUG` (任意): 設定するとエラー時にスタックトレースを表示

## 使い方

```bash
# ジャンル指定で記事を生成
node src/index.js --genre gadget --count 5
node src/index.js --genre ai-books --count 7

# カスタムキーワードで生成
node src/index.js --query "ワイヤレスイヤホン 2026 新製品" --count 5

# 全ジャンル一括生成
node src/index.js --all

# npm script 経由
npm run gadget
npm run ai-books
npm run all
```

## 設定のカスタマイズ

`config/settings.json` を編集:

- `associateTag`: 自分のAmazonアソシエイトID (例: `yourid-22`)
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

`output/YYYYMMDD_{genre}.md` として記事が保存されます。
ファイル冒頭にHTMLコメントで生成日時・ジャンルが記録されます。

## モジュール構成

- `src/index.js`: CLIエントリポイント
- `src/scraper.js`: Web検索 & 商品情報スクレイピング (DuckDuckGo HTML版 + cheerio)
- `src/links.js`: Amazonアソシエイトリンク生成（ASIN→商品URL、なければ検索URLにフォールバック）
- `src/article.js`: Anthropic APIで記事本文生成（`claude-sonnet-4-6`、プロンプトキャッシュ有効）
- `src/templates.js`: タイトル・ハッシュタグ・定型文テンプレート

## 注意事項

- `config/settings.json` の `associateTag` を必ず自分のタグに変更してください
- スクレイピングは1リクエスト/秒にレート制限しています
- 生成された記事は必ず目視確認してからnoteに投稿してください
- Amazonアソシエイト規約・noteの利用規約を遵守してください
- スクレイピングの成功率は検索結果に依存します。0件の場合は `--query` でキーワードを調整してください
