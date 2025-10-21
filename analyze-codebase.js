#!/usr/bin/env node

/**
 * Code Analysis Script using Google Gemini API
 * Analyzes Java codebase for e-commerce automation projects
 * Outputs JSON with grades for 5 main categories
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const CONFIG = {
  MODEL: 'gemini-2.5-flash',
  MAX_TOKENS: 100000,
  MAX_FILE_SIZE: 100000, // characters
  SUPPORTED_EXTENSIONS: ['.java'],
  OUTPUT_FILE: 'analysis-results.json',
  BATCH_SIZE: 15, // Number of files per batch
  MAX_INPUT_TOKENS: 800000, // Conservative limit for input tokens
  RETRY_ATTEMPTS: 3, // Number of retry attempts for failed batches
  RETRY_DELAY_MS: 1000, // Initial retry delay in milliseconds
  RETRY_BACKOFF: 2, // Exponential backoff multiplier
  PARALLEL_BATCHES: 3 // Number of batches to process in parallel
};

// Initialize Gemini client
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: CONFIG.MODEL,
  generationConfig: {
    temperature: 0.3,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: CONFIG.MAX_TOKENS,
  }
});

/**
 * Recursively scan directory for Java files
 */
async function scanDirectory(dir, fileList = []) {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
      // Skip common non-source directories
      if (!['node_modules', '.git', 'target', 'build', 'dist'].includes(file)) {
        await scanDirectory(filePath, fileList);
      }
    } else {
      const ext = path.extname(file);
      if (CONFIG.SUPPORTED_EXTENSIONS.includes(ext)) {
        fileList.push(filePath);
      }
    }
  }

  return fileList;
}

/**
 * Read file content with size limit
 */
async function readFileContent(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    if (content.length > CONFIG.MAX_FILE_SIZE) {
      return content.substring(0, CONFIG.MAX_FILE_SIZE) + '\n\n... [File truncated due to size]';
    }
    return content;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Load the analysis prompt template
 */
async function loadPromptTemplate() {
  const promptPath = path.join(__dirname, '..', 'Prompt-Analise-Codigo-Ecommerce.md');
  try {
    return await fs.readFile(promptPath, 'utf-8');
  } catch (error) {
    console.error('Error loading prompt template:', error.message);
    throw new Error('Failed to load analysis prompt template');
  }
}

/**
 * Estimate token count from text (rough approximation)
 */
function estimateTokens(text) {
  // Rough estimation: ~4 characters per token
  return Math.ceil(text.length / 4);
}

/**
 * Create batches of files with token awareness
 */
function createBatches(fileContents, batchSize) {
  const batches = [];
  let currentBatch = [];
  let currentTokenEstimate = 0;

  for (const file of fileContents) {
    const fileTokens = estimateTokens(file.content);
    
    // If adding this file would exceed limits or batch size, start new batch
    if (currentBatch.length >= batchSize || 
        (currentTokenEstimate + fileTokens > CONFIG.MAX_INPUT_TOKENS && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokenEstimate = 0;
    }
    
    currentBatch.push(file);
    currentTokenEstimate += fileTokens;
  }
  
  // Add remaining files
  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }
  
  return batches;
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Attempt to repair common JSON errors
 */
function attemptJsonRepair(jsonText) {
  let repaired = jsonText;
  
  // Remove trailing commas before closing braces/brackets
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
  
  // Fix common escape issues in strings
  repaired = repaired.replace(/([^\\])\\n/g, '$1\\\\n');
  repaired = repaired.replace(/([^\\])\\t/g, '$1\\\\t');
  
  // Remove any text before first { and after last }
  const firstBrace = repaired.indexOf('{');
  const lastBrace = repaired.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    repaired = repaired.substring(firstBrace, lastBrace + 1);
  }
  
  return repaired;
}

/**
 * Analyze batch with exponential backoff retry logic
 */
async function analyzeBatchWithRetry(
  fileContents, 
  promptTemplate, 
  projectName, 
  batchNumber, 
  totalBatches, 
  analysisDate
) {
  let lastError;
  
  for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
    try {
      return await analyzeBatch(
        fileContents,
        promptTemplate,
        projectName,
        batchNumber,
        totalBatches,
        analysisDate
      );
    } catch (error) {
      lastError = error;
      
      if (attempt < CONFIG.RETRY_ATTEMPTS) {
        const delay = CONFIG.RETRY_DELAY_MS * Math.pow(CONFIG.RETRY_BACKOFF, attempt - 1);
        console.warn(`   ⚠️  Retry ${attempt}/${CONFIG.RETRY_ATTEMPTS - 1} after ${delay}ms...`);
        await sleep(delay);
      } else {
        console.error(`   ✗ All ${CONFIG.RETRY_ATTEMPTS} attempts failed`);
      }
    }
  }
  
  throw lastError;
}

