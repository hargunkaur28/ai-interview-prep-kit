import Groq from 'groq-sdk';
import { config } from '../config';
import {
  Requirement,
  RoleInfo,
  CompanyBrief,
  Question,
  Flashcard,
  QuestionCategory,
} from '@trao/shared';
import { GroqTokenScheduler } from './scheduler';

let groqClient: Groq | null = null;

function getGroqClient(): Groq {
  if (!groqClient) {
    if (!config.groqApiKey) {
      console.warn('[Groq] Warning: GROQ_API_KEY is not set in environment. Running in fallback mode.');
    }
    groqClient = new Groq({
      apiKey: config.groqApiKey || 'dummy-key',
    });
  }
  return groqClient;
}

export interface CallGroqOptions {
  stage: string;
  systemPrompt: string;
  userPrompt: string;
  maxTokens: number;
  temperature?: number;
  allowFallback?: boolean; // false for company-specific content
}

/**
 * Parses numeric seconds from rate limit messages like "try again in 12.3s" or Retry-After header.
 */
function parseRetryDelayMs(error: any): number {
  try {
    // Check headers if available
    const headerSec = error?.headers?.get?.('retry-after') || error?.response?.headers?.['retry-after'];
    if (headerSec) {
      const parsed = parseFloat(headerSec);
      if (!isNaN(parsed) && parsed > 0) {
        return Math.min(65000, Math.ceil(parsed * 1000) + 500);
      }
    }

    // Check error message string
    const msg = String(error?.message || '');
    const match = msg.match(/try again in ([\d\.]+)s/i) || msg.match(/retry after ([\d\.]+)s/i);
    if (match && match[1]) {
      const sec = parseFloat(match[1]);
      if (!isNaN(sec) && sec > 0) {
        return Math.min(65000, Math.ceil(sec * 1000) + 500);
      }
    }
  } catch {
    // ignore
  }
  return 3000; // default backoff
}

/**
 * Dispatches a prompt against Groq through the TokenScheduler with intelligent rate-limit recovery.
 */
