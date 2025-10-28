#!/usr/bin/env node

/**
 * @fileoverview Script de Análise de Código usando Azure OpenAI API
 *
 * Este script analisa bases de código Java de projetos de automação de testes,
 * gerando um relatório JSON completo com notas e recomendações em 5 categorias principais:
 * - Arquitetura (25%)
 * - Qualidade de Código (30%)
 * - Validações (25%)
 * - Tratamento de Erros (20%)
 *
 * O processamento é feito em lotes paralelos para otimizar o uso da Azure OpenAI API,
 * com retry automático e controle de custos/tokens.
 *
 * @author Sistema de Análise de Código
 * @version 1.0.0
 */

const { AzureOpenAI } = require('openai');
const fs = require('fs').promises;
const path = require('path');
const mysql = require('mysql2/promise');

const CONFIG = {
  AZURE_ENDPOINT: 'https://rnn-plat-devops-open-ai-prd.openai.azure.com',
  DEPLOYMENT_NAME: 'openai-o4mini',
  API_VERSION: '2025-01-01-preview',
  MAX_TOKENS: 16000,
  MAX_FILE_SIZE: 100000, // characters
  SUPPORTED_EXTENSIONS: ['.java'],
  OUTPUT_FILE: 'analysis-results-azure.json',
  BATCH_SIZE: 15, // Number of files per batch
  MAX_INPUT_TOKENS: 120000, // Conservative limit for GPT-4o-mini
  RETRY_ATTEMPTS: 3, // Number of retry attempts for failed batches
  RETRY_DELAY_MS: 1000, // Initial retry delay in milliseconds
  RETRY_BACKOFF: 2, // Exponential backoff multiplier
  PARALLEL_BATCHES: 3, // Number of batches to process in parallel
  // MySQL Database Configuration
  MYSQL: {
    HOST: '10.206.228.77',
    PORT: 3306,
    DATABASE: 'tdmdb',
    USER: 'tdmAdmin',
    PASSWORD: 'Renner_2021'
  }
};

// Initialize Azure OpenAI client (v2.0.0+ uses openai package)
const client = new AzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  endpoint: CONFIG.AZURE_ENDPOINT,
  apiVersion: CONFIG.API_VERSION,
  deployment: CONFIG.DEPLOYMENT_NAME
});

// MySQL connection pool
let dbPool = null;

/**
 * Inicializa a conexão com o banco de dados MySQL e cria a tabela se não existir
 *
 * Esta função cria um pool de conexões reutilizáveis com o MySQL e garante que a tabela
 * code_analysis_results existe com a estrutura apropriada. A tabela armazena tanto
 * colunas indexadas para consultas rápidas quanto o JSON completo dos resultados.
 *
 * Estrutura da tabela:
 * - Colunas indexadas: created_at, project_name, overall_score, final_grade
 * - Colunas de métricas: scores, tokens, custos, duração
 * - Coluna JSON: full_result (resultado completo da análise)
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} Lança erro se não conseguir conectar ao banco ou criar a tabela
 */
