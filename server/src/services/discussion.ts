/**
 * Searches public interview discussions and hiring process details.
 * Falls back honestly if no verified discussion is discovered.
 */
export async function searchPublicInterviewDiscussion(
  companyName: string,
  companyUrl: string
): Promise<{ found: boolean; notes: string }> {
  // If it's a local address or empty, report unavailable immediately
  if (!companyName || /localhost|127\.0\.0\.1/i.test(companyUrl)) {
    return {
      found: false,
      notes: 'Local development or private company URL provided; public interview discussion is not applicable.',
    };
  }

  try {
    // Attempt lightweight public search query using DuckDuckGo lite HTML
    const query = encodeURIComponent(`"${companyName}" interview process site:glassdoor.com OR site:reddit.com`);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${query}`;

    const res = await fetch(searchUrl, {
      signal: AbortSignal.timeout(4000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (res.ok) {
      const html = await res.text();
      // Extract brief snippets if found
      const snippets: string[] = [];
      const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
      let match;
      while ((match = snippetRegex.exec(html)) !== null && snippets.length < 3) {
        const text = match[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
        if (text) snippets.push(text);
      }

      if (snippets.length > 0) {
        return {
          found: true,
          notes: snippets.join('\n\n'),
        };
      }
    }
  } catch {
    // Network or timeout
  }

  return {
    found: false,
    notes: 'Public interview process discussions are unavailable or not discoverable for this company.',
  };
}
