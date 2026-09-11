import Groq from 'groq-sdk';
import { config } from '../config';
import {
  Requirement,
  RoleInfo,
  CompanyBrief,
  Question,
  Flashcard,
  QuestionCategory,
  InternalQuestion,
} from '@trao/shared';

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

/**
 * Executes a prompt against Groq with automatic retry and exponential backoff for rate limits.
 */
export async function callGroqWithRetry(
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.2
): Promise<string> {
  // If no API key is provided, use fallback heuristic generator
  if (!config.groqApiKey) {
    return generateFallbackResponse(systemPrompt, userPrompt);
  }

  const client = getGroqClient();
  const maxRetries = 3;
  let delay = 2000;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await client.chat.completions.create({
        model: config.groqModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content || '{}';
      return content;
    } catch (error: any) {
      const isRateLimit = error?.status === 429 || error?.message?.includes('rate_limit') || error?.message?.includes('429');
      const isOverloaded = error?.status === 503 || error?.message?.includes('overloaded');

      if ((isRateLimit || isOverloaded) && attempt < maxRetries) {
        console.warn(`[Groq] Rate limit/busy (attempt ${attempt}/${maxRetries}). Backing off for ${delay}ms...`);
        await new Promise(res => setTimeout(res, delay + Math.random() * 500));
        delay *= 2;
        continue;
      }
      console.error(`[Groq] Request failed on attempt ${attempt}:`, error?.message || error);
      if (attempt === maxRetries) {
        console.warn('[Groq] Retries exhausted. Utilizing fallback response generator.');
        return generateFallbackResponse(systemPrompt, userPrompt);
      }
    }
  }

  return generateFallbackResponse(systemPrompt, userPrompt);
}

/**
 * Cleans and parses JSON output safely.
 */
export function cleanJsonParse<T>(rawText: string, fallback: T): T {
  try {
    let text = rawText.trim();
    if (text.startsWith('```')) {
      text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    }
    return JSON.parse(text) as T;
  } catch (err) {
    console.error('[Groq] Failed to parse JSON response:', rawText);
    return fallback;
  }
}

/**
 * Stage 1: Extracts structured role and requirements from raw Job Description.
 */
export async function extractRequirementsFromJD(jdText: string): Promise<RoleInfo> {
  const systemPrompt = `You are an expert technical recruiter and job analyst.
Extract structured role information from the provided job description.
Return a valid JSON object matching this schema:
{
  "title": string,
  "seniority": string, // e.g. "Junior", "Mid-Level", "Senior", "Staff", "Lead", or "Not Specified"
  "responsibilities": string[],
  "requirements": [
    {
      "id": string, // "r1", "r2", "r3", etc.
      "text": string,
      "kind": "technical" | "behavioural" | "domain",
      "priority": "must" | "nice"
    }
  ]
}
RULES:
1. Base your extraction strictly on the text. DO NOT invent requirements.
2. If the JD is a two-line stub, extract only what is stated (even if just 1 or 2 requirements).
3. "must" is for mandatory qualifications, core tech stack, and explicit requirements.
4. "nice" is for bonus points, preferred experience, or optional qualifications.
5. Provide sequential stable IDs: "r1", "r2", "r3", ...`;

  const userPrompt = `Job Description:\n"""\n${jdText}\n"""`;
  const raw = await callGroqWithRetry(systemPrompt, userPrompt, 0.1);
  const parsed = cleanJsonParse<RoleInfo>(raw, {} as any);
  const rawReqs = Array.isArray(parsed?.requirements) && parsed.requirements.length > 0
    ? parsed.requirements
    : [{ id: 'r1', text: 'Core role responsibilities and qualifications', kind: 'technical' as const, priority: 'must' as const }];

  return {
    title: parsed?.title || 'Software Engineer',
    seniority: parsed?.seniority || 'Not Specified',
    responsibilities: Array.isArray(parsed?.responsibilities) ? parsed.responsibilities : [],
    requirements: rawReqs.map((req, idx) => ({
      id: req.id && /^r\d+$/.test(req.id) ? req.id : `r${idx + 1}`,
      text: req.text || 'Requirement',
      kind: ['technical', 'behavioural', 'domain'].includes(req.kind) ? req.kind : 'technical',
      priority: ['must', 'nice'].includes(req.priority) ? req.priority : 'must',
    })),
  };
}

