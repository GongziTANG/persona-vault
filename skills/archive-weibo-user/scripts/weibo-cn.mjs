function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function extractWeiboCnPage() {
  const text = element => (element?.innerText || element?.textContent || '').replace(/\u00a0/g, ' ').trim();
  const cards = Array.from(document.querySelectorAll('div.c[id^="M_"]')).map(card => {
    const id = card.id.replace(/^M_/, '');
    const body = card.querySelector('.ctt');
    const repostHeader = Array.from(card.querySelectorAll('span.cmt')).find(element => /^转发了\s/.test(text(element)));
    const originalAuthor = repostHeader ? text(repostHeader).replace(/^转发了\s*/, '').replace(/\s*的微博:?[：]?$/, '') : '';
    const divs = Array.from(card.children).filter(element => element.tagName === 'DIV');
    let forwardReason = '';
    if (repostHeader && divs.length) {
      forwardReason = text(divs[divs.length - 1]).replace(/^转发理由\s*[:：]?\s*/, '').replace(/赞\[\d+\][\s\S]*$/, '').trim();
    }
    const fullLinks = Array.from(card.querySelectorAll('a[href*="ckAll=1"]'));
    const originalFullLink = fullLinks.find(link => body?.contains(link));
    const ownFullLink = fullLinks.find(link => !body?.contains(link));
    const media = [];
    const groupLink = Array.from(card.querySelectorAll('a')).find(link => /组图共\d+张/.test(text(link)));
    if (groupLink) media.push(`[${text(groupLink)}]`);
    else if (card.querySelector('img[alt="图片"]')) media.push('[图片]');
    if (Array.from(card.querySelectorAll('a')).some(link => /视频/.test(text(link)))) media.push('[视频]');
    return {
      id,
      dateText: text(card.querySelector('span.ct')),
      originalText: text(body).replace(/\s*全文$/, '').replace(/^[:：]\s*/, '').trim(),
      originalAuthor,
      forwardReason,
      isRepost: Boolean(repostHeader),
      originalFullUrl: originalFullLink?.href || '',
      ownFullUrl: ownFullLink?.href || '',
      media: [...new Set(media)],
      pinned: /(^|\s)置顶(\s|$)/.test(text(card)),
    };
  });
  const bodyText = document.body.innerText || document.body.textContent || '';
  const pager = bodyText.match(/(\d+)\/(\d+)页/);
  const reported = bodyText.match(/微博\[(\d+)\]/);
  return {
    profileName: document.title.replace(/的微博\s*$/, '').trim(),
    page: pager ? Number(pager[1]) : 1,
    totalPages: pager ? Number(pager[2]) : 1,
    reportedPostCount: reported ? Number(reported[1]) : cards.length,
    cards,
  };
}

export function extractWeiboCnDetail() {
  const text = element => (element?.innerText || element?.textContent || '').replace(/\u00a0/g, ' ').trim();
  const card = document.querySelector('div.c[id^="M_"]');
  if (!card) return null;
  const body = card.querySelector('.ctt');
  const repostHeader = Array.from(card.querySelectorAll('span.cmt')).find(element => /^转发了\s/.test(text(element)));
  const originalAuthor = repostHeader ? text(repostHeader).replace(/^转发了\s*/, '').replace(/\s*的微博:?[：]?$/, '') : '';
  const divs = Array.from(card.children).filter(element => element.tagName === 'DIV');
  let forwardReason = '';
  if (repostHeader && divs.length) {
    forwardReason = text(divs[divs.length - 1]).replace(/^转发理由\s*[:：]?\s*/, '').replace(/赞\[\d+\][\s\S]*$/, '').trim();
  }
  return {
    originalText: text(body).replace(/\s*全文$/, '').replace(/^[:：]\s*/, '').trim(),
    originalAuthor,
    forwardReason,
    isRepost: Boolean(repostHeader),
  };
}

function shanghaiParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  return Object.fromEntries(parts.map(part => [part.type, part.value]));
}