export async function callGroqWithScheduler(options: CallGroqOptions): Promise<string> {
  const {
    stage,
    systemPrompt,
    userPrompt,
    maxTokens,
    temperature = 0.2,
    allowFallback = true,
  } = options;

  // If no API key is provided, use fallback when allowed
  if (!config.groqApiKey) {
    if (!allowFallback) {
      throw new Error(`[Groq] GROQ_API_KEY not configured. Cannot perform company-specific generation for stage "${stage}".`);
    }
    return generateFallbackResponse(systemPrompt, userPrompt);
  }

  const client = getGroqClient();
  const scheduler = GroqTokenScheduler.getInstance();
  let modelToUse = config.groqModel;

  // Step 1: Acquire reservation for requested maxTokens through the sliding-window scheduler
  const initial = await scheduler.acquireReservation(stage, maxTokens);
  let grantedTokens = initial.grantedTokens;
  let reservationId = initial.reservationId;

  console.log(
    `[Groq Request] Stage: ${stage} | Model: ${modelToUse} | Limit: ${grantedTokens} tokens | Queue Wait: ${initial.queueWaitMs}ms`
  );

  try {
    const response = await client.chat.completions.create({
      model: modelToUse,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature,
      max_tokens: grantedTokens,
      response_format: { type: 'json_object' },
    });

    const completionTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;
    scheduler.recordActualUsage(reservationId, completionTokens);

    console.log(
      `[Groq Response] Stage: ${stage} | Model: ${modelToUse} | Status: 200 | Output: ${completionTokens} tokens | Total: ${totalTokens} tokens`
    );

    return response.choices[0]?.message?.content || '{}';
  } catch (error: any) {
    const status = error?.status || 500;
    const errorMsg = error?.message || String(error);
    const isModelNotFound = status === 404 || errorMsg.includes('model_not_found');
    const isRateLimit = status === 429 || errorMsg.includes('rate_limit') || errorMsg.includes('429');

    console.error(`[Groq Error] Stage: ${stage} | Model: ${modelToUse} | Status: ${status} | Message: ${errorMsg}`);

    if (isModelNotFound) {
      if (config.groqFallbackModel && modelToUse !== config.groqFallbackModel) {
        console.warn(`[Groq] Configured model "${modelToUse}" returned model_not_found. Switching to explicit GROQ_FALLBACK_MODEL: "${config.groqFallbackModel}".`);
        modelToUse = config.groqFallbackModel;
        // Acquire fresh reservation for fallback model attempt
        const retryRes = await scheduler.acquireReservation(`${stage}_model_switch`, grantedTokens);
        const retryResponse = await client.chat.completions.create({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: retryRes.grantedTokens,
          response_format: { type: 'json_object' },
        });
        const completionTokens = retryResponse.usage?.completion_tokens || 0;
        scheduler.recordActualUsage(retryRes.reservationId, completionTokens);
        return retryResponse.choices[0]?.message?.content || '{}';
      } else {
        throw new Error(`Configured Groq model "${modelToUse}" was not found (404). Please update GROQ_MODEL in .env.`);
      }
    }

    if (isRateLimit) {
      scheduler.totalRetries++;
      const delayMs = parseRetryDelayMs(error);
      const reducedTokens = Math.max(150, Math.floor(grantedTokens * 0.75));

      console.warn(
        `[Groq RateLimit] Stage: ${stage} | 429 rate limit detected. ` +
        `Reducing output budget to ${reducedTokens} tokens (-25%). Backing off for ${delayMs}ms before single retry...`
      );

      await new Promise(r => setTimeout(r, delayMs));

      // Acquire fresh reservation through scheduler with reduced limit (Requirement 4)
      const retryRes = await scheduler.acquireReservation(`${stage}_rate_retry`, reducedTokens);

      try {
        console.log(
          `[Groq Retry] Stage: ${stage} | Model: ${modelToUse} | Reduced Limit: ${retryRes.grantedTokens} tokens | Wait: ${retryRes.queueWaitMs}ms`
        );

        const retryResponse = await client.chat.completions.create({
          model: modelToUse,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature,
          max_tokens: retryRes.grantedTokens,
          response_format: { type: 'json_object' },
        });

        const compTokens = retryResponse.usage?.completion_tokens || 0;
        scheduler.recordActualUsage(retryRes.reservationId, compTokens);

        console.log(
          `[Groq Retry Response] Stage: ${stage} | Status: 200 | Output: ${compTokens} tokens`
        );

        return retryResponse.choices[0]?.message?.content || '{}';
      } catch (retryErr: any) {
        console.error(`[Groq Retry Error] Stage: ${stage} failed after rate-limit backoff:`, retryErr?.message || retryErr);
        if (!allowFallback) {
          throw new Error(`[Groq] Company-specific generation failed on retry for "${stage}": ${retryErr.message}`);
        }
        scheduler.fallbackCount++;
        return generateFallbackResponse(systemPrompt, userPrompt);
      }
    }

    // Generic error
    if (!allowFallback) {
      throw new Error(`[Groq] Request failed for company-specific stage "${stage}": ${errorMsg}`);
    }
    scheduler.fallbackCount++;
    return generateFallbackResponse(systemPrompt, userPrompt);
  }
}

/**
 * Cleans and parses JSON output safely with JSON block extraction fallback.
 */
export function cleanJsonParse<T>(rawText: string, fallback: T): T {
  try {
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    return JSON.parse(text) as T;
  } catch {
    try {
      // Try extracting first balanced JSON object
      const start = rawText.indexOf('{');
      const end = rawText.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        const extracted = rawText.substring(start, end + 1);
        return JSON.parse(extracted) as T;
      }
    } catch {
      // ignore
    }
    console.error('[Groq] Failed to parse JSON response:', rawText.slice(0, 200));
    return fallback;
  }
}

/**
 * Stage 1: Extracts structured role and requirements from raw Job Description.
 * Limit: 380 tokens (strictly <= 450 tokens)
 */