/**
 * Process multiple batches in parallel with controlled concurrency
 * Returns both successful results and any errors that occurred
 */
async function processBatchesInParallel(
  batches,
  promptTemplate,
  projectName,
  analysisDate,
  concurrency
) {
  const results = [];
  const errors = [];
  
  // Process batches in waves/chunks
  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, Math.min(i + concurrency, batches.length));
    const chunkStart = i + 1;
    const chunkEnd = Math.min(i + concurrency, batches.length);
    
    console.log(`\nProcessing batches ${chunkStart}-${chunkEnd} in parallel...`);
    
    // Create promises for each batch in this chunk
    const chunkPromises = chunk.map((batch, chunkIndex) => {
      const batchNumber = i + chunkIndex + 1;
      return analyzeBatchWithRetry(
        batch,
        promptTemplate,
        projectName,
        batchNumber,
        batches.length,
        analysisDate
      )
        .then(result => ({ success: true, batchNumber, result }))
        .catch(error => ({ success: false, batchNumber, error, batch }));
    });
    
    // Wait for all batches in this chunk to complete
    const chunkResults = await Promise.allSettled(chunkPromises);
    
    // Process results from this chunk
    chunkResults.forEach((settledResult, chunkIndex) => {
      const batchNumber = i + chunkIndex + 1;
      
      if (settledResult.status === 'fulfilled') {
        const result = settledResult.value;
        
        if (result.success) {
          results.push(result.result);
          console.log(`   ✓ Batch ${batchNumber}/${batches.length} complete`);
        } else {
          errors.push({
            batchNumber: result.batchNumber,
            error: result.error,
            files: result.batch.map(f => f.name)
          });
          console.error(`   ✗ Batch ${result.batchNumber}/${batches.length} failed: ${result.error.message}`);
          console.error(`      Files: ${result.batch.map(f => f.name).join(', ')}`);
        }
      } else {
        // This shouldn't happen with Promise.allSettled, but handle just in case
        errors.push({
          batchNumber,
          error: new Error('Unexpected promise rejection'),
          files: chunk[chunkIndex].map(f => f.name)
        });
        console.error(`   ✗ Batch ${batchNumber}/${batches.length} failed unexpectedly`);
      }
    });
  }
  
  return { results, errors };
}

/**
 * Extract project name from pom.xml or use folder name
 */
async function getProjectName(targetDir) {
  // Try to read pom.xml first
  const pomPath = path.join(targetDir, 'pom.xml');
  try {
    const pomContent = await fs.readFile(pomPath, 'utf-8');
    const artifactIdMatch = pomContent.match(/<artifactId>(.*?)<\/artifactId>/);
    if (artifactIdMatch && artifactIdMatch[1]) {
      return artifactIdMatch[1];
    }
  } catch (error) {
    // pom.xml not found or couldn't be read, will use folder name
  }

  // Fall back to folder name
  return path.basename(targetDir);
}

/**
 * Analyze a single batch of files using Gemini API
 */