export function parseWeiboCnDate(value, reference = new Date()) {
  const raw = String(value || '').replace(/\u00a0/g, ' ').split(/\s+来自/)[0].trim();
  const current = shanghaiParts(reference);
  let match = raw.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (match) return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6] || '00'}`;
  match = raw.match(/^(\d{2})月(\d{2})日\s+(\d{2}):(\d{2})$/);
  if (match) return `${current.year}-${match[1]}-${match[2]} ${match[3]}:${match[4]}:00`;
  match = raw.match(/^今天\s+(\d{2}):(\d{2})$/);
  if (match) return `${current.year}-${current.month}-${current.day} ${match[1]}:${match[2]}:00`;
  match = raw.match(/^昨天\s+(\d{2}):(\d{2})$/);
  if (match) {
    const yesterday = new Date(reference.getTime() - 86400000);
    const parts = shanghaiParts(yesterday);
    return `${parts.year}-${parts.month}-${parts.day} ${match[1]}:${match[2]}:00`;
  }
  match = raw.match(/^(\d+)分钟前$/);
  if (match) {
    const prior = shanghaiParts(new Date(reference.getTime() - Number(match[1]) * 60000));
    return `${prior.year}-${prior.month}-${prior.day} ${prior.hour}:${prior.minute}:${prior.second}`;
  }
  if (raw === '刚刚') {
    return `${current.year}-${current.month}-${current.day} ${current.hour}:${current.minute}:${current.second}`;
  }
  throw new Error(`无法解析微博日期：${raw}`);
}

async function openWithRetry(tab, url, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      await tab.goto(url);
      await tab.playwright.waitForLoadState({ state: 'domcontentloaded', timeoutMs: 20000 });
      return;
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await sleep(750 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function readDetail(detailTab, url) {
  await openWithRetry(detailTab, url);
  const detail = await detailTab.playwright.evaluate(extractWeiboCnDetail);
  if (!detail?.originalText && !detail?.forwardReason) throw new Error(`长微博正文读取失败：${url}`);
  return detail;
}

export async function collectPage({ tab, detailTab, uid, name, page, referenceDate = new Date(), detailDelayMs = 180 }) {
  const url = `https://weibo.cn/u/${encodeURIComponent(uid)}?filter=0&page=${Number(page)}`;
  await openWithRetry(tab, url);
  const pageData = await tab.playwright.evaluate(extractWeiboCnPage);
  if (pageData.profileName !== name) throw new Error(`账号身份不匹配：页面为 ${pageData.profileName}，请求为 ${name}`);
  if (pageData.page !== Number(page)) throw new Error(`分页未前进：请求 ${page}，实际 ${pageData.page}`);
  const terminalReached = pageData.page === pageData.totalPages;
  if (!pageData.cards.length && pageData.reportedPostCount > 0 && !terminalReached) {
    throw new Error(`第 ${page} 页没有微博卡片`);
  }

  const posts = [];
  for (const card of pageData.cards) {
    let resolved = { ...card };
    if (card.originalFullUrl) {
      const detail = await readDetail(detailTab, card.originalFullUrl);
      resolved.originalText = detail.originalText;
      if (!resolved.originalAuthor) resolved.originalAuthor = detail.originalAuthor;
      await sleep(detailDelayMs);
    }
    if (card.ownFullUrl) {
      const detail = await readDetail(detailTab, card.ownFullUrl);
      resolved = { ...resolved, ...detail };
      await sleep(detailDelayMs);
    }
    let content;
    if (resolved.isRepost) {
      const reason = resolved.forwardReason || '转发微博';
      const source = resolved.originalAuthor ? `【转发自 ${resolved.originalAuthor}】` : '【转发内容】';
      content = `${reason}\n\n${source}\n${resolved.originalText}`.trim();
    } else {
      content = resolved.originalText;
    }
    if (!content && resolved.media.length) content = resolved.media.join(' ');
    if (!content) throw new Error(`微博 ${card.id} 正文为空`);
    posts.push({
      id: card.id,
      publishedAt: parseWeiboCnDate(card.dateText, referenceDate),
      content,
      url: `https://weibo.cn/comment/${card.id}`,
      pinned: card.pinned,
    });
  }
  return {
    page: pageData.page,
    totalPages: pageData.totalPages,
    reportedPostCount: pageData.reportedPostCount,
    terminalReached,
    posts,
  };
}