export async function extractRequirementsFromJD(jdText: string): Promise<RoleInfo> {
  const systemPrompt = `You are an expert technical recruiter and job analyst.
Extract structured role info from the job description. Return JSON:
{
  "title": string,
  "seniority": string,
  "responsibilities": string[], // up to 4 key bullet points
  "requirements": [ // up to 6 core requirements
    {
      "id": string, // "r1", "r2", ...
      "text": string,
      "kind": "technical" | "behavioural" | "domain",
      "priority": "must" | "nice"
    }
  ]
}
RULES: Strict to provided text. Sequential IDs: r1, r2, ... Keep descriptions crisp.`;

  const userPrompt = `Job Description:\n"""\n${jdText.slice(0, 4000)}\n"""`;
  const raw = await callGroqWithScheduler({
    stage: 'extracting_jd',
    systemPrompt,
    userPrompt,
    maxTokens: 380, // ceiling 450
    temperature: 0.1,
    allowFallback: true,
  });

  const parsed = cleanJsonParse<any>(raw, {} as any);

  const title = parsed?.title || parsed?.role_title || 'Software Engineer';
  const seniority = parsed?.seniority || 'Not Specified';
  const responsibilities = Array.isArray(parsed?.responsibilities) ? parsed.responsibilities : [];

  const rawReqs = Array.isArray(parsed?.requirements) && parsed.requirements.length > 0
    ? parsed.requirements
    : [{ id: 'r1', text: 'Core role responsibilities and qualifications', kind: 'technical' as const, priority: 'must' as const }];

  return {
    title,
    seniority,
    responsibilities,
    requirements: rawReqs.map((req: any, idx: number) => {
      let priority: 'must' | 'nice' = 'must';
      const rawPriority = String(req?.priority || '').toLowerCase();
      if (rawPriority === 'must' || rawPriority === 'mandatory' || rawPriority === 'required') {
        priority = 'must';
      } else if (rawPriority === 'nice' || rawPriority === 'optional' || rawPriority === 'preferred' || rawPriority === 'bonus') {
        priority = 'nice';
      }

      let kind: 'technical' | 'behavioural' | 'domain' = 'technical';
      const rawKind = String(req?.kind || '').toLowerCase();
      if (rawKind === 'technical' || rawKind === 'skill' || rawKind === 'tech') {
        kind = 'technical';
      } else if (rawKind === 'behavioural' || rawKind === 'behavioral' || rawKind === 'culture') {
        kind = 'behavioural';
      } else if (rawKind === 'domain' || rawKind === 'industry' || rawKind === 'business') {
        kind = 'domain';
      }

      return {
        id: `r${idx + 1}`,
        text: req?.text || 'Core qualification',
        kind,
        priority,
      };
    }),
  };
}

/**
 * Stage 4: Generates concise, honest company brief based on crawled pages.
 * Limit: 450 tokens (strictly <= 650 tokens)
 * Per Requirement 6 & Correction 7: Do NOT silently fabricate generic company info.
 */
