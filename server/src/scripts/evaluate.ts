import fs from 'fs';
import path from 'path';
import minimist from 'minimist';
import { BatchCaseInput, BatchCaseOutput, BatchOutput, toAppendixAKit } from '@trao/shared';
import { runPipeline } from '../services/pipeline';
import { config } from '../config';

async function main() {
  const argv = minimist(process.argv.slice(2), {
    string: ['input', 'output'],
    alias: { i: 'input', o: 'output' },
  });

  const inputPath = argv.input;
  const outputPath = argv.output;

  if (!inputPath || !outputPath) {
    console.error('Usage: npm run evaluate -- --input <cases.json> --output <kits.json>');
    process.exit(1);
  }

  const baseDir = process.env.INIT_CWD || process.cwd();
  let resolvedInput = path.resolve(baseDir, inputPath);
  let resolvedOutput = path.resolve(baseDir, outputPath);

  if (!fs.existsSync(resolvedInput)) {
    console.error(`Error: Input file not found at "${resolvedInput}"`);
    process.exit(1);
  }

  let rawCases: any;
  try {
    const content = fs.readFileSync(resolvedInput, 'utf-8');
    rawCases = JSON.parse(content);
  } catch (err: any) {
    console.error(`Error: Failed to parse input JSON: ${err.message}`);
    process.exit(1);
  }

  if (!Array.isArray(rawCases)) {
    console.error('Error: Input cases file must contain an array of case objects.');
    process.exit(1);
  }

  console.log(`[Batch Evaluate] Loaded ${rawCases.length} case(s) from "${inputPath}"`);
  const results: BatchCaseOutput[] = [];

  for (let i = 0; i < rawCases.length; i++) {
    const c = rawCases[i] as BatchCaseInput;
    console.log(`\n[Batch Evaluate] [${i + 1}/${rawCases.length}] Processing case: "${c.id || `case-${i + 1}`}"`);

    const caseId = c.id || `case-${i + 1}`;
    const jd = c.jd || '';
    const companyUrl = c.company_url || '';
    const days = typeof c.days === 'number' ? c.days : 5;

    if (!jd.trim()) {
      console.warn(`[Batch Evaluate] Case "${caseId}" missing job description. Recording failure.`);
      results.push({
        id: caseId,
        status: 'failed',
        kit: null,
        error: {
          code: 'EMPTY_JOB_DESCRIPTION',
          message: 'Job description text was empty or missing.',
        },
      });
      continue;
    }

    try {
      // Execute the exact same pipeline used by the web application
      const internalKit = await runPipeline({
        jd,
        companyUrl,
        days,
        onProgress: (evt) => {
          console.log(`  -> [${evt.stage}] [${evt.status}] ${evt.message}`);
        },
      });

      // Strip internal tracking fields to produce exact Appendix A schema
      const cleanKit = toAppendixAKit(internalKit);

      results.push({
        id: caseId,
        status: 'ok',
        kit: cleanKit,
        error: null,
      });

      console.log(`[Batch Evaluate] Case "${caseId}" completed successfully.`);
    } catch (err: any) {
      console.error(`[Batch Evaluate] Case "${caseId}" failed:`, err.message);
      results.push({
        id: caseId,
        status: 'failed',
        kit: null,
        error: {
          code: err.code || 'PIPELINE_ERROR',
          message: err.message || 'Pipeline execution failed',
        },
      });
    }

    // Brief pause between cases to be respectful of free-tier rates
    if (i < rawCases.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const outputPayload: BatchOutput = {
    version: '1.0',
    generated_at: new Date().toISOString(),
    kits: results,
  };

  // Ensure parent directory exists
  const outDir = path.dirname(resolvedOutput);
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  fs.writeFileSync(resolvedOutput, JSON.stringify(outputPayload, null, 2), 'utf-8');
  console.log(`\n[Batch Evaluate] All ${results.length} cases processed.`);
  console.log(`[Batch Evaluate] Output written to: "${outputPath}"`);
}

main().catch(err => {
  console.error('[Batch Evaluate] Fatal error:', err);
  process.exit(1);
});
