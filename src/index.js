#!/usr/bin/env node
// note-amazon-pipeline CLI エントリポイント
// APIは使わず、Claude Proチャットに貼り付けるプロンプトを生成 → 得られた記事本文を --finalize で仕上げる

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';

import { scrapeProducts, scrapeByQuery } from './scraper.js';
import { enrichProductsWithLinks } from './links.js';
import { buildChatPrompt } from './article.js';
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

async function prepareForGenre({ genreKey, genre, settings, count, date = new Date() }) {
  const itemCount = count ?? settings.defaultItemCount ?? 5;
  const genreLabel = genre.label;

  console.log(`\n🎯 ジャンル: ${genreLabel} (${genreKey}) / ${itemCount}件`);

  console.log('🔍 商品情報を検索中...');
  const rawProducts = await scrapeProducts({
    queries: genre.searchQueries,
    count: itemCount,
  });

  if (rawProducts.length === 0) {
    console.warn(`⚠️  ${genreLabel}: 商品が見つからなかったためプロンプト生成をスキップします`);
    return null;
  }

  console.log(`🔗 アソシエイトリンクを生成中 (${rawProducts.length}件)...`);
  const products = enrichProductsWithLinks(rawProducts, settings.associateTag);

  const title = buildTitle({
    genreLabel,
    count: products.length,
    date,
  });

  const prompt = buildChatPrompt({ title, genreLabel, genreKey, products });

  await ensureOutputDir();
  const stamp = formatDateStamp(date);
  const slug = slugify(genreKey);
  const promptPath = path.join(OUTPUT_DIR, `${stamp}_${slug}_prompt.md`);
  const dataPath = path.join(OUTPUT_DIR, `${stamp}_${slug}_data.json`);

  await fs.writeFile(promptPath, prompt, 'utf-8');
  await fs.writeFile(
    dataPath,
    JSON.stringify({ title, genreKey, genreLabel, products }, null, 2),
    'utf-8',
  );

  console.log(`✅ プロンプト生成完了`);
  console.log(`   プロンプト: ${promptPath}`);
  console.log(`   商品データ: ${dataPath}`);
  console.log(`\n👉 次のステップ:`);
  console.log(`   1. ${promptPath} の内容を Claude Pro チャットに貼り付ける`);
  console.log(`   2. Claudeが出力した記事本文を任意の .md ファイルに保存`);
  console.log(`   3. node src/index.js --finalize <その.mdファイル> --genre ${genreKey}`);

  return promptPath;
}

async function prepareForQuery({ query, settings, count, date = new Date() }) {
  const itemCount = count ?? settings.defaultItemCount ?? 5;

  console.log(`\n🎯 カスタムクエリ: "${query}" / ${itemCount}件`);

  console.log('🔍 商品情報を検索中...');
  const rawProducts = await scrapeByQuery({ query, count: itemCount });

  if (rawProducts.length === 0) {
    console.warn('⚠️  商品が見つからなかったためプロンプト生成をスキップします');
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

  const prompt = buildChatPrompt({ title, genreLabel, genreKey, products });

  await ensureOutputDir();
  const stamp = formatDateStamp(date);
  const promptPath = path.join(OUTPUT_DIR, `${stamp}_${genreKey}_prompt.md`);
  const dataPath = path.join(OUTPUT_DIR, `${stamp}_${genreKey}_data.json`);

  await fs.writeFile(promptPath, prompt, 'utf-8');
  await fs.writeFile(
    dataPath,
    JSON.stringify({ title, genreKey, genreLabel, products }, null, 2),
    'utf-8',
  );

  console.log(`✅ プロンプト生成完了`);
  console.log(`   プロンプト: ${promptPath}`);
  console.log(`   商品データ: ${dataPath}`);
  console.log(`\n👉 次のステップ:`);
  console.log(`   1. ${promptPath} の内容を Claude Pro チャットに貼り付ける`);
  console.log(`   2. Claudeが出力した記事本文を任意の .md ファイルに保存`);
  console.log(`   3. node src/index.js --finalize <その.mdファイル> --genre ${genreKey}`);

  return promptPath;
}

async function finalizeArticle({ bodyPath, genreKey, genreLabel, date = new Date() }) {
  const body = (await fs.readFile(bodyPath, 'utf-8')).trim();
  if (!body) {
    throw new Error(`記事本文が空です: ${bodyPath}`);
  }

  const header = buildArticleHeader({ genreKey, genreLabel, date });
  const footer = buildArticleFooter({ genreKey });
  const full = `${header}${body}\n${footer}`;

  await ensureOutputDir();
  const filename = `${formatDateStamp(date)}_${slugify(genreKey)}.md`;
  const outputPath = path.join(OUTPUT_DIR, filename);
  await fs.writeFile(outputPath, full, 'utf-8');

  console.log(`✅ 最終記事を保存: ${outputPath}`);
  return outputPath;
}

async function main() {
  const program = new Command();

  program
    .name('note-amazon-pipeline')
    .description('Claude Proチャットと連携してnote向けAmazonアソシエイト記事を生成するCLI')
    .option('-g, --genre <genre>', 'ジャンルキー (例: gadget, ai-books)')
    .option('-q, --query <query>', 'カスタム検索キーワード')
    .option('-c, --count <n>', '記事内の商品数', (v) => parseInt(v, 10))
    .option('-a, --all', '全ジャンルを一括でプロンプト生成')
    .option(
      '--finalize <file>',
      'Claudeが出力した記事本文ファイルを指定してヘッダー/フッター付き最終版を保存',
    )
    .parse(process.argv);

  const opts = program.opts();
  const settings = await loadSettings();

  if (!settings.associateTag || settings.associateTag === 'YOUR_ASSOCIATE_TAG-22') {
    console.warn(
      '⚠️  config/settings.json の associateTag がデフォルト値のままです。自分のタグに変更してください。',
    );
  }

  const date = new Date();

  // --finalize モード: 記事本文ファイル → ヘッダー/フッター付き最終版
  if (opts.finalize) {
    if (!opts.genre && !opts.query) {
      console.error('❌ --finalize には --genre か --query のいずれかが必要です');
      process.exit(1);
    }
    const genreKey = opts.genre ?? slugify(opts.query);
    const genreLabel =
      (opts.genre && settings.genres[opts.genre]?.label) || opts.query || genreKey;
    await finalizeArticle({
      bodyPath: opts.finalize,
      genreKey,
      genreLabel,
      date,
    });
    return;
  }

  // prepareモード: スクレイピング → プロンプト生成
  if (!opts.genre && !opts.query && !opts.all) {
    console.error('❌ --genre, --query, --all, --finalize のいずれかを指定してください');
    program.help({ error: true });
  }

  if (opts.all) {
    const outputs = [];
    for (const [genreKey, genre] of Object.entries(settings.genres)) {
      try {
        const out = await prepareForGenre({
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
    console.log(`\n🎉 全ジャンル処理完了: ${outputs.length}件のプロンプトを生成`);
    return;
  }

  if (opts.query) {
    await prepareForQuery({ query: opts.query, settings, count: opts.count, date });
    return;
  }

  const genre = settings.genres[opts.genre];
  if (!genre) {
    const keys = Object.keys(settings.genres).join(', ');
    console.error(`❌ ジャンル "${opts.genre}" が見つかりません。利用可能: ${keys}`);
    process.exit(1);
  }

  await prepareForGenre({
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