export async function generateCompanyBrief(
  companyName: string,
  companyUrl: string,
  crawledPages: { url: string; content: string }[],
  publicInterviewNotes: string
): Promise<CompanyBrief> {
  const sources = crawledPages.map(p => p.url).filter(Boolean);
  if (sources.length === 0 && companyUrl) {
    sources.push(companyUrl);
  }

  const hasCrawlData = crawledPages.some(p => p.content && p.content.trim().length > 20);

  const systemPrompt = `You are a corporate intelligence analyst creating an interview prep company brief.
Return a valid JSON object matching:
{
  "summary": string, // 2-3 concise sentences on what candidate must know
  "what_they_do": string, // 1-2 sentences on core product/domain
  "sources": string[]
}
RULES:
1. Base your brief strictly on the crawled text. NEVER invent company missions or products.
2. If little or no content was discoverable, state honestly: "Company overview was not discoverable from the provided website."`;

  const context = crawledPages
    .map(p => `Page (${p.url}):\n${p.content.slice(0, 1000)}`)
    .join('\n\n');

  const userPrompt = `Company: ${companyName || 'Target Company'}
Website: ${companyUrl}
Interview Insights: ${publicInterviewNotes || 'None'}

Crawled Content:
"""
${context || 'No content discoverable.'}
"""`;

  let raw = '';
  try {
    raw = await callGroqWithScheduler({
      stage: 'generating_brief',
      systemPrompt,
      userPrompt,
      maxTokens: 450, // ceiling 650
      temperature: 0.2,
      allowFallback: false, // NO silent fake company fallback!
    });
  } catch (err) {
    console.warn('[CompanyBrief] AI generation failed or unreachable. Generating honest crawl-based brief without fabrication.');
    return {
      summary: hasCrawlData
        ? `Information retrieved from ${companyUrl}. Review provided research sources for internal details.`
        : `Company overview was not discoverable from ${companyUrl || 'the provided website'}.`,
      what_they_do: hasCrawlData
        ? `Operates online at ${companyUrl}.`
        : 'Information not discoverable from provided link.',
      sources,
    };
  }

  const parsed = cleanJsonParse<CompanyBrief>(raw, {
    summary: hasCrawlData
      ? `Information retrieved from ${companyUrl}.`
      : `Company overview was not discoverable from ${companyUrl || 'the provided website'}.`,
    what_they_do: hasCrawlData ? `Operates at ${companyUrl}.` : 'Not discoverable from website.',
    sources,
  });

  if (!parsed.sources || parsed.sources.length === 0) {
    parsed.sources = sources;
  }

  return parsed;
}

/**
 * Stage 5: Combined Question Generation across all categories.
 * Generates 2 questions for each category in a single unified request capped at 700 tokens (Requirement 3 & Correction 3).
 */
export async function generateAllCategorizedQuestions(
  requirements: Requirement[],
  role: RoleInfo,
  companyBrief: CompanyBrief,
  startIdIndex: number = 1
): Promise<Question[]> {
  const categories: QuestionCategory[] = ['technical', 'behavioural', 'system-design', 'company-fit'];

  const systemPrompt = `You are a principal engineer conducting an interview.
Generate 2 focused interview questions for EACH of these 4 categories:
1. "technical"
2. "behavioural"
3. "system-design"
4. "company-fit"

Return a valid JSON object matching:
{
  "questions": [
    {
      "id": string, // "q1", "q2", ...
      "requirement_ids": string[], // must reference valid IDs like "r1", "r2"
      "category": "technical" | "behavioural" | "system-design" | "company-fit",
      "prompt": string,
      "answer_outline": string, // 1-2 bullet points
      "difficulty": 1 | 2 | 3
    }
  ]
}
RULES:
1. Generate exactly 2 questions per category (total 8 questions).
2. Reference existing requirement IDs. Keep outlines crisp.`;

  const userPrompt = `Role: ${role.title} (${role.seniority})
Company Overview: ${companyBrief.summary || 'Technology company'}
Target Requirements:
${JSON.stringify(requirements.map(r => ({ id: r.id, text: r.text, kind: r.kind })), null, 2)}
Start question ID sequence from: q${startIdIndex}`;

  const raw = await callGroqWithScheduler({
    stage: 'generating_questions',
    systemPrompt,
    userPrompt,
    maxTokens: 700, // strictly <= 800 ceiling, fits in single 850 OTPM window!
    temperature: 0.3,
    allowFallback: true,
  });

  const parsed = cleanJsonParse<{ questions: Question[] }>(raw, { questions: [] });
  const validReqIds = new Set(requirements.map(r => r.id));
  const fallbackReqId = requirements[0]?.id || 'r1';

  let currentId = startIdIndex;
  const questions: Question[] = (parsed.questions || []).map((q) => {
    const validCat: QuestionCategory = categories.includes(q.category) ? q.category : 'technical';
    const targetReqs = Array.isArray(q.requirement_ids) && q.requirement_ids.length > 0
      ? q.requirement_ids.filter(id => validReqIds.has(id))
      : [fallbackReqId];

    return {
      id: `q${currentId++}`,
      requirement_ids: targetReqs.length > 0 ? targetReqs : [fallbackReqId],
      category: validCat,
      prompt: q.prompt || `Discuss your experience relevant to ${role.title}.`,
      answer_outline: Array.isArray(q.answer_outline)
        ? q.answer_outline.join(' ')
        : (typeof q.answer_outline === 'string' ? q.answer_outline : 'Structured response covering relevant practical experience.'),
      difficulty: ([1, 2, 3].includes(q.difficulty) ? q.difficulty : 2) as 1 | 2 | 3,
    };
  });

  // Ensure every category has at least 1 question
  for (const cat of categories) {
    if (!questions.some(q => q.category === cat)) {
      questions.push({
        id: `q${currentId++}`,
        requirement_ids: [fallbackReqId],
        category: cat,
        prompt: `Explain how your experience aligns with ${cat.replace('-', ' ')} expectations for a ${role.title}.`,
        answer_outline: 'Demonstrate domain competence, problem-solving, and communication.',
        difficulty: 2,
      });
    }
  }

  return questions;
}

