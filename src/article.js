// Anthropic APIで記事本文を生成

import Anthropic from '@anthropic-ai/sdk';

const MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 8000;

const SYSTEM_PROMPT = `あなたはnoteに投稿するAmazonアソシエイト記事を書く専門ライターです。

## 記事のルール
- 文体: ですます調、カジュアルだが信頼感のあるトーン
- 文字数: 2000〜4000文字
- 構成:
  1. 導入（100〜200文字）: 今月の注目ポイントを簡潔に
  2. 各商品紹介（1商品あたり300〜500文字）
  3. まとめ（100〜200文字）
- 各商品紹介には必ず以下を含める:
  - 商品名（見出し）
  - どんな人におすすめか（1文）
  - 注目ポイント3つ（短い文で）
  - 価格帯
  - Amazonリンク（生URLを独立した行に配置）
- SEO対策:
  - タイトルに年月と「おすすめ」「新製品」を含める
  - 冒頭200文字以内にメインキーワードを入れる
  - h2見出しに自然にキーワードを含める
- noteの特性:
  - noteではMarkdownの見出し（##）が使える
  - 画像は挿入できないので、テキストで魅力を伝える
  - Amazonリンクは生URLをそのまま貼る（noteが自動でカード化する）
  - そのため、リンクは必ず独立した行に1つだけ配置する（文中に埋め込まない）
- 禁止事項:
  - 「最強」「神」「ヤバい」などの過剰表現
  - 根拠のない比較（「業界No.1」など）
  - 他サイトの文章のコピペ

## 重要
- Amazonアソシエイトリンクは生URL形式で出力すること（Markdownリンク記法にしない）
- 例:
  https://www.amazon.co.jp/dp/B0XXXXXX?tag=yourtag-22
  （このようにURLだけの行にする。noteが自動でリッチカードに変換する）
- 冒頭にタイトルを # で1つだけ記載する
- 末尾には記事本文のみを出力し、ハッシュタグや定型文は含めない（呼び出し側で付与する）`;

function buildUserMessage({ title, genreLabel, products }) {
  const productJson = JSON.stringify(
    products.map((p) => ({
      name: p.name,
      price: p.price,
      features: p.features,
      releaseDate: p.releaseDate,
      amazonUrl: p.associateLink?.url || null,
      snippet: p.snippet,
    })),
    null,
    2,
  );

  return [
    `以下の商品情報をもとに、noteに投稿する${genreLabel}の新製品紹介記事を書いてください。`,
    '',
    `記事タイトル: ${title}`,
    `ジャンル: ${genreLabel}`,
    `商品数: ${products.length}件`,
    '',
    '## 商品情報（JSON）',
    '```json',
    productJson,
    '```',
    '',
    '## 指示',
    '- 上記のタイトルを # で記事冒頭に配置してください。',
    '- 各商品紹介の末尾に、該当する amazonUrl を独立した行に配置してください。',
    '- 情報が不足している項目は、Snippet等から自然な表現で補ってください。推測は控えめに。',
    '- 記事本文のみを出力してください（コードブロック、前置き、説明文は不要）。',
  ].join('\n');
}

export async function generateArticle({ title, genreLabel, products }) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      'ANTHROPIC_API_KEY が設定されていません。.env ファイルまたは環境変数で設定してください。',
    );
  }

  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('products は1件以上必要です');
  }

  const client = new Anthropic();

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },
      },
    ],
    messages: [
      {
        role: 'user',
        content: buildUserMessage({ title, genreLabel, products }),
      },
    ],
  });

  const textBlocks = response.content.filter((b) => b.type === 'text');
  if (textBlocks.length === 0) {
    throw new Error('Anthropic APIがテキスト応答を返しませんでした');
  }

  const body = textBlocks.map((b) => b.text).join('\n').trim();

  return {
    body,
    usage: response.usage,
    model: response.model,
  };
}