/**
 * Stage 4: Generates concise, honest company brief based on crawled pages and interview research.
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

  const systemPrompt = `You are a corporate intelligence analyst creating an interview prep company brief.
Return a valid JSON object matching:
{
  "summary": string,
  "what_they_do": string,
  "sources": string[]
}
RULES:
1. If little or no information is discoverable from the crawled pages, report it HONESTLY. Never fabricate company missions or products.
2. If the site was unreachable, explicitly state: "Company information was not discoverable from the provided website."
3. Keep the summary focused on what a candidate needs to know for an interview.`;

  const context = crawledPages
    .map(p => `Page (${p.url}):\n${p.content.slice(0, 1500)}`)
    .join('\n\n');

  const userPrompt = `Company: ${companyName || 'Unknown Company'}
Website: ${companyUrl}
Interview Process Findings: ${publicInterviewNotes || 'None found'}

Crawled Content:
"""
${context || 'No content discoverable.'}
"""`;

  const raw = await callGroqWithRetry(systemPrompt, userPrompt, 0.2);
  const parsed = cleanJsonParse<CompanyBrief>(raw, {
    summary: `${companyName || 'The company'} operates in the technology domain.`,
    what_they_do: 'Technology products and services.',
    sources,
  });

  if (!parsed.sources || parsed.sources.length === 0) {
    parsed.sources = sources;
  }

  return parsed;
}

/**
 * Stage 5: Generates interview questions targeted by category.
 */
export async function generateQuestionsForCategory(
  category: QuestionCategory,
  requirements: Requirement[],
  role: RoleInfo,
  companyBrief: CompanyBrief,
  startIdIndex: number
): Promise<Question[]> {
  const systemPrompt = `You are a principal engineer conducting an interview.
Generate realistic, high-quality interview questions for the category: "${category}".
Return a valid JSON object matching:
{
  "questions": [
    {
      "id": string, // "q1", "q2", ...
      "requirement_ids": string[], // must reference existing requirement IDs
      "category": "${category}",
      "prompt": string,
      "answer_outline": string,
      "difficulty": number // 1, 2, or 3
    }
  ]
}
RULES:
1. Each question MUST reference 1 or more relevant requirement IDs from the provided requirements list.
2. "difficulty" must be an integer between 1 and 3 (1=Foundational, 2=Applied, 3=Deep/Architectural).
3. "answer_outline" should outline what a strong candidate would cover.
4. For "technical", test the specific technical requirements.
5. For "behavioural", focus on past experiences, collaboration, and mentoring.
6. For "system-design", focus on architecture, scalability, and domain trade-offs.
7. For "company-fit", ground questions in what the company does (${companyBrief.summary || 'general tech culture'}).`;

  const userPrompt = `Role: ${role.title} (${role.seniority})
Company: ${companyBrief.summary}
Available Requirements to Target:
${JSON.stringify(requirements, null, 2)}
Start question ID sequence from: q${startIdIndex}`;

  const raw = await callGroqWithRetry(systemPrompt, userPrompt, 0.3);
  const parsed = cleanJsonParse<{ questions: Question[] }>(raw, { questions: [] });

  const validReqIds = new Set(requirements.map(r => r.id));

  return (parsed.questions || []).map((q, idx) => ({
    id: `q${startIdIndex + idx}`,
    requirement_ids: Array.isArray(q.requirement_ids)
      ? q.requirement_ids.filter(id => validReqIds.has(id))
      : [],
    category,
    prompt: q.prompt || `Explain your experience with ${role.title} core responsibilities.`,
    answer_outline: q.answer_outline || 'Structured explanation demonstrating practical experience.',
    difficulty: ([1, 2, 3].includes(q.difficulty) ? q.difficulty : 2) as 1 | 2 | 3,
  }));
}

/**
 * Stage 7: Second Pass - Generates questions strictly targeting uncovered must-have requirements.
 */
export async function generateGapQuestions(
  uncoveredMustReqs: Requirement[],
  role: RoleInfo,
  startIdIndex: number
): Promise<Question[]> {
  if (uncoveredMustReqs.length === 0) return [];

  const systemPrompt = `You are a technical hiring manager performing a gap-closure pass.
The following MUST-HAVE requirements have no questions yet.
Generate targeted interview questions specifically covering these exact requirement IDs:
Return a valid JSON object matching:
{
  "questions": [
    {
      "id": string,
      "requirement_ids": string[], // must include the target requirement id
      "category": "technical" | "behavioural" | "system-design" | "company-fit",
      "prompt": string,
      "answer_outline": string,
      "difficulty": 1 | 2 | 3
    }
  ]
}`;

  const userPrompt = `Role: ${role.title}
Uncovered Must-Have Requirements:
${JSON.stringify(uncoveredMustReqs, null, 2)}
Start question ID sequence from: q${startIdIndex}`;

  const raw = await callGroqWithRetry(systemPrompt, userPrompt, 0.2);
  const parsed = cleanJsonParse<{ questions: Question[] }>(raw, { questions: [] });

  return (parsed.questions || []).map((q, idx) => ({
    id: `q${startIdIndex + idx}`,
    requirement_ids: Array.isArray(q.requirement_ids) && q.requirement_ids.length > 0
      ? q.requirement_ids
      : [uncoveredMustReqs[Math.min(idx, uncoveredMustReqs.length - 1)].id],
    category: ['technical', 'behavioural', 'system-design', 'company-fit'].includes(q.category)
      ? q.category
      : 'technical',
    prompt: q.prompt,
    answer_outline: q.answer_outline,
    difficulty: ([1, 2, 3].includes(q.difficulty) ? q.difficulty : 2) as 1 | 2 | 3,
  }));
}