async function analyzeBatch(fileContents, promptTemplate, projectName, batchNumber, totalBatches, analysisDate) {
  console.log(`
Analyzing batch ${batchNumber}/${totalBatches} (${fileContents.length} files)...`);

  // Build analysis prompt
  const analysisPrompt = `${promptTemplate}

---

## FORMATO DE SAÍDA OBRIGATÓRIO

Você DEVE retornar sua análise em formato JSON válido seguindo EXATAMENTE esta estrutura:

\`\`\`json
{
  "project_summary": {
    "project_name": "${projectName}",
    "total_files": 0,
    "total_classes": 0,
    "analysis_date": "${analysisDate}",
    "project_type": "E-commerce Automation"
  },
  "grades": {
    "architecture": {
      "score": 0,
      "weight": 25,
      "positive_points": ["ponto 1", "ponto 2"],
      "negative_points": ["problema 1", "problema 2"],
      "observations": "Observações específicas sobre arquitetura"
    },
    "code_quality": {
      "score": 0,
      "weight": 30,
      "positive_points": ["ponto 1", "ponto 2"],
      "negative_points": ["problema 1", "problema 2"],
      "observations": "Observações sobre qualidade de código"
    },
    "validations": {
      "score": 0,
      "weight": 25,
      "positive_points": ["ponto 1", "ponto 2"],
      "negative_points": ["problema 1", "problema 2"],
      "observations": "Observações sobre validações e robustez"
    },
    "error_handling": {
      "score": 0,
      "weight": 20,
      "positive_points": ["ponto 1", "ponto 2"],
      "negative_points": ["problema 1", "problema 2"],
      "observations": "Observações sobre tratamento de erros e logging"
    },
    "overall": {
      "weighted_score": 0,
      "final_grade": "A/B/C/D/F",
      "summary": "Resumo geral da análise"
    }
  },
  "common_problems": [
    {
      "title": "Nome do Problema",
      "description": "Descrição detalhada",
      "severity": "high/medium/low",
      "occurrences": 0,
      "affected_files": ["file1.java", "file2.java"]
    }
  ],
  "top_issues": [
    {
      "file": "FileName.java",
      "class_name": "ClassName",
      "method": "methodName()",
      "issue": "Descrição do problema específico",
      "suggestion": "Sugestão de melhoria"
    }
  ],
  "recommendations": [
    {
      "category": "Categoria da Melhoria",
      "priority": "high/medium/low",
      "description": "Descrição da recomendação",
      "impact": "Impacto esperado da melhoria"
    }
  ]
}
\`\`\`

## INSTRUÇÕES CRÍTICAS:
1. Retorne APENAS o JSON, sem texto adicional antes ou depois
2. Calcule as notas de 1 a 10 para cada categoria
3. Calcule a média ponderada final usando os pesos especificados
4. Identifique pelo menos 5-10 problemas comuns
5. Liste os 10 problemas mais críticos no top_issues
6. Forneça pelo menos 7 recomendações priorizadas
7. CRÍTICO - O JSON deve ser VÁLIDO e bem-formado:
   - Todas as strings devem usar aspas duplas
   - Não inclua vírgulas após o último elemento de arrays/objetos
   - Escape caracteres especiais em strings (\n, \t, \", \\)
   - Não adicione comentários no JSON
   - Retorne SOMENTE JSON válido, sem texto antes ou depois

---

## ARQUIVOS PARA ANÁLISE:

${fileContents.map((file, index) => `
### Arquivo ${index + 1}: ${file.name}
**Path:** ${file.path}

\`\`\`java
${file.content}
\`\`\`
`).join('\n')}

---

