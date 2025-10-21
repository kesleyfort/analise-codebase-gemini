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
  OUTPUT_FILE: 'analysis-results.json'
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
 * Analyze codebase using Gemini API
 */
async function analyzeCodebase(files, promptTemplate, projectName) {
  console.log(`\nAnalyzing ${files.length} files...`);

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
    "analysis_date": "${new Date().toISOString().split('T')[0]}",
    "project_type": "E-commerce Automation"
  },
  "token_usage": {
    "prompt_tokens": 0,
    "completion_tokens": 0,
    "total_tokens": 0
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
    const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
    if (jsonMatch) {
      jsonText = jsonMatch[1];
    }

    // Parse and return JSON
    const analysisResult = JSON.parse(jsonText);
    
    // Extract token usage from response metadata
    const usageMetadata = response.usageMetadata || {};
    analysisResult.token_usage = {
      prompt_tokens: usageMetadata.promptTokenCount || 0,
      completion_tokens: usageMetadata.candidatesTokenCount || 0,
      total_tokens: usageMetadata.totalTokenCount || 0
    };
    
    return analysisResult;

  } catch (error) {
    console.error('Error calling Gemini API:', error.message);
    throw error;
  }
}

/**
 * Save analysis results to JSON file
 */
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
  }

  if (results.token_usage) {
    console.log('' + '-'.repeat(60));
    console.log('TOKEN USAGE:');
    console.log('-'.repeat(60));
    console.log(`Prompt Tokens:      ${results.token_usage.prompt_tokens.toLocaleString()}`);
    console.log(`Completion Tokens:  ${results.token_usage.completion_tokens.toLocaleString()}`);
    console.log(`Total Tokens:       ${results.token_usage.total_tokens.toLocaleString()}`);
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
 * Main execution function
 */
async function main() {
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

    // Analyze codebase
    const results = await analyzeCodebase(files, promptTemplate, projectName);

    // Save results
    const outputPath = path.join(process.cwd(), CONFIG.OUTPUT_FILE);
    await saveResults(results, outputPath);

    // Display summary
    displaySummary(results);

    console.log('\nAnalysis complete!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { scanDirectory, analyzeCodebase, readFileContent };