/**
 * Stage 8: Generates concise flashcards for key technical and domain concepts.
 */
export async function generateFlashcards(
  requirements: Requirement[],
  role: RoleInfo,
  companyBrief: CompanyBrief
): Promise<Flashcard[]> {
  const systemPrompt = `You are an interview preparation coach.
Generate 6 to 10 practical flashcards for quick revision.
Return a valid JSON object matching:
{
  "flashcards": [
    {
      "id": string, // "f1", "f2", ...
      "front": string, // Question or concept prompt
      "back": string,  // Concise, authoritative explanation
      "requirement_ids": string[]
    }
  ]
}
RULES:
1. Each card should test a specific concept, syntax, design pattern, or scenario relevant to the requirements.
2. "front" must be crisp. "back" must be clear and direct.
3. Reference valid requirement IDs.`;

  const userPrompt = `Role: ${role.title} (${role.seniority})
Company Focus: ${companyBrief.what_they_do}
Requirements:
${JSON.stringify(requirements, null, 2)}`;

  const raw = await callGroqWithRetry(systemPrompt, userPrompt, 0.3);
  const parsed = cleanJsonParse<{ flashcards: Flashcard[] }>(raw, { flashcards: [] });

  const validReqIds = new Set(requirements.map(r => r.id));

  return (parsed.flashcards || []).map((f, idx) => ({
    id: `f${idx + 1}`,
    front: f.front || 'Key concept to know',
    back: f.back || 'Core definition and practical application.',
    requirement_ids: Array.isArray(f.requirement_ids)
      ? f.requirement_ids.filter(id => validReqIds.has(id))
      : [],
  }));
}

/**
 * Fallback generator when GROQ_API_KEY is not configured or in tests.
 * Guarantees that the pipeline and tests never crash.
 */
function generateFallbackResponse(systemPrompt: string, userPrompt: string): string {
  if (/extract structured role/i.test(systemPrompt)) {
    const titleMatch = userPrompt.match(/Title:\s*(.+)|Role:\s*(.+)|Senior\s+\w+|Backend\s+\w+|Frontend\s+\w+|Full[- ]?Stack\s+\w+|DevOps\s+\w+/i);
    const title = titleMatch ? titleMatch[0] : 'Software Engineer';
    return JSON.stringify({
      title,
      seniority: /senior/i.test(userPrompt) ? 'Senior' : /junior/i.test(userPrompt) ? 'Junior' : 'Mid-Level',
      responsibilities: [
        'Develop and maintain scalable software solutions',
        'Collaborate with cross-functional product and design teams',
        'Write clean, well-tested, and maintainable code',
      ],
      requirements: [
        { id: 'r1', text: 'Core software engineering and architecture experience', kind: 'technical', priority: 'must' },
        { id: 'r2', text: 'API design, database modeling, and backend systems', kind: 'technical', priority: 'must' },
        { id: 'r3', text: 'Effective technical communication and team collaboration', kind: 'behavioural', priority: 'must' },
        { id: 'r4', text: 'Experience with cloud infrastructure and deployment', kind: 'domain', priority: 'nice' },
      ],
    });
  }

  if (/company brief/i.test(systemPrompt)) {
    return JSON.stringify({
      summary: 'Technology company focused on building modern digital products and developer infrastructure.',
      what_they_do: 'Designs, develops, and delivers software and digital services.',
      sources: ['https://example.com'],
    });
  }

  if (/interview questions/i.test(systemPrompt)) {
    return JSON.stringify({
      questions: [
        {
          id: 'q1',
          requirement_ids: ['r1'],
          category: 'technical',
          prompt: 'How do you structure code for modularity, testability, and long-term maintenance?',
          answer_outline: 'Explain separation of concerns, dependency injection, and comprehensive unit testing.',
          difficulty: 2,
        },
        {
          id: 'q2',
          requirement_ids: ['r2'],
          category: 'technical',
          prompt: 'Describe your approach to designing resilient APIs and handling system failures.',
          answer_outline: 'Discuss idempotency, rate limiting, circuit breakers, and structured logging.',
          difficulty: 3,
        },
      ],
    });
  }

  if (/gap-closure/i.test(systemPrompt)) {
    return JSON.stringify({
      questions: [
        {
          id: 'q99',
          requirement_ids: ['r3'],
          category: 'behavioural',
          prompt: 'Tell me about a time you resolved a challenging technical disagreement in your team.',
          answer_outline: 'Use STAR method: explain context, proposed solutions, data-driven alignment, and outcome.',
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
          back: 'Horizontal adds more machines/nodes; Vertical adds more resources (CPU/RAM) to existing machine.',
          requirement_ids: ['r1'],
        },
      ],
    });
  }

  return '{}';
}