Analise todos os arquivos acima seguindo os critérios especificados e retorne o resultado em JSON conforme o formato obrigatório.`;

  console.log('Sending request to Gemini API...');

  try {
    const result = await model.generateContent(analysisPrompt);
    const response = await result.response;
    const responseText = response.text();

    console.log('\nReceived response from Gemini API');

    // Try to extract JSON from markdown code blocks or raw text
    let jsonText = responseText;
    // Try multiple extraction patterns in order of preference
    const patterns = [
      // Pattern 1: JSON in markdown code blocks
      /```(?:json)?\s*(\{[\s\S]*?\})\s*```/,
      // Pattern 2: Plain JSON (first { to last })
      /(\{[\s\S]*\})/,
      // Pattern 3: JSON after specific marker
      /JSON[:\s]+(\{[\s\S]*\})/i
    ];

    for (const pattern of patterns) {
      const match = responseText.match(pattern);
      if (match && match[1]) {
        jsonText = match[1];
        break;
      }
    }

    // Multi-stage JSON parsing with repair fallback
    let analysisResult;

    try {
      // Try parsing original JSON first
      analysisResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn(`   ⚠️  Initial JSON parse failed: ${parseError.message}`);
      console.warn(`   🔧 Attempting JSON repair...`);
      
      try {
        // Attempt to repair and parse again
        const repairedJson = attemptJsonRepair(jsonText);
        analysisResult = JSON.parse(repairedJson);
        console.log(`   ✓ JSON successfully repaired and parsed`);
      } catch (repairError) {
        // Save raw response for debugging
        const debugFile = `debug-batch-${batchNumber}-${Date.now()}.txt`;
        await fs.writeFile(debugFile, responseText, 'utf-8');
        console.error(`   ✗ JSON repair failed. Raw response saved to: ${debugFile}`);
        console.error(`   Original error: ${parseError.message}`);
        
        throw new Error(`Failed to parse JSON response: ${parseError.message}. See ${debugFile} for raw response.`);
      }
    }

    // Validate required structure
    if (!analysisResult.project_summary || !analysisResult.grades) {
      throw new Error('Parsed JSON missing required fields (project_summary or grades)');
    }
    
    // Extract token usage from response metadata
    const usageMetadata = response.usageMetadata || {};
    analysisResult.token_usage = {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0
    };
    
    // Add actual batch size for accurate weighted averaging in aggregation
    // This is the REAL number of files analyzed, not Gemini's guessed total_files
    analysisResult._actual_batch_size = fileContents.length;
    
    return analysisResult;

  } catch (error) {
    console.error('Error calling Gemini API:', error.message);
    throw error;
  }
}

/**
 * Analyze entire codebase in batches
 */
async function analyzeCodebaseInBatches(files, promptTemplate, projectName) {
  console.log(`
