// Web検索＆商品情報スクレイピング

import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { expandQuery, getDateTokens } from './templates.js';
import { extractAsin } from './links.js';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const DEFAULT_HEADERS = {
  'User-Agent': USER_AGENT,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
};

const DELAY_MS = 1000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchHtml(url, { timeoutMs = 15000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: DEFAULT_HEADERS,
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${url}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function searchEngineUrl(query) {
  // DuckDuckGoのHTML版を使用（スクレイパーフレンドリー）
  return `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
}

function parseSearchResults(html) {
  const $ = cheerio.load(html);
  const results = [];
  $('.result').each((_, el) => {
    const title = $(el).find('.result__title').text().trim();
    const snippet = $(el).find('.result__snippet').text().trim();
    let link = $(el).find('.result__url').attr('href')
      || $(el).find('a.result__a').attr('href')
      || '';
    // DuckDuckGoはリダイレクトリンクを返すので uddg パラメータから実URLを抽出
    try {
      if (link) {
        const parsed = new URL(link, 'https://duckduckgo.com');
        const real = parsed.searchParams.get('uddg');
        if (real) link = decodeURIComponent(real);
      }
    } catch {
      // 無視
    }
    if (title) {
      results.push({ title, snippet, url: link });
    }
  });
  return results;
}

async function searchWeb(query) {
  try {
    const html = await fetchHtml(searchEngineUrl(query));
    return parseSearchResults(html);
  } catch (err) {
    console.warn(`⚠️  検索失敗 "${query}": ${err.message}`);
    return [];
  }
}

function extractPriceFromText(text) {
  if (!text) return null;
  // 「¥12,800」「12,800円」などにマッチ
  const match = text.match(/[¥￥]\s?([0-9,]+)|([0-9,]{3,})\s?円/);
  if (!match) return null;
  const raw = (match[1] || match[2] || '').replace(/,/g, '');
  const value = parseInt(raw, 10);
  if (!Number.isFinite(value) || value < 100) return null;
  return `¥${value.toLocaleString('ja-JP')}`;
}

function extractReleaseDateFromText(text) {
  if (!text) return null;
  const patterns = [
    /(\d{4})年(\d{1,2})月(\d{1,2})日/,
    /(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/,
    /(\d{4})年(\d{1,2})月/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0];
  }
  return null;
}

function extractFeaturesFromText(text, max = 5) {
  if (!text) return [];
  const clean = text.replace(/\s+/g, ' ').trim();
  const sentences = clean.split(/[。．\.!！\n]/).map((s) => s.trim()).filter(Boolean);
  return sentences.slice(0, max);
}

async function enrichProductDetails(result) {
  const product = {
    name: result.title,
    amazonUrl: null,
    asin: null,
    price: extractPriceFromText(result.snippet),
    features: extractFeaturesFromText(result.snippet, 3),
    releaseDate: extractReleaseDateFromText(result.snippet),
    sourceUrl: result.url || null,
    snippet: result.snippet || '',
  };

  // AmazonのURLを含む場合はASIN抽出
  const asin = extractAsin(result.url || '');
  if (asin) {
    product.asin = asin;
    product.amazonUrl = result.url;
  }

  // ページをフェッチして詳細を強化（Amazon以外も対象）
  if (result.url) {
    try {
      const html = await fetchHtml(result.url, { timeoutMs: 10000 });
      const $ = cheerio.load(html);

      // og:title を優先
      const ogTitle = $('meta[property="og:title"]').attr('content');
      if (ogTitle && ogTitle.length > product.name.length * 0.5) {
        product.name = ogTitle.trim();
      }

      const ogDesc =
        $('meta[property="og:description"]').attr('content') ||
        $('meta[name="description"]').attr('content') ||
        '';

      if (!product.price) product.price = extractPriceFromText(ogDesc);
      if (!product.releaseDate) product.releaseDate = extractReleaseDateFromText(ogDesc);
      if (product.features.length === 0 && ogDesc) {
        product.features = extractFeaturesFromText(ogDesc, 5);
      }

      // ページ内のAmazonリンクを探してASINを取得
      if (!product.asin) {
        $('a[href*="amazon.co.jp"], a[href*="amzn.to"], a[href*="amazon.com"]').each((_, a) => {
          if (product.asin) return;
          const href = $(a).attr('href') || '';
          const found = extractAsin(href);
          if (found) {
            product.asin = found;
            product.amazonUrl = href;
          }
        });
      }
    } catch (err) {
      // ページフェッチ失敗は致命ではない
      console.warn(`⚠️  詳細ページ取得失敗: ${result.url} (${err.message})`);
    }
  }

  return product;
}

function dedupeByName(products) {
  const seen = new Set();
  const out = [];
  for (const p of products) {
    const key = (p.name || '').toLowerCase().replace(/\s+/g, '');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

export async function scrapeProducts({ queries, count = 5 }) {
  if (!Array.isArray(queries) || queries.length === 0) {
    throw new Error('queries must be a non-empty array');
  }

  const tokens = getDateTokens(new Date());
  const expandedQueries = queries.map((q) => expandQuery(q, tokens));

  console.log(`🔍 検索クエリ: ${expandedQueries.length}件`);
  const allResults = [];
  for (const q of expandedQueries) {
    console.log(`   - "${q}"`);
    const results = await searchWeb(q);
    allResults.push(...results);
    await delay(DELAY_MS);
  }

  if (allResults.length === 0) {
    console.warn('⚠️  検索結果が0件でした');
    return [];
  }

  const unique = dedupeByName(
    allResults.map((r) => ({ title: r.title, snippet: r.snippet, url: r.url }))
  );

  console.log(`📦 候補: ${unique.length}件 → 上位${count}件を詳細取得`);
  const targets = unique.slice(0, count);

  const enriched = [];
  for (const t of targets) {
    try {
      const product = await enrichProductDetails(t);
      enriched.push(product);
    } catch (err) {
      console.warn(`⚠️  商品情報取得失敗: ${t.title} (${err.message})`);
    }
    await delay(DELAY_MS);
  }

  return enriched;
}

export async function scrapeByQuery({ query, count = 5 }) {
  return scrapeProducts({ queries: [query], count });
}
