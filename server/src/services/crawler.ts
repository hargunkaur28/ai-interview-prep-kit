import * as cheerio from 'cheerio';
import { URL } from 'url';
import { config } from '../config';

export interface CrawledPage {
  url: string;
  title: string;
  content: string;
  isCareersOrHiring: boolean;
}

export interface CrawlResult {
  reachable: boolean;
  warning?: string;
  pages: CrawledPage[];
}

// Private/loopback IP detection for SSRF prevention
function isPrivateOrLoopbackHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return true;
  }
  // Check private IPv4 ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x
  const parts = hostname.split('.').map(p => parseInt(p, 10));
  if (parts.length === 4 && parts.every(p => !isNaN(p))) {
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

/**
 * Validates target URL against SSRF and formatting rules.
 */
export function validateUrl(targetUrl: string): { valid: boolean; error?: string; parsed?: URL } {
  try {
    let normalized = targetUrl.trim();
    if (!/^https?:\/\//i.test(normalized)) {
      normalized = `https://${normalized}`;
    }

    const parsed = new URL(normalized);

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only http and https protocols are permitted' };
    }

    if (!config.allowLocalUrls && isPrivateOrLoopbackHost(parsed.hostname)) {
      return { valid: false, error: 'Private and loopback addresses are blocked in production' };
    }

    return { valid: true, parsed };
  } catch (err: any) {
    return { valid: false, error: `Invalid URL: ${err.message}` };
  }
}

/**
 * Checks robots.txt to see if path is explicitly disallowed.
 */
async function isAllowedByRobots(baseUrl: URL, targetPath: string): Promise<boolean> {
  try {
    const robotsUrl = new URL('/robots.txt', baseUrl.origin).toString();
    const res = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(3000),
      headers: { 'User-Agent': 'TraoInterviewPrepBot/1.0' },
    });
    if (!res.ok) return true; // Default allow if robots.txt 404s
    const text = await res.text();
    const disallows: string[] = [];
    const lines = text.split('\n');
    let isAllUserAgent = true;

    for (const line of lines) {
      const trimmed = line.trim();
      if (/^User-agent:\s*\*/i.test(trimmed)) {
        isAllUserAgent = true;
      } else if (/^User-agent:/i.test(trimmed)) {
        isAllUserAgent = false;
      } else if (isAllUserAgent && /^Disallow:\s*(.+)/i.test(trimmed)) {
        const path = trimmed.replace(/^Disallow:\s*/i, '').trim();
        if (path) disallows.push(path);
      }
    }

    for (const d of disallows) {
      if (d !== '/' && targetPath.startsWith(d)) {
        return false;
      }
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Cleans HTML into concise, readable text content.
 */
function cleanHtmlContent(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);

  // Remove irrelevant non-content elements
  $('script, style, nav, footer, header, svg, noscript, iframe, aside').remove();

  const title = $('title').text().trim() || $('h1').first().text().trim() || '';

  // Extract from main content container if present, else body
  const container = $('main, article, #content, .content, body').first();
  const text = container.text()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000); // keep clean and token-friendly

  return { title, text };
}

/**
 * Scores a discovered link based on interview/hiring relevance.
 */