/**
 * Generates questions for a single category (used for category regeneration).
 * Limit: 400 tokens (strictly <= 800 tokens)
 */
export async function generateQuestionsForCategory(
  category: QuestionCategory,
  requirements: Requirement[],
  role: RoleInfo,
  companyBrief: CompanyBrief,
  startIdIndex: number
): Promise<Question[]> {
  const systemPrompt = `You are a principal engineer conducting an interview.
Generate 2 realistic, high-quality interview questions for category "${category}".
Return JSON:
{
  "questions": [
    {
      "id": string,
      "requirement_ids": string[],
      "category": "${category}",
      "prompt": string,
      "answer_outline": string,
      "difficulty": 1 | 2 | 3
    }
  ]
}`;

  const userPrompt = `Role: ${role.title} (${role.seniority})
Company: ${companyBrief.summary}
Requirements: ${JSON.stringify(requirements.map(r => ({ id: r.id, text: r.text })), null, 2)}
Start question ID from: q${startIdIndex}`;

  const raw = await callGroqWithScheduler({
    stage: `regenerate_${category}`,
    systemPrompt,
    userPrompt,
    maxTokens: 400, // ceiling 800
    temperature: 0.3,
    allowFallback: true,
  });

  const parsed = cleanJsonParse<{ questions: Question[] }>(raw, { questions: [] });
  const validReqIds = new Set(requirements.map(r => r.id));
  const fallbackReqId = requirements[0]?.id || 'r1';

  return (parsed.questions || []).map((q, idx) => ({
    id: `q${startIdIndex + idx}`,
    requirement_ids: Array.isArray(q.requirement_ids) && q.requirement_ids.length > 0
      ? q.requirement_ids.filter(id => validReqIds.has(id))
      : [fallbackReqId],
    category,
    prompt: q.prompt || `Explain your experience with ${role.title} requirements.`,
    answer_outline: Array.isArray(q.answer_outline)
      ? q.answer_outline.join(' ')
      : (typeof q.answer_outline === 'string' ? q.answer_outline : 'Structured technical explanation.'),
    difficulty: ([1, 2, 3].includes(q.difficulty) ? q.difficulty : 2) as 1 | 2 | 3,
  }));
}

/**
 * Stage 7: Pass 2 - Generates questions strictly targeting uncovered must-have requirements.
 * Limit: 400 tokens (strictly <= 600 tokens)
 */