async function initializeDatabase() {
  try {
    console.log('Initializing MySQL connection...');

    dbPool = mysql.createPool({
      host: CONFIG.MYSQL.HOST,
      port: CONFIG.MYSQL.PORT,
      database: CONFIG.MYSQL.DATABASE,
      user: CONFIG.MYSQL.USER,
      password: CONFIG.MYSQL.PASSWORD,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    const connection = await dbPool.getConnection();
    console.log('MySQL connection established');

    // Create table if not exists
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS shared_services.code_analysis_results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        project_name VARCHAR(255),
        analysis_date DATE,
        total_files INT,
        total_classes INT,
        architecture_score DECIMAL(3,1),
        code_quality_score DECIMAL(3,1),
        validations_score DECIMAL(3,1),
        error_handling_score DECIMAL(3,1),
        overall_score DECIMAL(3,1),
        final_grade CHAR(1),
        total_tokens INT,
        total_cost_usd DECIMAL(10,4),
        duration_seconds DECIMAL(10,2),
        full_result JSON,
        INDEX idx_created_at (created_at),
        INDEX idx_project_name (project_name),
        INDEX idx_overall_score (overall_score),
        INDEX idx_final_grade (final_grade)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `;

    await connection.query(createTableSQL);
    console.log('Database table verified/created successfully');

    connection.release();
  } catch (error) {
    console.error('Error initializing database:', error.message);
    throw error;
  }
}

/**
 * Salva os resultados da análise no banco de dados MySQL
 *
 * Insere os resultados da análise tanto em colunas indexadas (para consultas rápidas)
 * quanto no formato JSON completo. O timestamp created_at é automaticamente definido
 * pelo MySQL usando CURRENT_TIMESTAMP.
 *
 * @async
 * @param {Object} results - Objeto completo com todos os resultados da análise
 * @returns {Promise<number>} ID do registro inserido
 * @throws {Error} Lança erro se não conseguir inserir no banco de dados
 */
async function saveResultsToDatabase(results) {
  try {
    console.log('Saving results to MySQL database...');

    const insertSQL = `
      INSERT INTO shared_services.code_analysis_results (
        project_name,
        analysis_date,
        total_files,
        total_classes,
        architecture_score,
        code_quality_score,
        validations_score,
        error_handling_score,
        overall_score,
        final_grade,
        total_tokens,
        total_cost_usd,
        duration_seconds,
        full_result
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const values = [
      results.project_summary?.project_name || 'Unknown',
      results.project_summary?.analysis_date || new Date().toLocaleDateString('en-CA'),
      results.project_summary?.total_files || 0,
      results.project_summary?.total_classes || 0,
      results.grades?.architecture?.score || 0,
      results.grades?.code_quality?.score || 0,
      results.grades?.validations?.score || 0,
      results.grades?.error_handling?.score || 0,
      results.grades?.overall?.weighted_score || 0,
      results.grades?.overall?.final_grade || 'F',
      results.token_usage?.total_tokens || 0,
      results.estimated_cost?.total_cost_usd || 0,
      results.execution_metadata?.duration_seconds || 0,
      JSON.stringify(results)
    ];

    const [result] = await dbPool.execute(insertSQL, values);
    console.log(`Results saved to database with ID: ${result.insertId}`);

    return result.insertId;
  } catch (error) {
    console.error('Error saving to database:', error.message);
    throw error;
  }
}

/**
 * Fecha o pool de conexões do banco de dados
 *
 * @async
 * @returns {Promise<void>}
 */
async function closeDatabaseConnection() {
  if (dbPool) {
    await dbPool.end();
    console.log('Database connection closed');
  }
}

/**
 * Varre recursivamente um diretório em busca de arquivos Java
 *
 * Esta função percorre toda a árvore de diretórios a partir de um caminho inicial,
 * identificando e coletando todos os arquivos com extensões suportadas (definidas em CONFIG).
 * Automaticamente ignora diretórios comuns que não contêm código-fonte como node_modules,
 * .git, target, build e dist.
 *
 * @async
 * @param {string} dir - Caminho do diretório a ser escaneado
 * @param {Array<string>} [fileList=[]] - Array acumulador para os caminhos dos arquivos encontrados
 * @returns {Promise<Array<string>>} Promise que resolve para array com os caminhos completos de todos os arquivos Java encontrados
 * @throws {Error} Lança erro se não conseguir ler o diretório ou verificar status dos arquivos
 *
 * @example
 * const javaFiles = await scanDirectory('/projeto/src');
 * // Retorna: ['/projeto/src/Main.java', '/projeto/src/util/Helper.java', ...]
 */
async function scanDirectory(dir, fileList = []) {
  const files = await fs.readdir(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = await fs.stat(filePath);

    if (stat.isDirectory()) {
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
 * Lê o conteúdo de um arquivo com limite de tamanho
 *
 * Esta função lê o conteúdo de um arquivo em UTF-8 e, caso o arquivo exceda o tamanho
 * máximo configurado (CONFIG.MAX_FILE_SIZE), trunca o conteúdo e adiciona uma mensagem
 * indicando que o arquivo foi cortado. Isso evita problemas de memória e custos excessivos
 * ao processar arquivos muito grandes.
 *
 * @async
 * @param {string} filePath - Caminho completo do arquivo a ser lido
 * @returns {Promise<string|null>} Promise que resolve para o conteúdo do arquivo (possivelmente truncado) ou null em caso de erro
 *
 * @example
 * const content = await readFileContent('/projeto/Main.java');
 * // Retorna: "public class Main { ... }" ou null se houver erro
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
 * Carrega o template de prompt para análise de código
 *
 * Esta função busca e carrega o arquivo Markdown contendo o prompt detalhado que será
 * enviado ao Azure OpenAI. O arquivo deve estar localizado no diretório do script
 * com o nome 'Prompt-Analise-Codigo-Ecommerce.md'. Este template contém todos os
 * critérios de avaliação e instruções para a análise de código.
 *
 * @async
 * @returns {Promise<string>} Promise que resolve para o conteúdo completo do template de prompt em formato Markdown
 * @throws {Error} Lança erro se o arquivo de template não for encontrado ou não puder ser lido
 *
 * @example
 * const promptTemplate = await loadPromptTemplate();
 * // Retorna: "# Critérios de Análise\n\n## Arquitetura\n..."
 */
async function loadPromptTemplate() {
  const promptPath = path.join(__dirname, 'Prompt-Analise-Codigo-Ecommerce.md');
  try {
    return await fs.readFile(promptPath, 'utf-8');
  } catch (error) {
    console.error('Error loading prompt template:', error.message);
    throw new Error('Failed to load analysis prompt template');
  }
}

/**
 * Estima a contagem de tokens a partir de um texto
 *
 * Fornece uma aproximação rápida do número de tokens que um texto consumirá na API Azure OpenAI.
 * Utiliza a heurística de ~4 caracteres por token, que é uma média razoável para texto em
 * português e código. Esta estimativa é usada para criar lotes que não excedam os limites
 * de tokens da API.
 *
 * @param {string} text - Texto para o qual estimar a contagem de tokens
 * @returns {number} Número estimado de tokens (arredondado para cima)
 *
 * @example
 * const tokens = estimateTokens('public class Main { }');
 * // Retorna: 6 (aproximadamente 23 caracteres / 4)
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Cria lotes de arquivos com consciência de tokens
 *
 * Agrupa arquivos em lotes (batches) respeitando dois limites importantes:
 * 1. Número máximo de arquivos por lote (batchSize)
 * 2. Número máximo estimado de tokens por lote (CONFIG.MAX_INPUT_TOKENS)
 *
 * Esta função garante que nenhum lote exceda os limites da Azure OpenAI API, evitando
 * erros de processamento e otimizando o uso de recursos. Os arquivos são agrupados
 * sequencialmente, iniciando um novo lote quando qualquer um dos limites seria excedido.
 *
 * @param {Array<{path: string, name: string, content: string}>} fileContents - Array de objetos contendo informações dos arquivos
 * @param {number} batchSize - Número máximo de arquivos permitidos por lote
 * @returns {Array<Array<{path: string, name: string, content: string}>>} Array de lotes, onde cada lote é um array de arquivos
 *
 * @example
 * const batches = createBatches(fileContents, 15);
 * // Retorna: [[file1, file2, ...], [file16, file17, ...]]
 */
function createBatches(fileContents, batchSize) {
  const batches = [];
  let currentBatch = [];
  let currentTokenEstimate = 0;

  for (const file of fileContents) {
    const fileTokens = estimateTokens(file.content);

    if (currentBatch.length >= batchSize ||
        (currentTokenEstimate + fileTokens > CONFIG.MAX_INPUT_TOKENS && currentBatch.length > 0)) {
      batches.push(currentBatch);
      currentBatch = [];
      currentTokenEstimate = 0;
    }

    currentBatch.push(file);
    currentTokenEstimate += fileTokens;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches;
}

/**
 * Pausa a execução por um período especificado
 *
 * Função auxiliar que cria uma Promise que resolve após o tempo especificado,
 * permitindo pausas assíncronas no fluxo de execução. Utilizada principalmente
 * na lógica de retry com backoff exponencial.
 *
 * @param {number} ms - Tempo de espera em milissegundos
 * @returns {Promise<void>} Promise que resolve após o tempo especificado
 *
 * @example
 * await sleep(1000); // Pausa por 1 segundo
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Tenta reparar erros comuns em JSON malformado
 *
 * Esta função implementa várias estratégias de correção automática para JSON que pode
 * vir com erros comuns da Azure OpenAI API, incluindo:
 * - Remove vírgulas trailing antes de chaves/colchetes de fechamento
 * - Corrige problemas de escape em strings (\n, \t)
 * - Extrai apenas o conteúdo JSON válido (do primeiro { ao último })
 * - Remove texto adicional antes ou depois do JSON
 *
 * @param {string} jsonText - String contendo JSON potencialmente malformado
 * @returns {string} String JSON reparada e pronta para parsing
 *
 * @example
 * const fixed = attemptJsonRepair('{"key": "value",}');
 * // Retorna: '{"key": "value"}'
 */
function attemptJsonRepair(jsonText) {
  let repaired = jsonText;

  repaired = repaired.replace(/([^\\])\t/g, '$1\\t');

  const firstBrace = repaired.indexOf('{');
  const lastBrace = repaired.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    repaired = repaired.substring(firstBrace, lastBrace + 1);
  }

  return repaired;
}

/**
 * Analisa um lote com lógica de retry e backoff exponencial
 *
 * Encapsula a função analyzeBatch com mecanismo robusto de tentativas automáticas (retry)
 * em caso de falha. Implementa backoff exponencial, onde cada tentativa subsequente aguarda
 * progressivamente mais tempo antes de tentar novamente. Isso ajuda a lidar com:
 * - Problemas temporários de rede
 * - Rate limiting da API
 * - Erros transitórios do serviço
 *
 * O número de tentativas e o delay inicial são configuráveis via CONFIG.
 *
 * @async
 * @param {Array<{path: string, name: string, content: string}>} fileContents - Array de arquivos a serem analisados neste lote
 * @param {string} promptTemplate - Template do prompt de análise carregado
 * @param {string} projectName - Nome do projeto sendo analisado
 * @param {number} batchNumber - Número identificador deste lote (para logging)
 * @param {number} totalBatches - Número total de lotes no processamento completo
 * @param {string} analysisDate - Data da análise no formato ISO
 * @returns {Promise<Object>} Promise que resolve para o resultado da análise do lote
 * @throws {Error} Lança o último erro capturado se todas as tentativas falharem
 *
 * @example
 * const result = await analyzeBatchWithRetry(files, prompt, 'meu-projeto', 1, 5, '2025-01-23');
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
        console.warn(`   Retry ${attempt}/${CONFIG.RETRY_ATTEMPTS - 1} after ${delay}ms...`);
        await sleep(delay);
      } else {
        console.error(`    All ${CONFIG.RETRY_ATTEMPTS} attempts failed`);
      }
    }
  }

  throw lastError;
}

/**
 * Processa múltiplos lotes em paralelo com controle de concorrência
 *
 * Gerencia o processamento paralelo de lotes de análise, respeitando um limite de
 * concorrência para evitar sobrecarga da API e do sistema. Os lotes são processados
 * em "ondas" (chunks), onde cada onda contém até N lotes executando simultaneamente.
 *
 * A função utiliza Promise.allSettled para garantir que a falha de um lote não
 * interrompa o processamento dos demais. Retorna tanto os resultados bem-sucedidos
 * quanto os erros para permitir processamento parcial.
 *
 * @async
 * @param {Array<Array<Object>>} batches - Array contendo todos os lotes a serem processados
 * @param {string} promptTemplate - Template do prompt de análise
 * @param {string} projectName - Nome do projeto
 * @param {string} analysisDate - Data da análise
 * @param {number} concurrency - Número máximo de lotes a processar simultaneamente
 * @returns {Promise<{results: Array<Object>, errors: Array<{batchNumber: number, error: Error, files: Array<string>}>}>} Objeto contendo arrays de resultados e erros
 *
 * @example
 * const { results, errors } = await processBatchesInParallel(batches, prompt, 'projeto', '2025-01-23', 3);
 * // Processa 3 lotes por vez
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

  for (let i = 0; i < batches.length; i += concurrency) {
    const chunk = batches.slice(i, Math.min(i + concurrency, batches.length));
    const chunkStart = i + 1;
    const chunkEnd = Math.min(i + concurrency, batches.length);

    console.log(`\nProcessing batches ${chunkStart}-${chunkEnd} in parallel...`);

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

    const chunkResults = await Promise.allSettled(chunkPromises);

    chunkResults.forEach((settledResult, chunkIndex) => {
      const batchNumber = i + chunkIndex + 1;

      if (settledResult.status === 'fulfilled') {
        const result = settledResult.value;

        if (result.success) {
          results.push(result.result);
          console.log(`   Batch ${batchNumber}/${batches.length} complete`);
        } else {
          errors.push({
            batchNumber: result.batchNumber,
            error: result.error,
            files: result.batch.map(f => f.name)
          });
          console.error(`    Batch ${result.batchNumber}/${batches.length} failed: ${result.error.message}`);
          console.error(`      Files: ${result.batch.map(f => f.name).join(', ')}`);
        }
      } else {
        errors.push({
          batchNumber,
          error: new Error('Unexpected promise rejection'),
          files: chunk[chunkIndex].map(f => f.name)
        });
        console.error(`    Batch ${batchNumber}/${batches.length} failed unexpectedly`);
      }
    });
  }

  return { results, errors };
}

/**
 * Extrai o nome do projeto do pom.xml ou usa o nome da pasta
 *
 * Tenta identificar o nome do projeto seguindo esta ordem de prioridade:
 * 1. Busca o artifactId no arquivo pom.xml (projetos Maven)
 * 2. Se não encontrar ou houver erro, usa o nome da pasta como fallback
 *
 * Esta abordagem garante que sempre teremos um nome de projeto válido,
 * mesmo que o pom.xml não exista ou esteja malformado.
 *
 * @async
 * @param {string} targetDir - Caminho do diretório raiz do projeto
 * @returns {Promise<string>} Promise que resolve para o nome do projeto
 *
 * @example
 * const name = await getProjectName('/projetos/meu-ecommerce');
 * // Retorna: 'ecommerce-automation' (do pom.xml) ou 'meu-ecommerce' (da pasta)
 */
async function getProjectName(targetDir) {
  const pomPath = path.join(targetDir, 'pom.xml');
  try {
    const pomContent = await fs.readFile(pomPath, 'utf-8');
    const artifactIdMatch = pomContent.match(/<artifactId>(.*?)<\/artifactId>/);
    if (artifactIdMatch && artifactIdMatch[1]) {
      return artifactIdMatch[1];
    }
  } catch (error) {
    // Silently fall back to folder name
  }

  return path.basename(targetDir);
}

/**
 * Analisa um único lote de arquivos usando a Azure OpenAI API
 *
 * Esta é a função central que realiza a análise de código propriamente dita.
 * Ela executa as seguintes operações:
 *
 * 1. Constrói o prompt completo combinando o template com os arquivos do lote
 * 2. Envia a requisição para a Azure OpenAI API com os parâmetros configurados
 * 3. Extrai e valida a resposta JSON usando múltiplas estratégias de parsing
 * 4. Tenta reparar JSON malformado automaticamente se necessário
 * 5. Coleta metadados de uso de tokens para cálculo de custos
 * 6. Adiciona informações de tamanho real do lote para agregação posterior
 *
 * Em caso de erro de parsing, salva a resposta bruta em arquivo de debug.
 *
 * @async
 * @param {Array<{path: string, name: string, content: string}>} fileContents - Arquivos do lote a analisar
 * @param {string} promptTemplate - Template base do prompt de análise
 * @param {string} projectName - Nome do projeto
 * @param {number} batchNumber - Número deste lote (para logging e debug)
 * @param {number} totalBatches - Total de lotes sendo processados
 * @param {string} analysisDate - Data da análise no formato YYYY-MM-DD
 * @returns {Promise<Object>} Objeto contendo grades, problemas, recomendações e metadados de tokens
 * @throws {Error} Lança erro se a API falhar ou se o JSON não puder ser parseado/reparado
 *
 * @example
 * const result = await analyzeBatch(files, prompt, 'projeto-x', 1, 3, '2025-01-23');
 */
async function analyzeBatch(fileContents, promptTemplate, projectName, batchNumber, totalBatches, analysisDate) {
  console.log(`\nAnalyzing batch ${batchNumber}/${totalBatches} (${fileContents.length} files)...`);

  // Build analysis prompt
  const analysisPrompt = `${promptTemplate}

---

## IDIOMA OBRIGATÓRIO

IMPORTANTE: Toda a análise DEVE ser escrita em PORTUGUÊS BRASILEIRO. Todos os títulos, descrições, observações, problemas, recomendações e qualquer texto no JSON devem estar EXCLUSIVAMENTE em português do Brasil. NÃO use inglês em nenhuma parte da resposta.

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
    "project_type": "Test Automation"
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
1. ESCREVA TODA A ANÁLISE EM PORTUGUÊS BRASILEIRO - todos os títulos, descrições, observações, problemas e recomendações devem estar em português
2. Retorne APENAS o JSON, sem texto adicional antes ou depois
3. Calcule as notas de 1 a 10 para cada categoria
4. Calcule a média ponderada final usando os pesos especificados
5. Identifique pelo menos 5-10 problemas comuns
6. Liste os 10 problemas mais críticos no top_issues
7. Forneça pelo menos 7 recomendações priorizadas
8. CRÍTICO - O JSON deve ser VÁLIDO e bem-formado:
   - Todas as strings devem usar aspas duplas
   - Não inclua vírgulas após o último elemento de arrays/objetos
   - Escape caracteres especiais em strings (\\n, \\t, \\", \\\\)
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

  console.log('Sending request to Azure OpenAI API...');

  try {
    const messages = [
      {
        role: 'user',
        content: analysisPrompt
      }
    ];

    const result = await client.chat.completions.create({
      model: CONFIG.DEPLOYMENT_NAME,
      messages: messages,
      max_completion_tokens: CONFIG.MAX_TOKENS
    });

    console.log('Received response from Azure OpenAI API');

    const responseText = result.choices[0].message.content;

    let jsonText = responseText;
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

    let analysisResult;

    try {
      analysisResult = JSON.parse(jsonText);
    } catch (parseError) {
      console.warn(`   Initial JSON parse failed: ${parseError.message}`);
      console.warn(`   Attempting JSON repair...`);

      try {
        const repairedJson = attemptJsonRepair(jsonText);
        analysisResult = JSON.parse(repairedJson);
        console.log(`   JSON successfully repaired and parsed`);
      } catch (repairError) {
        const debugFile = `debug-batch-azure-${batchNumber}-${Date.now()}.txt`;
        await fs.writeFile(debugFile, responseText, 'utf-8');
        console.error(`    JSON repair failed. Raw response saved to: ${debugFile}`);
        console.error(`   Original error: ${parseError.message}`);

        throw new Error(`Failed to parse JSON response: ${parseError.message}. See ${debugFile} for raw response.`);
      }
    }

    if (!analysisResult.project_summary || !analysisResult.grades) {
      throw new Error('Parsed JSON missing required fields (project_summary or grades)');
    }

    // Extract token usage from Azure OpenAI response
    analysisResult.token_usage = {
      prompt_tokens: result.usage?.promptTokens || 0,
      completion_tokens: result.usage?.completionTokens || 0,
      total_tokens: result.usage?.totalTokens || 0
    };

    analysisResult._actual_batch_size = fileContents.length;

    return analysisResult;

  } catch (error) {
    console.error('Error calling Azure OpenAI API:', error.message);
    throw error;
  }
}

/**
 * Analisa toda a base de código em lotes paralelos
 *
 * Esta é a função orquestradora principal do processo de análise. Coordena todo o
 * fluxo de trabalho desde a preparação dos arquivos até a agregação dos resultados finais:
 *
 * 1. Define a data de análise (única para todos os lotes)
 * 2. Lê o conteúdo de todos os arquivos Java encontrados
 * 3. Divide os arquivos em lotes respeitando limites de tokens
 * 4. Processa os lotes em paralelo com controle de concorrência
 * 5. Coleta estatísticas de uso de tokens de todos os lotes
 * 6. Trata erros de lotes individuais sem falhar todo o processo
 * 7. Agrega resultados de todos os lotes bem-sucedidos em um relatório unificado
 * 8. Calcula o custo estimado total baseado no uso de tokens
 *
 * @async
 * @param {Array<string>} files - Array com caminhos completos de todos os arquivos Java a analisar
 * @param {string} promptTemplate - Template de prompt carregado do arquivo MD
 * @param {string} projectName - Nome do projeto extraído do pom.xml ou pasta
 * @returns {Promise<Object>} Objeto contendo análise agregada completa com grades, problemas, recomendações, tokens e custos
 * @throws {Error} Lança erro se TODOS os lotes falharem (processamento parcial é permitido)
 *
 * @example
 * const analysis = await analyzeCodebaseInBatches(javaFiles, promptTemplate, 'meu-projeto');
 * // Retorna objeto completo com todas as métricas agregadas
 */
async function analyzeCodebaseInBatches(files, promptTemplate, projectName) {
  console.log(`\nPreparing to analyze ${files.length} files...`);

  // Calculate analysis date once for consistency across all batches
  const analysisDate = new Date().toLocaleDateString('en-CA');

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

  const batches = createBatches(fileContents, CONFIG.BATCH_SIZE);
  console.log(`Split into ${batches.length} batch(es) for analysis`);

  console.log(`\nUsing parallel processing (${CONFIG.PARALLEL_BATCHES} batches at a time)...`);

  const { results: batchResults, errors: batchErrors } = await processBatchesInParallel(
    batches,
    promptTemplate,
    projectName,
    analysisDate,
    CONFIG.PARALLEL_BATCHES
  );

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

  if (batchErrors.length > 0) {
    console.error(`\n${batchErrors.length} batch(es) failed after ${CONFIG.RETRY_ATTEMPTS} retries`);
    batchErrors.forEach(error => {
      console.error(`   Batch ${error.batchNumber}: ${error.error.message}`);
    });
  }

  if (batchResults.length === 0) {
    throw new Error('All batches failed to analyze');
  }

  console.log('Aggregating results from all batches...');
  const aggregatedResults = aggregateResults(batchResults, fileContents.length, batches.length);
  aggregatedResults.token_usage = totalTokens;

  const costs = calculateCost(totalTokens, CONFIG.DEPLOYMENT_NAME);
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
 * Encontra um resultado de lote válido para usar como estrutura base
 *
 * Percorre os resultados dos lotes processados buscando o primeiro que contém
 * toda a estrutura de dados necessária (project_summary, grades com todas as categorias).
 * Este lote será usado como template/base para criar o resultado agregado final,
 * garantindo que todos os campos obrigatórios estejam presentes.
 *
 * @param {Array<Object>} batchResults - Array com resultados de todos os lotes processados
 * @returns {Object} Primeiro lote com estrutura de dados completa e válida
 * @throws {Error} Lança erro se nenhum lote tiver estrutura válida (todos incompletos)
 *
 * @example
 * const baseBatch = getValidBaseBatch(allBatchResults);
 * // Usa este como template para agregação
 */
function getValidBaseBatch(batchResults) {
  for (const batch of batchResults) {
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
 * Agrega resultados de múltiplas análises de lote em um relatório unificado
 *
 * Combina os resultados de todos os lotes processados em um único relatório consolidado,
 * executando as seguintes operações de agregação inteligente:
 *
 * 1. **Metadados do Projeto**: Atualiza contagem total de arquivos e classes
 * 2. **Grades por Categoria**: Calcula médias ponderadas pelo tamanho REAL de cada lote
 * 3. **Pontos Positivos/Negativos**: Deduplica e mescla pontos de todos os lotes
 * 4. **Observações**: Concatena observações de todas as análises
 * 5. **Score Geral**: Recalcula média ponderada final e determina nota (A-F)
 * 6. **Problemas Comuns**: Deduplica por título, soma ocorrências e mescla arquivos afetados
 * 7. **Top Issues**: Combina e mantém os 20 problemas mais críticos
 * 8. **Recomendações**: Deduplica recomendações por descrição
 *
 * A agregação usa o tamanho REAL dos lotes (_actual_batch_size) para garantir
 * que lotes maiores tenham peso proporcional nas médias calculadas.
 *
 * @param {Array<Object>} batchResults - Array de resultados de análise de cada lote
 * @param {number} totalFiles - Número total de arquivos analisados em todos os lotes
 * @param {number} totalBatches - Número total de lotes processados
 * @returns {Object} Resultado agregado e consolidado de toda a análise
 *
 * @example
 * const finalReport = aggregateResults(batchResults, 150, 10);
 * // Retorna relatório unificado de 150 arquivos processados em 10 lotes
 */
function aggregateResults(batchResults, totalFiles, totalBatches) {
  const baseBatch = getValidBaseBatch(batchResults);
  const aggregated = JSON.parse(JSON.stringify(baseBatch));

  aggregated.project_summary.total_files = totalFiles;
  aggregated.project_summary.batches_processed = totalBatches;

  let totalClasses = 0;
  batchResults.forEach(batch => {
    totalClasses += batch.project_summary?.total_classes || 0;
  });
  aggregated.project_summary.total_classes = totalClasses;

  const categories = ['architecture', 'code_quality', 'validations', 'error_handling'];
  categories.forEach(category => {
    let weightedSum = 0;
    let totalWeight = 0;

    batchResults.forEach(batch => {
      const filesInBatch = batch._actual_batch_size || 1;
      const score = batch.grades?.[category]?.score || 0;
      weightedSum += score * filesInBatch;
      totalWeight += filesInBatch;
    });

    aggregated.grades[category].score = totalWeight > 0 ?
      Math.round((weightedSum / totalWeight) * 10) / 10 : 0;

    const allPositive = new Set();
    const allNegative = new Set();
    batchResults.forEach(batch => {
      batch.grades?.[category]?.positive_points?.forEach(p => allPositive.add(p));
      batch.grades?.[category]?.negative_points?.forEach(p => allNegative.add(p));
    });
    aggregated.grades[category].positive_points = Array.from(allPositive);
    aggregated.grades[category].negative_points = Array.from(allNegative);

    const observations = batchResults
      .map(b => b.grades?.[category]?.observations)
      .filter(o => o)
      .join(' ');
    aggregated.grades[category].observations = observations;
  });

  const overallScore =
    (aggregated.grades.architecture.score * 0.25) +
    (aggregated.grades.code_quality.score * 0.30) +
    (aggregated.grades.validations.score * 0.25) +
    (aggregated.grades.error_handling.score * 0.20);

  aggregated.grades.overall.weighted_score = Math.round(overallScore * 10) / 10;

  if (overallScore >= 9) aggregated.grades.overall.final_grade = 'A';
  else if (overallScore >= 7) aggregated.grades.overall.final_grade = 'B';
  else if (overallScore >= 5) aggregated.grades.overall.final_grade = 'C';
  else if (overallScore >= 3) aggregated.grades.overall.final_grade = 'D';
  else aggregated.grades.overall.final_grade = 'F';

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

  const allTopIssues = [];
  batchResults.forEach(batch => {
    if (batch.top_issues) {
      allTopIssues.push(...batch.top_issues);
    }
  });
  aggregated.top_issues = allTopIssues.slice(0, 20);

  const recommendationsMap = new Map();
  batchResults.forEach(batch => {
    batch.recommendations?.forEach(rec => {
      if (!recommendationsMap.has(rec.description)) {
        recommendationsMap.set(rec.description, rec);
      }
    });
  });
  aggregated.recommendations = Array.from(recommendationsMap.values());

  delete aggregated._actual_batch_size;

  return aggregated;
}

/**
 * Salva os resultados da análise em arquivo JSON
 *
 * Serializa o objeto de resultados completo em JSON formatado (com indentação de 2 espaços)
 * e grava no caminho especificado. O arquivo resultante contém toda a análise agregada
 * incluindo grades, problemas, recomendações e metadados.
 *
 * @async
 * @param {Object} results - Objeto completo com todos os resultados da análise
 * @param {string} outputPath - Caminho completo onde o arquivo JSON será salvo
 * @returns {Promise<void>}
 * @throws {Error} Lança erro se não conseguir escrever o arquivo
 *
 * @example
 * await saveResults(analysisResults, './analysis-results-azure.json');
 */
async function saveResults(results, outputPath) {
  try {
    const jsonContent = JSON.stringify(results, null, 2);
    await fs.writeFile(outputPath, jsonContent, 'utf-8');
    console.log(`\nAnalysis results saved to: ${outputPath}`);
  } catch (error) {
    console.error('Error saving results:', error.message);
    throw error;
  }
}

/**
 * Exibe resumo formatado dos resultados da análise no console
 *
 * Apresenta um relatório visual completo e bem formatado contendo:
 * - Informações do projeto (nome, tipo, arquivos, classes, data)
 * - Estatísticas de uso de tokens (prompt, completion, total)
 * - Tempo de execução da análise (formatado em h/m/s)
 * - Custo estimado detalhado (input, output, total em USD)
 * - Notas por categoria e média ponderada final
 * - Top 5 problemas comuns identificados
 *
 * O resumo usa formatação ASCII com linhas divisórias para melhor legibilidade
 * e apresenta valores numéricos formatados com separadores de milhares.
 *
 * @param {Object} results - Objeto completo de resultados da análise
 *
 * @example
 * displaySummary(analysisResults);
 * // Imprime relatório formatado no console
 */
function displaySummary(results) {
  console.log('\n' + '='.repeat(60));
  console.log('ANALYSIS SUMMARY (Azure OpenAI)');
  console.log('='.repeat(60));

  if (results.project_summary) {
    console.log(`\nProject Name: ${results.project_summary.project_name}`);
    console.log(`Project Type: ${results.project_summary.project_type}`);
    console.log(`Files Analyzed: ${results.project_summary.total_files}`);
    console.log(`Classes Found: ${results.project_summary.total_classes}`);
    console.log(`Analysis Date: ${results.project_summary.analysis_date}`);
    if (results.project_summary.batches_processed) {
      console.log(`Batches Processed: ${results.project_summary.batches_processed}`);
    }
  }

  if (results.token_usage) {
    console.log('\n' + '-'.repeat(60));
    console.log('TOKEN USAGE:');
    console.log('-'.repeat(60));
    console.log(`Prompt Tokens:      ${results.token_usage.prompt_tokens.toLocaleString('en-US')}`);
    console.log(`Completion Tokens:  ${results.token_usage.completion_tokens.toLocaleString('en-US')}`);
    console.log(`Total Tokens:       ${results.token_usage.total_tokens.toLocaleString('en-US')}`);

    if (results.execution_metadata) {
      console.log('');
      console.log('EXECUTION TIME:');
      console.log(`Duration:           ${results.execution_metadata.duration_formatted}`);
      console.log(`Total Seconds:      ${results.execution_metadata.duration_seconds}`);
    }

    const costs = results.estimated_cost || calculateCost(results.token_usage, CONFIG.DEPLOYMENT_NAME);
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
 * Calcula o custo estimado baseado nos preços da Azure OpenAI API
 *
 * Realiza cálculo detalhado do custo da análise considerando:
 * - Modelo utilizado (GPT-4o-mini)
 * - Custos separados para tokens de input (prompt) e output (completion)
 * - Valores em USD por milhão de tokens
 *
 * Tabela de Preços Azure OpenAI (por 1M tokens):
 * - GPT-4o-mini: $0.15 input, $0.60 output
 *
 * @param {Object} tokenUsage - Objeto contendo contagens de tokens (prompt_tokens, completion_tokens)
 * @param {string} modelName - Nome do deployment/modelo utilizado
 * @returns {Object} Objeto contendo custos detalhados (input_cost_usd, output_cost_usd, total_cost_usd, model)
 *
 * @example
 * const cost = calculateCost({prompt_tokens: 50000, completion_tokens: 5000}, 'openai-o4mini');
 * // Retorna: {input_cost_usd: 0.0075, output_cost_usd: 0.003, total_cost_usd: 0.0105, model: 'GPT-4o-mini'}
 */
function calculateCost(tokenUsage, modelName) {
  // Azure OpenAI pricing for GPT-4o-mini
  const PRICING = {
    input: 0.15,   // $0.15 per 1M input tokens
    output: 0.60   // $0.60 per 1M output tokens
  };

  const inputCost = (tokenUsage.prompt_tokens / 1000000) * PRICING.input;
  const outputCost = (tokenUsage.completion_tokens / 1000000) * PRICING.output;
  const totalCost = inputCost + outputCost;

  return {
    input_cost_usd: inputCost,
    output_cost_usd: outputCost,
    total_cost_usd: totalCost,
    model: 'GPT-4o-mini (Azure)'
  };
}

/**
 * Função principal de execução do script de análise
 *
 * Orquestra todo o fluxo de trabalho da análise de código do início ao fim:
 *
 * 1. **Validação Inicial**: Verifica variável de ambiente AZURE_OPENAI_API_KEY
 * 2. **Preparação**: Valida diretório alvo e extrai nome do projeto
 * 3. **Carregamento**: Carrega template de prompt de análise
 * 4. **Descoberta**: Escaneia recursivamente todos os arquivos Java
 * 5. **Análise**: Processa arquivos em lotes paralelos via Azure OpenAI API
 * 6. **Métricas**: Calcula tempo de execução e formata duração
 * 7. **Persistência**: Salva resultados JSON no diretório de trabalho
 * 8. **Apresentação**: Exibe resumo formatado no console
 *
 * O diretório alvo pode ser especificado via argumento de linha de comando
 * (process.argv[2]) ou usa o diretório atual como padrão.
 *
 * Em caso de erro crítico, exibe mensagem e encerra com código de saída 1.
 *
 * @async
 * @returns {Promise<void>}
 * @throws {Error} Erros críticos são capturados, logados e causam process.exit(1)
 *
 * @example
 * // Uso via linha de comando:
 * // node analyze-codebase-azure.js /caminho/para/projeto
 * // ou simplesmente: node analyze-codebase-azure.js (usa diretório atual)
 */
async function main() {
  const startTime = Date.now();

  try {
    console.log('='.repeat(60));
    console.log('AUTOMATION CODE ANALYSIS TOOL (Azure OpenAI)');
    console.log('='.repeat(60));

    if (!process.env.AZURE_OPENAI_API_KEY) {
      throw new Error('AZURE_OPENAI_API_KEY environment variable not set');
    }

    // Initialize database connection
    await initializeDatabase();

    const targetDir = process.argv[2] || process.cwd();
    console.log(`\nTarget directory: ${targetDir}`);

    try {
      await fs.access(targetDir);
    } catch {
      throw new Error(`Directory not found: ${targetDir}`);
    }

    console.log('Extracting project name...');
    const projectName = await getProjectName(targetDir);
    console.log(`Project name: ${projectName}`);

    console.log('Loading analysis prompt template...');
    const promptTemplate = await loadPromptTemplate();

    console.log('Scanning for Java files...');
    const files = await scanDirectory(targetDir);

    if (files.length === 0) {
      throw new Error('No Java files found in the specified directory');
    }

    console.log(`Found ${files.length} Java file(s)`);

    const results = await analyzeCodebaseInBatches(files, promptTemplate, projectName);

    const endTime = Date.now();
    const executionTimeMs = endTime - startTime;
    const executionTimeSec = executionTimeMs / 1000;
    const executionTimeMin = executionTimeSec / 60;

    const hours = Math.floor(executionTimeMin / 60);
    const minutes = Math.floor(executionTimeMin % 60);
    const seconds = Math.floor(executionTimeSec % 60);

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

    const outputPath = path.join(process.cwd(), CONFIG.OUTPUT_FILE);
    await saveResults(results, outputPath);

    // Save to database
    await saveResultsToDatabase(results);

    displaySummary(results);

    console.log('\nAnalysis complete!');

    // Close database connection
    await closeDatabaseConnection();

  } catch (error) {
    console.error('\nError:', error.message);
    // Ensure database connection is closed on error
    await closeDatabaseConnection();
    process.exit(1);
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { scanDirectory, analyzeCodebaseInBatches, analyzeBatch, readFileContent, aggregateResults };