function scoreLink(href: string, text: string): number {
  const combined = `${href} ${text}`.toLowerCase();
  let score = 0;

  if (/careers|jobs|join|hiring|work-with-us/i.test(combined)) score += 50;
  if (/interview|process|selection|assessment|how-we-hire/i.test(combined)) score += 60;
  if (/engineering|tech-blog|handbook|culture|values/i.test(combined)) score += 30;
  if (/about|company|story|team|mission/i.test(combined)) score += 20;

  // Penalize external links, anchors, or utility pages
  if (/#|privacy|terms|login|signup|cart|help|support/i.test(combined)) score -= 40;

  return score;
}

/**
 * Crawls company website, ranks internal links, and retrieves the most relevant pages.
 * Reports failures gracefully without crashing.
 */
export async function crawlCompanyWebsite(companyUrl: string): Promise<CrawlResult> {
  const urlCheck = validateUrl(companyUrl);
  if (!urlCheck.valid || !urlCheck.parsed) {
    return {
      reachable: false,
      warning: `Company URL invalid: ${urlCheck.error || 'Invalid format'}`,
      pages: [],
    };
  }

  const base = urlCheck.parsed;
  const pages: CrawledPage[] = [];

  // Step 1: Fetch Homepage
  let homepageHtml = '';
  try {
    const res = await fetch(base.toString(), {
      signal: AbortSignal.timeout(config.crawlTimeoutMs),
      headers: {
        'User-Agent': 'TraoPrepBot/1.0 (Interview Preparation Assistant)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    });

    if (!res.ok) {
      return {
        reachable: false,
        warning: `Company homepage returned HTTP ${res.status}. Proceeding with job description alone.`,
        pages: [],
      };
    }

    homepageHtml = await res.text();
    const { title, text } = cleanHtmlContent(homepageHtml);
    pages.push({
      url: base.toString(),
      title,
      content: text,
      isCareersOrHiring: /career|hiring|jobs/i.test(`${title} ${text}`),
    });
  } catch (err: any) {
    return {
      reachable: false,
      warning: `Unable to reach company website (${err.message || 'Timeout/Network error'}). Proceeding with job description alone.`,
      pages: [],
    };
  }

  // Step 2: Discover & Rank candidate links from homepage
  try {
    const $ = cheerio.load(homepageHtml);
    const candidateLinks: { url: string; score: number; text: string }[] = [];

    $('a[href]').each((_, el) => {
      const rawHref = $(el).attr('href');
      const linkText = $(el).text().trim();
      if (!rawHref) return;

      try {
        const resolved = new URL(rawHref, base);
        // Only crawl same-origin links
        if (resolved.origin === base.origin && resolved.pathname !== base.pathname) {
          const score = scoreLink(resolved.pathname, linkText);
          if (score > 10) {
            candidateLinks.push({ url: resolved.toString(), score, text: linkText });
          }
        }
      } catch {
        // invalid relative url
      }
    });

    // Deduplicate and rank by score
    candidateLinks.sort((a, b) => b.score - a.score);
    const seenUrls = new Set<string>([base.toString()]);
    const topUrls: string[] = [];

    for (const cand of candidateLinks) {
      if (!seenUrls.has(cand.url)) {
        seenUrls.add(cand.url);
        topUrls.push(cand.url);
        if (topUrls.length >= config.maxCrawlPages - 1) break;
      }
    }

    // Step 3: Fetch top candidate pages with delay & robots check
    for (const pageUrl of topUrls) {
      try {
        const candidateUrlObj = new URL(pageUrl);
        const allowed = await isAllowedByRobots(base, candidateUrlObj.pathname);
        if (!allowed) continue;

        // Polite delay
        await new Promise(r => setTimeout(r, 250));

        const pageRes = await fetch(pageUrl, {
          signal: AbortSignal.timeout(config.crawlTimeoutMs),
          headers: {
            'User-Agent': 'TraoPrepBot/1.0 (Interview Preparation Assistant)',
          },
        });

        if (pageRes.ok) {
          const html = await pageRes.text();
          const { title, text } = cleanHtmlContent(html);
          if (text.length > 50) {
            pages.push({
              url: pageUrl,
              title,
              content: text,
              isCareersOrHiring: /career|hiring|jobs|interview/i.test(`${pageUrl} ${title}`),
            });
          }
        }
      } catch {
        // Individual page failure is skipped politely
      }
    }
  } catch (err) {
    console.warn('[Crawler] Error discovering additional pages:', err);
  }

  const hasHiringPage = pages.some(p => p.isCareersOrHiring);

  return {
    reachable: true,
    warning: !hasHiringPage ? 'Company hiring/careers page was not discoverable on the website.' : undefined,
    pages,
  };
}