Preparing to analyze ${files.length} files...`);
  
  // Calculate analysis date once for consistency across all batches
  const analysisDate = new Date().toISOString().split('T')[0];

  // Prepare file contents
  const fileContents = [];
  for (const filePath of files) {
    const content = await readFileContent(filePath);
    if (content) {
      fileContents.push({
        path: filePath,
        name: path.basename(filePath),
        content: content
      });
    }
  }

  // Create batches
  const batches = createBatches(fileContents, CONFIG.BATCH_SIZE);
  console.log(`Split into ${batches.length} batch(es) for analysis`);

  // Analyze batches in parallel with controlled concurrency
  console.log(`\nUsing parallel processing (${CONFIG.PARALLEL_BATCHES} batches at a time)...`);

  const { results: batchResults, errors: batchErrors } = await processBatchesInParallel(
    batches,
    promptTemplate,
    projectName,
    analysisDate,
    CONFIG.PARALLEL_BATCHES
  );

  // Accumulate token usage from all successful batches
  let totalTokens = {
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0
  };

  batchResults.forEach(batchResult => {
    if (batchResult.token_usage) {
      totalTokens.prompt_tokens += batchResult.token_usage.prompt_tokens;
      totalTokens.completion_tokens += batchResult.token_usage.completion_tokens;
      totalTokens.total_tokens += batchResult.token_usage.total_tokens;
    }
  });

  // Report errors if any occurred
  if (batchErrors.length > 0) {
    console.error(`\n⚠️  ${batchErrors.length} batch(es) failed after ${CONFIG.RETRY_ATTEMPTS} retries`);
    batchErrors.forEach(error => {
      console.error(`   Batch ${error.batchNumber}: ${error.error.message}`);
    });
  }

  if (batchResults.length === 0) {
    throw new Error('All batches failed to analyze');
  }

  // Aggregate results from all batches into a single unified report
  // This combines scores (weighted by actual batch sizes), deduplicates problems,
  // and merges recommendations across all batches
  console.log('Aggregating results from all batches...');
  const aggregatedResults = aggregateResults(batchResults, fileContents.length, batches.length);
  aggregatedResults.token_usage = totalTokens;

  // Calculate estimated cost
  const costs = calculateCost(totalTokens, CONFIG.MODEL);
  aggregatedResults.estimated_cost = {
    model: costs.model,
    input_cost_usd: costs.input_cost_usd,
    output_cost_usd: costs.output_cost_usd,
    total_cost_usd: costs.total_cost_usd,
    currency: 'USD'
  };

  return aggregatedResults;
}

/**
 * Save analysis results to JSON file
 */

/**
 * Find a valid batch result to use as base structure
 */
function getValidBaseBatch(batchResults) {
  for (const batch of batchResults) {
    // Check if batch has required structure
    if (batch &&
        batch.project_summary &&
        batch.grades &&
        batch.grades.architecture &&
        batch.grades.code_quality &&
        batch.grades.validations &&
        batch.grades.error_handling &&
        batch.grades.overall) {
      return batch;
    }
  }
  
  throw new Error('No valid batch results found - all batches have incomplete data structure');
}

/**
 * Aggregate results from multiple batch analyses
 */
function aggregateResults(batchResults, totalFiles, totalBatches) {
  // Use the first VALID batch as base structure
  const baseBatch = getValidBaseBatch(batchResults);
  const aggregated = JSON.parse(JSON.stringify(baseBatch));
  
  // Update project summary
  aggregated.project_summary.total_files = totalFiles;
  aggregated.project_summary.batches_processed = totalBatches;
  
  // Calculate total classes from all batches
  let totalClasses = 0;
  batchResults.forEach(batch => {
    totalClasses += batch.project_summary?.total_classes || 0;
  });
  aggregated.project_summary.total_classes = totalClasses;
  
  // Aggregate grades (weighted average by ACTUAL number of files in each batch)
  const categories = ['architecture', 'code_quality', 'validations', 'error_handling'];
  categories.forEach(category => {
    let weightedSum = 0;
    let totalWeight = 0;
    
    batchResults.forEach(batch => {
      // Use actual batch size, not Gemini's guessed total_files
      const filesInBatch = batch._actual_batch_size || 1;
      const score = batch.grades?.[category]?.score || 0;
      weightedSum += score * filesInBatch;
      totalWeight += filesInBatch;
    });
    
    aggregated.grades[category].score = totalWeight > 0 ? 
      Math.round((weightedSum / totalWeight) * 10) / 10 : 0;
    
    // Combine positive and negative points (deduplicate)
    const allPositive = new Set();
    const allNegative = new Set();
    batchResults.forEach(batch => {
      batch.grades?.[category]?.positive_points?.forEach(p => allPositive.add(p));
      batch.grades?.[category]?.negative_points?.forEach(p => allNegative.add(p));
    });
    aggregated.grades[category].positive_points = Array.from(allPositive);
    aggregated.grades[category].negative_points = Array.from(allNegative);
    
    // Combine observations
    const observations = batchResults
      .map(b => b.grades?.[category]?.observations)
      .filter(o => o)
      .join(' ');
    aggregated.grades[category].observations = observations;
  });
  
  // Recalculate overall weighted score
  const overallScore = 
    (aggregated.grades.architecture.score * 0.25) +
    (aggregated.grades.code_quality.score * 0.30) +
    (aggregated.grades.validations.score * 0.25) +
    (aggregated.grades.error_handling.score * 0.20);
  
  aggregated.grades.overall.weighted_score = Math.round(overallScore * 10) / 10;
  
  // Determine final grade
  if (overallScore >= 9) aggregated.grades.overall.final_grade = 'A';
  else if (overallScore >= 7) aggregated.grades.overall.final_grade = 'B';
  else if (overallScore >= 5) aggregated.grades.overall.final_grade = 'C';
  else if (overallScore >= 3) aggregated.grades.overall.final_grade = 'D';
  else aggregated.grades.overall.final_grade = 'F';
  
  // Merge common problems (deduplicate by title, sum occurrences)
  const problemsMap = new Map();
  batchResults.forEach(batch => {
    batch.common_problems?.forEach(problem => {
      if (problemsMap.has(problem.title)) {
        const existing = problemsMap.get(problem.title);
        existing.occurrences += problem.occurrences || 1;
        existing.affected_files = [...new Set([...existing.affected_files, ...problem.affected_files])];
      } else {
        problemsMap.set(problem.title, { ...problem });
      }
    });
  });
  aggregated.common_problems = Array.from(problemsMap.values())
    .sort((a, b) => b.occurrences - a.occurrences);
  
  // Merge top issues (combine and sort by severity)
  const allTopIssues = [];
  batchResults.forEach(batch => {
    if (batch.top_issues) {
      allTopIssues.push(...batch.top_issues);
    }
  });
  aggregated.top_issues = allTopIssues.slice(0, 20); // Keep top 20
  
  // Merge recommendations (deduplicate by description)
  const recommendationsMap = new Map();
  batchResults.forEach(batch => {
    batch.recommendations?.forEach(rec => {
      if (!recommendationsMap.has(rec.description)) {
        recommendationsMap.set(rec.description, rec);
      }
    });
  });
  aggregated.recommendations = Array.from(recommendationsMap.values());
  
  // Remove internal implementation field before returning
  delete aggregated._actual_batch_size;
  
  return aggregated;
}

async function saveResults(results, outputPath) {
  try {
    const jsonContent = JSON.stringify(results, null, 2);
    await fs.writeFile(outputPath, jsonContent, 'utf-8');
    console.log(`\n✓ Analysis results saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error saving results:', error.message);
    throw error;
  }
}