export async function generateGapQuestions(
  uncoveredMustReqs: Requirement[],
  role: RoleInfo,
  startIdIndex: number
): Promise<Question[]> {
  if (uncoveredMustReqs.length === 0) return [];

  const systemPrompt = `You are a technical hiring manager performing gap closure.
Generate targeted interview questions covering these uncovered MUST-HAVE requirements:
Return JSON:
{
  "questions": [
    {
      "id": string,
      "requirement_ids": string[],
      "category": "technical" | "behavioural" | "system-design" | "company-fit",
      "prompt": string,
      "answer_outline": string,
      "difficulty": 1 | 2 | 3
    }
  ]
}
RULES:
1. Target the listed uncovered requirement IDs.
2. Keep questions concise and outlines crisp.`;

  const userPrompt = `Role: ${role.title}
Uncovered Must-Haves:
${JSON.stringify(uncoveredMustReqs, null, 2)}
Start question ID from: q${startIdIndex}`;

  const raw = await callGroqWithScheduler({
    stage: 'closing_coverage_gaps',
    systemPrompt,
    userPrompt,
    maxTokens: 400, // ceiling 600
    temperature: 0.2,
    allowFallback: true,
  });

  const parsed = cleanJsonParse<{ questions: Question[] }>(raw, { questions: [] });

  return (parsed.questions || []).map((q, idx) => ({
    id: `q${startIdIndex + idx}`,
    requirement_ids: Array.isArray(q.requirement_ids) && q.requirement_ids.length > 0
      ? q.requirement_ids
      : [uncoveredMustReqs[0]?.id || 'r1'],
    category: (['technical', 'behavioural', 'system-design', 'company-fit'].includes(q.category) ? q.category : 'technical') as QuestionCategory,
    prompt: q.prompt || `Explain your approach to ${role.title} requirements.`,
    answer_outline: Array.isArray(q.answer_outline)
      ? q.answer_outline.join(' ')
      : (typeof q.answer_outline === 'string' ? q.answer_outline : 'Targeted technical explanation.'),
    difficulty: ([1, 2, 3].includes(q.difficulty) ? q.difficulty : 2) as 1 | 2 | 3,
  }));
}

/**
 * Stage 8: Generates concise flashcards for key technical and domain concepts.
 * Limit: 450 tokens (strictly <= 800 tokens)
 */
export async function generateFlashcards(
  requirements: Requirement[],
  role: RoleInfo,
  companyBrief: CompanyBrief,
  startIdIndex: number = 1
): Promise<Flashcard[]> {
  const systemPrompt = `You are an interview preparation coach.
Generate 5 crisp flashcards for quick revision.
Return JSON:
{
  "flashcards": [
    {
      "id": string, // "f1", "f2", ...
      "front": string, // Concise question or concept
      "back": string, // Direct explanation (1-2 sentences)
      "requirement_ids": string[]
    }
  ]
}
RULES: Crisp, high-yield definitions. Reference valid requirement IDs.`;

  const userPrompt = `Role: ${role.title} (${role.seniority})
Requirements: ${JSON.stringify(requirements.map(r => ({ id: r.id, text: r.text })), null, 2)}
Start flashcard ID sequence from: f${startIdIndex}`;

  const raw = await callGroqWithScheduler({
    stage: 'generating_flashcards',
    systemPrompt,
    userPrompt,
    maxTokens: 450, // ceiling 800
    temperature: 0.3,
    allowFallback: true,
  });

  const parsed = cleanJsonParse<{ flashcards: Flashcard[] }>(raw, { flashcards: [] });
  const validReqIds = new Set(requirements.map(r => r.id));
  const fallbackReqId = requirements[0]?.id || 'r1';

  const cards = (parsed.flashcards || []).map((f, idx) => ({
    id: `f${startIdIndex + idx}`,
    front: f.front || 'Core concept',
    back: f.back || 'Definition and application.',
    requirement_ids: Array.isArray(f.requirement_ids) && f.requirement_ids.length > 0
      ? f.requirement_ids.filter(id => validReqIds.has(id))
      : [fallbackReqId],
  }));

  return cards.length > 0 ? cards : [
    { id: `f${startIdIndex}`, front: `Core responsibilities of ${role.title}`, back: 'Key systems architecture and best practices.', requirement_ids: [fallbackReqId] },
    { id: `f${startIdIndex + 1}`, front: 'Handling production incidents and debugging', back: 'Root cause analysis, monitoring, and runbooks.', requirement_ids: [fallbackReqId] },
  ];
}

/**
 * Fallback generator when GROQ_API_KEY is not configured or in unit tests.
 * Note: Never fabricates company-specific missions (Requirement 6).
 */
