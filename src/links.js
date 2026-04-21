// Amazonアソシエイトリンク生成モジュール

const ASIN_REGEX = /\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i;

export function extractAsin(url) {
  if (!url || typeof url !== 'string') return null;
  const match = url.match(ASIN_REGEX);
  return match ? match[1].toUpperCase() : null;
}

export function buildProductUrl(asin, associateTag) {
  if (!asin) return null;
  if (!associateTag) {
    throw new Error('associateTag is required');
  }
  return `https://www.amazon.co.jp/dp/${asin}?tag=${associateTag}`;
}

export function buildSearchUrl(productName, associateTag) {
  if (!productName) return null;
  if (!associateTag) {
    throw new Error('associateTag is required');
  }
  const encoded = encodeURIComponent(productName);
  return `https://www.amazon.co.jp/s?k=${encoded}&tag=${associateTag}`;
}

export function buildAssociateLink(product, associateTag) {
  const asinFromField = product.asin || null;
  const asinFromUrl = extractAsin(product.amazonUrl);
  const asin = asinFromField || asinFromUrl;

  if (asin) {
    return {
      type: 'product',
      asin,
      url: buildProductUrl(asin, associateTag),
    };
  }

  return {
    type: 'search',
    asin: null,
    url: buildSearchUrl(product.name, associateTag),
  };
}

export function enrichProductsWithLinks(products, associateTag) {
  return products.map((product) => {
    try {
      const link = buildAssociateLink(product, associateTag);
      return { ...product, associateLink: link };
    } catch (err) {
      console.warn(`⚠️  リンク生成失敗: ${product.name || 'unknown'} (${err.message})`);
      return { ...product, associateLink: null };
    }
  });
}