/**
 * Display summary of analysis results
 */
function displaySummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS SUMMARY');
  console.log('='.repeat(60));

  if (results.project_summary) {
    console.log(`
Project Name: ${results.project_summary.project_name}`);
    console.log(`Project Type: ${results.project_summary.project_type}`);
    console.log(`Files Analyzed: ${results.project_summary.total_files}`);
    console.log(`Classes Found: ${results.project_summary.total_classes}`);
    console.log(`Analysis Date: ${results.project_summary.analysis_date}`);
    if (results.project_summary.batches_processed) {
      console.log(`Batches Processed: ${results.project_summary.batches_processed}`);
    }
  }

  if (results.token_usage) {
    console.log('' + '-'.repeat(60));
    console.log('TOKEN USAGE:');
    console.log('-'.repeat(60));
    console.log(`Prompt Tokens:      ${results.token_usage.prompt_tokens.toLocaleString('en-US')}`);
    console.log(`Completion Tokens:  ${results.token_usage.completion_tokens.toLocaleString('en-US')}`);
    console.log(`Total Tokens:       ${results.token_usage.total_tokens.toLocaleString('en-US')}`);
    
    // Display execution time
    if (results.execution_metadata) {
      console.log('');
      console.log('EXECUTION TIME:');
      console.log(`Duration:           ${results.execution_metadata.duration_formatted}`);
      console.log(`Total Seconds:      ${results.execution_metadata.duration_seconds}`);
    }
    
    // Display cost (use saved cost if available)
    const costs = results.estimated_cost || calculateCost(results.token_usage, CONFIG.MODEL);
    console.log('');
    console.log(`ESTIMATED COST (${costs.model}):`);
    console.log(`Input Cost:         $${costs.input_cost_usd.toFixed(4)}`);
    console.log(`Output Cost:        $${costs.output_cost_usd.toFixed(4)}`);
    console.log(`Total Cost:         $${costs.total_cost_usd.toFixed(4)}`);
  }

  if (results.grades) {
    console.log('\n' + '-'.repeat(60));
    console.log('GRADES:');
    console.log('-'.repeat(60));
    console.log(`Architecture (25%):      ${results.grades.architecture.score}/10`);
    console.log(`Code Quality (30%):      ${results.grades.code_quality.score}/10`);
    console.log(`Validations (25%):       ${results.grades.validations.score}/10`);
    console.log(`Error Handling (20%):    ${results.grades.error_handling.score}/10`);
    console.log('-'.repeat(60));
    console.log(`WEIGHTED AVERAGE:        ${results.grades.overall.weighted_score}/10`);
    console.log(`FINAL GRADE:             ${results.grades.overall.final_grade}`);
  }

  if (results.common_problems && results.common_problems.length > 0) {
    console.log('\n' + '-'.repeat(60));
    console.log(`COMMON PROBLEMS IDENTIFIED: ${results.common_problems.length}`);
    console.log('-'.repeat(60));
    results.common_problems.slice(0, 5).forEach((problem, index) => {
      console.log(`${index + 1}. ${problem.title} (${problem.severity})`);
    });
  }

  console.log('\n' + '='.repeat(60));
}

/**
 * Calculate cost based on Gemini API pricing
 */