function generateFallbackResponse(systemPrompt: string, userPrompt: string): string {
  if (/extract structured role/i.test(systemPrompt)) {
    const titleMatch = userPrompt.match(/Title:\s*(.+)|Role:\s*(.+)|Senior\s+\w+|Backend\s+\w+|Frontend\s+\w+|Full[- ]?Stack\s+\w+|DevOps\s+\w+/i);
    const title = titleMatch ? titleMatch[0] : 'Software Engineer';
    return JSON.stringify({
      title,
      seniority: /senior/i.test(userPrompt) ? 'Senior' : /junior/i.test(userPrompt) ? 'Junior' : 'Mid-Level',
      responsibilities: [
        'Develop and maintain software solutions',
        'Collaborate with cross-functional teams',
        'Write clean, well-tested code',
      ],
      requirements: [
        { id: 'r1', text: 'Core software engineering and architecture experience', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'API design, database modeling, and backend systems', kind: 'technical', priority: 'must' },
        { id: 'r3', text: 'Technical communication and team collaboration', kind: 'behavioural', priority: 'must' },
        { id: 'r4', text: 'Cloud infrastructure and deployment', kind: 'domain', priority: 'nice' },
      ],
    });
  }

  if (/company brief/i.test(systemPrompt)) {
    return JSON.stringify({
      summary: 'Company information was not discoverable from the provided website.',
      what_they_do: 'Software and digital operations.',
      sources: ['https://example.com'],
    });
  }

  if (/categor/i.test(systemPrompt) || /interview questions/i.test(systemPrompt)) {
    return JSON.stringify({
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'How do you structure code for modularity, testability, and long-term maintenance?',
          answer_outline: 'Explain separation of concerns, dependency injection, and comprehensive testing.',
          difficulty: 2,
        },
        {
          id: 'q2',
          requirement_ids: ['r2'],
          category: 'technical',
          prompt: 'Describe your approach to designing resilient APIs and handling system failures.',
          answer_outline: 'Discuss idempotency, rate limiting, and structured logging.',
          difficulty: 3,
        },
        {
          id: 'q3',
          requirement_ids: ['r3'],
          category: 'behavioural',
          prompt: 'Describe a project where you had to collaborate closely with non-technical stakeholders.',
          answer_outline: 'STAR response highlighting clear translation of technical concepts.',
          difficulty: 1,
        },
        {
          id: 'q4',
          requirement_ids: ['r1'],
          category: 'system-design',
          prompt: 'How would you scale a service experiencing a 10x surge in write traffic?',
          answer_outline: 'Discuss queues, horizontal scaling, database sharding, and caching.',
          difficulty: 3,
        },
        {
          id: 'q5',
          requirement_ids: ['r3'],
          category: 'company-fit',
          prompt: 'How do you keep your technical skills sharp as tooling and frameworks evolve?',
          answer_outline: 'Continuous learning, reading documentation, and building prototypes.',
          difficulty: 1,
        },
      ],
    });
  }

  if (/gap-closure/i.test(systemPrompt)) {
    return JSON.stringify({
      questions: [
        {
          id: 'q99',
          requirement_ids: ['r2'],
          category: 'technical',
          prompt: 'Tell me about a time you optimized a slow query or database bottleneck.',
          answer_outline: 'Explain indexing, execution plans, and measuring latency improvements.',
          difficulty: 2,
        },
      ],
    });
  }

  if (/flashcard/i.test(systemPrompt)) {
    return JSON.stringify({
      flashcards: [
        {
          id: 'f1',
          front: 'What are ACID properties in database transactions?',
          back: 'Atomicity, Consistency, Isolation, and Durability ensure reliable transaction processing.',
          requirement_ids: ['r2'],
        },
        {
          id: 'f2',
          front: 'Explain the difference between horizontal and vertical scaling.',
          back: 'Horizontal adds more nodes; Vertical adds more resources (CPU/RAM) to an existing node.',
          requirement_ids: ['r1'],
        },
      ],
    });
  }

  return '{}';
}
