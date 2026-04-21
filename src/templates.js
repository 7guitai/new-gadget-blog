// 記事タイトル・ハッシュタグ・定型文テンプレート

export function getSeason(month) {
  if (month >= 3 && month <= 5) return '春';
  if (month >= 6 && month <= 8) return '夏';
  if (month >= 9 && month <= 11) return '秋';
  return '冬';
}

export function getDateTokens(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return {
    year: String(year),
    month: String(month),
    season: getSeason(month),
  };
}

export function expandQuery(template, tokens) {
  return template
    .replace(/\{year\}/g, tokens.year)
    .replace(/\{month\}/g, tokens.month)
    .replace(/\{season\}/g, tokens.season);
}

export const TITLE_TEMPLATES = [
  '【{year}年{month}月】{genre}の注目新製品おすすめ{count}選',
  '【最新】{year}年に買うべき{genre}はこれ！厳選{count}アイテム',
];

export function buildTitle({ genreLabel, count, date = new Date(), templateIndex = 0 }) {
  const tokens = getDateTokens(date);
  const template = TITLE_TEMPLATES[templateIndex] ?? TITLE_TEMPLATES[0];
  return template
    .replace(/\{year\}/g, tokens.year)
    .replace(/\{month\}/g, tokens.month)
    .replace(/\{genre\}/g, genreLabel)
    .replace(/\{count\}/g, String(count));
}

export function buildHashtags(genreKey) {
  return `#おすすめ #${genreKey} #新製品 #Amazon #レビュー`;
}

export const ASSOCIATE_DISCLAIMER = '※本記事にはAmazonアソシエイトリンクが含まれています。';

export function buildArticleHeader({ genreKey, genreLabel, date = new Date() }) {
  const iso = date.toISOString();
  return [
    '<!--',
    `  generated: ${iso}`,
    `  genre: ${genreKey} (${genreLabel})`,
    '-->',
    '',
  ].join('\n');
}

export function buildArticleFooter({ genreKey }) {
  return ['', '---', '', ASSOCIATE_DISCLAIMER, '', buildHashtags(genreKey), ''].join('\n');
}
