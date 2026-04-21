#!/usr/bin/env node
// note-amazon-pipeline CLI エントリポイント

import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

import { scrapeProducts, scrapeByQuery } from './scraper.js';
import { enrichProductsWithLinks } from './links.js';
import { generateArticle } from './article.js';
import {
  buildTitle,
  buildArticleHeader,
  buildArticleFooter,
} from './templates.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config', 'settings.json');
const OUTPUT_DIR = path.join(ROOT, 'output');

async function loadSettings() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `設定ファイルの読み込みに失敗しました (${CONFIG_PATH}): ${err.message}`,
    );
  }
}

function formatDateStamp(date = new Date()) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

async function ensureOutputDir() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
}

function slugify(text) {
  return (
    text
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'article'
  );
}

async function runForGenre({ genreKey, genre, settings, count, date = new Date() }) {
  const itemCount = count ?? settings.defaultItemCount ?? 5;
  const genreLabel = genre.label;

  console.log(`\n🎯 ジャンル: ${genreLabel} (${genreKey}) / ${itemCount}件`);

  console.log('🔍 商品情報を検索中...');
  const rawProducts = await scrapeProducts({
    queries: genre.searchQueries,
    count: itemCount,
  });

  if (rawProducts.length === 0) {
    console.warn(`⚠️  ${genreLabel}: 商品が見つからなかったため記事生成をスキップします`);
    return null;
  }

  console.log(`🔗 アソシエイトリンクを生成中 (${rawProducts.length}件)...`);
  const products = enrichProductsWithLinks(rawProducts, settings.associateTag);

  const title = buildTitle({
    genreLabel,
    count: products.length,
    date,
  });

  console.log('📝 記事を生成中...');
  const { body, usage, model } = await generateArticle({
    title,
    genreLabel,
    products,
  });

  const header = buildArticleHeader({ genreKey, genreLabel, date });
  const footer = buildArticleFooter({ genreKey });
  const full = `${header}${body}\n${footer}`;

  await ensureOutputDir();
  const filename = `${formatDateStamp(date)}_${slugify(genreKey)}.md`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(outputPath, full, 'utf-8');

  console.log(`✅ 完了: ${outputPath}`);
  console.log(
    `   モデル: ${model} / 入力: ${usage.input_tokens} tok / 出力: ${usage.output_tokens} tok`,
  );

  return outputPath;
}

async function runForQuery({ query, settings, count, date = new Date() }) {
  const itemCount = count ?? settings.defaultItemCount ?? 5;

  console.log(`\n🎯 カスタムクエリ: "${query}" / ${itemCount}件`);

  console.log('🔍 商品情報を検索中...');
  const rawProducts = await scrapeByQuery({ query, count: itemCount });

  if (rawProducts.length === 0) {
    console.warn('⚠️  商品が見つからなかったため記事生成をスキップします');
    return null;
  }

  console.log(`🔗 アソシエイトリンクを生成中 (${rawProducts.length}件)...`);
  const products = enrichProductsWithLinks(rawProducts, settings.associateTag);

  const genreLabel = query;
  const genreKey = slugify(query);

  const title = buildTitle({
    genreLabel,
    count: products.length,
    date,
  });

  console.log('📝 記事を生成中...');
  const { body, usage, model } = await generateArticle({
    title,
    genreLabel,
    products,
  });

  const header = buildArticleHeader({ genreKey, genreLabel, date });
  const footer = buildArticleFooter({ genreKey });
  const full = `${header}${body}\n${footer}`;

  await ensureOutputDir();
  const filename = `${formatDateStamp(date)}_${genreKey}.md`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(outputPath, full, 'utf-8');

  console.log(`✅ 完了: ${outputPath}`);
  console.log(
    `   モデル: ${model} / 入力: ${usage.input_tokens} tok / 出力: ${usage.output_tokens} tok`,
  );

  return outputPath;
}

async function main() {
  const program = new Command();

  program
    .name('note-amazon-pipeline')
    .description('noteに投稿するAmazonアソシエイト記事を自動生成するCLIツール')
    .option('-g, --genre <genre>', 'ジャンルキー (例: gadget, ai-books)')
    .option('-q, --query <query>', 'カスタム検索キーワード')
    .option('-c, --count <n>', '記事内の商品数', (v) => parseInt(v, 10))
    .option('-a, --all', '全ジャンルを一括生成')
    .parse(process.argv);

  const opts = program.opts();

  if (!opts.genre && !opts.query && !opts.all) {
    console.error('❌ --genre, --query, --all のいずれかを指定してください');
    program.help({ error: true });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error(
      '❌ ANTHROPIC_API_KEY が設定されていません。.env ファイルまたは環境変数で設定してください。',
    );
    process.exit(1);
  }

  const settings = await loadSettings();

  if (!settings.associateTag || settings.associateTag === 'YOUR_ASSOCIATE_TAG-22') {
    console.warn(
      '⚠️  config/settings.json の associateTag がデフォルト値のままです。自分のタグに変更してください。',
    );
  }

  const date = new Date();

  if (opts.all) {
    const outputs = [];
    for (const [genreKey, genre] of Object.entries(settings.genres)) {
      try {
        const out = await runForGenre({
          genreKey,
          genre,
          settings,
          count: opts.count,
          date,
        });
        if (out) outputs.push(out);
      } catch (err) {
        console.error(`❌ ${genreKey} の処理中にエラー: ${err.message}`);
      }
    }
    console.log(`\n🎉 全ジャンル処理完了: ${outputs.length}件の記事を生成`);
    return;
  }

  if (opts.query) {
    await runForQuery({ query: opts.query, settings, count: opts.count, date });
    return;
  }

  const genre = settings.genres[opts.genre];
  if (!genre) {
    const keys = Object.keys(settings.genres).join(', ');
    console.error(`❌ ジャンル "${opts.genre}" が見つかりません。利用可能: ${keys}`);
    process.exit(1);
  }

  await runForGenre({
    genreKey: opts.genre,
    genre,
    settings,
    count: opts.count,
    date,
  });
}

main().catch((err) => {
  console.error(`\n❌ エラー: ${err.message}`);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