function calculateCost(tokenUsage, modelName) {
  // Gemini API pricing (per 1M tokens in USD) - Updated from official pricing
  const PRICING = {
    'gemini-2.5-flash': {
      input: 0.30,   // $0.30 per 1M tokens for text/image/video
      output: 2.50   // $2.50 per 1M tokens (including thinking tokens)
    },
    'gemini-2.5-pro': {
      input_under_200k: 1.25,   // $1.25 per 1M tokens (prompts <= 200k)
      input_over_200k: 2.50,    // $2.50 per 1M tokens (prompts > 200k)
      output_under_200k: 10.00, // $10.00 per 1M tokens
      output_over_200k: 15.00   // $15.00 per 1M tokens
    }
  };

  const pricing = PRICING[modelName] || PRICING['gemini-2.5-flash'];
  
  let inputRate, outputRate;
  
  if (modelName === 'gemini-2.5-flash') {
    // Flash has flat pricing
    inputRate = pricing.input;
    outputRate = pricing.output;
  } else {
    // Pro has tiered pricing based on 200k threshold
    const promptThreshold = 200000;
    inputRate = tokenUsage.prompt_tokens > promptThreshold ? 
      pricing.input_over_200k : pricing.input_under_200k;
    outputRate = tokenUsage.completion_tokens > promptThreshold ?
      pricing.output_over_200k : pricing.output_under_200k;
  }
  
  // Calculate costs (tokens / 1,000,000 * price per 1M)
  const inputCost = (tokenUsage.prompt_tokens / 1000000) * inputRate;
  const outputCost = (tokenUsage.completion_tokens / 1000000) * outputRate;
  const totalCost = inputCost + outputCost;

  return {
    input_cost_usd: inputCost,
    output_cost_usd: outputCost,
    total_cost_usd: totalCost,
    model: modelName
  };
}

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  
  try {
    console.log('='.repeat(60));
    console.log('E-COMMERCE CODE ANALYSIS TOOL');
    console.log('='.repeat(60));

    // Check API key
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable not set');
    }

    // Get target directory from command line or use current directory
    const targetDir = process.argv[2] || process.cwd();
    console.log(`\nTarget directory: ${targetDir}`);

    // Verify directory exists
    try {
      await fs.access(targetDir);
    } catch {
      throw new Error(`Directory not found: ${targetDir}`);
    }

    // Get project name
    console.log('Extracting project name...');
    const projectName = await getProjectName(targetDir);
    console.log(`Project name: ${projectName}`);

    // Load analysis prompt template
    console.log('Loading analysis prompt template...');
    const promptTemplate = await loadPromptTemplate();

    // Scan for Java files
    console.log('Scanning for Java files...');
    const files = await scanDirectory(targetDir);

    if (files.length === 0) {
      throw new Error('No Java files found in the specified directory');
    }

    console.log(`Found ${files.length} Java file(s)`);

    // Analyze codebase in batches
    const results = await analyzeCodebaseInBatches(files, promptTemplate, projectName);

    // Calculate execution time
    const endTime = Date.now();
    const executionTimeMs = endTime - startTime;
    const executionTimeSec = executionTimeMs / 1000;
    const executionTimeMin = executionTimeSec / 60;

    // Format as human-readable
    const hours = Math.floor(executionTimeMin / 60);
    const minutes = Math.floor(executionTimeMin % 60);
    const seconds = Math.floor(executionTimeSec % 60);

    // Add execution metadata to results
    results.execution_metadata = {
      start_time: new Date(startTime).toISOString(),
      end_time: new Date(endTime).toISOString(),
      duration_seconds: Math.round(executionTimeSec * 100) / 100,
      duration_formatted: hours > 0 
        ? `${hours}h ${minutes}m ${seconds}s`
        : minutes > 0 
          ? `${minutes}m ${seconds}s`
          : `${seconds}s`
    };

    // Save results
    const outputPath = path.join(process.cwd(), CONFIG.OUTPUT_FILE);
    await saveResults(results, outputPath);

    // Display summary
    displaySummary(results);

    console.log('\nAnalysis complete!');

  } catch (error) {
    console.error('\n Error:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { scanDirectory, analyzeCodebaseInBatches, analyzeBatch, readFileContent, aggregateResults };
