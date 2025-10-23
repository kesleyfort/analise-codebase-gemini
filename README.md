# Analisador de Código Java - Gemini API

Ferramenta automatizada de análise de código Java utilizando Google Gemini API para avaliar projetos de automação de testes.

![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## Índice

- [Sobre o Projeto](#sobre-o-projeto)
- [Categorias de Análise](#categorias-de-análise)
- [Tecnologias](#tecnologias)
- [Pré-requisitos](#pré-requisitos)
- [Instalação](#instalação)
- [Configuração da API Key](#configuração-da-api-key)
- [Como Usar](#como-usar)
- [Fluxo de Funcionamento](#fluxo-de-funcionamento)
- [Prompt de Análise Utilizado](#prompt-de-análise-utilizado)
- [Configurações do Sistema](#configurações-do-sistema)
- [Arquivos de Saída](#arquivos-de-saída)
- [Custos da API Gemini](#custos-da-api-gemini)
- [Tratamento de Erros](#tratamento-de-erros)
- [Troubleshooting](#troubleshooting)
- [Limitações](#limitações)
- [Exemplo de Uso Completo](#exemplo-de-uso-completo)
- [Estrutura do Projeto](#estrutura-do-projeto)
- [Licença](#licença)
- [Requisitos de Sistema](#requisitos-de-sistema)

## Sobre o Projeto

O **Analisador de Código Java** é uma ferramenta desenvolvida para avaliar automaticamente a qualidade de projetos Java de automação de testes. Utilizando a API do Google Gemini (modelo gemini-2.5-flash), o sistema analisa arquivos `.java` e gera um relatório JSON completo com:

- Notas de 1 a 10 em 5 categorias principais
- Identificação de problemas comuns
- Recomendações priorizadas de melhorias
- Estimativa de custos da análise
- Estatísticas detalhadas

O processamento é otimizado com lotes paralelos, retry automático e controle inteligente de tokens para análise eficiente de projetos de qualquer tamanho.

## Categorias de Análise

A ferramenta avalia o código em 5 categorias com pesos diferentes para o cálculo da nota final:

### 1. Arquitetura (25%)
Avalia a organização estrutural do código:
- Padrões de projeto aplicados (Page Object, Factory, etc.)
- Separação de responsabilidades
- Modularidade e coesão
- Estrutura de diretórios
- Dependências entre componentes

### 2. Qualidade de Código (30%)
Analisa a legibilidade e manutenibilidade:
- Nomenclatura de classes, métodos e variáveis
- Complexidade ciclomática
- Duplicação de código
- Aderência a boas práticas Java
- Comentários e documentação

### 3. Validações (25%)
Verifica a robustez das validações:
- Assertions utilizadas
- Cobertura de cenários de teste
- Tratamento de edge cases
- Validações de dados de entrada
- Verificações de estado

### 4. Tratamento de Erros (20%)
Examina como erros são gerenciados:
- Try-catch adequados
- Mensagens de erro descritivas
- Logging estruturado
- Recuperação de falhas
- Propagação de exceções

### 5. Score Geral
Calculado como média ponderada das 4 categorias:
```
Score = (Arquitetura × 0.25) + (Qualidade × 0.30) + (Validações × 0.25) + (Erros × 0.20)
```

**Nota Final (A-F):**
- A: 9.0 - 10.0
- B: 7.0 - 8.9
- C: 5.0 - 6.9
- D: 3.0 - 4.9
- F: 0.0 - 2.9

## Tecnologias

- **Node.js** >= 18.0.0
- **Google Gemini API** (gemini-2.5-flash)
- **@google/generative-ai** ^0.21.0
- Processamento paralelo em lotes
- Retry com backoff exponencial
- Reparo automático de JSON

## Pré-requisitos

Antes de começar, você precisa ter:

1. **Node.js 18 ou superior** instalado
   - Verificar versão: `node --version`
   - Download: https://nodejs.org/

2. **Chave de API do Google Gemini**
   - Obter em: https://aistudio.google.com/app/apikey

3. **Projeto Java** com arquivos `.java` para análise

## Instalação

Clone ou baixe o projeto e instale as dependências:

```bash
cd poc-analise-codigo
npm install
```

## Configuração da API Key

### Obter Chave do Google Gemini

1. Acesse https://aistudio.google.com/app/apikey
2. Faça login com sua conta Google
3. Clique em "Create API Key"
4. Selecione um projeto ou crie um novo
5. Copie a chave gerada

### Configurar Variável de Ambiente

A chave deve ser configurada como variável de ambiente `GEMINI_API_KEY`:

#### PowerShell (Windows)

```powershell
# Sessão atual
$env:GEMINI_API_KEY = "sua-chave-api-aqui"

# Verificar configuração
echo $env:GEMINI_API_KEY
```

#### Bash/Zsh (Linux/Mac)

```bash
# Sessão atual
export GEMINI_API_KEY="sua-chave-api-aqui"

# Verificar configuração
echo $GEMINI_API_KEY
```

#### CMD (Windows)

```cmd
REM Sessão atual
set GEMINI_API_KEY=sua-chave-api-aqui

REM Verificar configuração
echo %GEMINI_API_KEY%
```

### Configuração Permanente

#### Windows (Sistema)
1. Pesquisar "Variáveis de Ambiente" no menu Iniciar
2. Clicar em "Editar as variáveis de ambiente do sistema"
3. Botão "Variáveis de Ambiente"
4. Em "Variáveis do usuário", clicar "Novo"
5. Nome: `GEMINI_API_KEY`
6. Valor: sua chave API
7. OK em todas as janelas

#### Linux/Mac
Adicionar ao arquivo `~/.bashrc` ou `~/.zshrc`:

```bash
export GEMINI_API_KEY="sua-chave-api-aqui"
```

Depois executar:
```bash
source ~/.bashrc  # ou source ~/.zshrc
```

## Como Usar

### Análise Básica

```bash
# Analisar diretório atual
node analyze-codebase.js

# Analisar diretório específico
node analyze-codebase.js /caminho/para/projeto

# Exemplo com caminho absoluto
node analyze-codebase.js C:\projetos\automacao-testes
```

### Usando NPM Scripts

```bash
# Analisar diretório atual
npm run analyze

# Analisar diretório específico
npm run analyze:dir /caminho/para/projeto
```

### Saída

Após a execução:
- Arquivo `analysis-results.json` é criado no diretório atual
- Resumo completo é exibido no console
- Arquivos de debug são criados em caso de erro (debug-batch-*.txt)

## Fluxo de Funcionamento

O sistema executa as seguintes etapas:

### 1. Validação Inicial
- Verifica se `GEMINI_API_KEY` está configurada
- Valida se o diretório alvo existe

### 2. Extração do Nome do Projeto
- Busca `<artifactId>` no arquivo `pom.xml`
- Se não encontrar, usa o nome da pasta

### 3. Escaneamento de Arquivos
- Varre recursivamente o diretório alvo
- Identifica todos os arquivos `.java`
- Ignora automaticamente:
  - `node_modules/`
  - `.git/`
  - `target/`
  - `build/`
  - `dist/`

### 4. Preparação dos Lotes
- Lê conteúdo de cada arquivo (limite: 100.000 caracteres)
- Estima tokens (~4 caracteres = 1 token)
- Agrupa em lotes de até:
  - 15 arquivos por lote, OU
  - 800.000 tokens por lote

### 5. Processamento Paralelo
- Processa até 3 lotes simultaneamente
- Para cada lote:
  - Constrói prompt com template + arquivos
  - Envia para Gemini API
  - Aguarda resposta JSON

### 6. Retry Automático
Em caso de falha:
- 1ª tentativa: imediata
- 2ª tentativa: após 1 segundo (1000ms)
- 3ª tentativa: após 2 segundos (2000ms)
- Backoff exponencial (multiplica delay por 2)

### 7. Parsing e Validação
- Extrai JSON da resposta (suporta markdown, texto puro)
- Tenta parsing direto
- Se falhar, aplica reparo automático:
  - Remove vírgulas trailing
  - Corrige escapes (`\n`, `\t`)
  - Extrai conteúdo entre `{` e `}`
- Valida estrutura obrigatória

### 8. Agregação de Resultados
- Combina resultados de todos os lotes
- Calcula médias ponderadas por tamanho real de cada lote
- Deduplica problemas e recomendações
- Soma estatísticas de tokens

### 9. Cálculo de Custos
- Aplica tabela de preços do Gemini
- Separa custos de input e output
- Considera tiers de pricing (para modelo Pro)

### 10. Geração de Saída
- Salva `analysis-results.json`
- Exibe resumo formatado no console
- Inclui metadados de execução (tempo, tokens, custo)

## Prompt de Análise Utilizado

O script envia o seguinte prompt estruturado para o Gemini API:

### Formato de Saída Obrigatório

```
Você DEVE retornar sua análise em formato JSON válido seguindo EXATAMENTE esta estrutura:

{
  "project_summary": {
    "project_name": "nome-do-projeto",
    "total_files": 0,
    "total_classes": 0,
    "analysis_date": "YYYY-MM-DD",
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
```

### Instruções Críticas

O prompt instrui o Gemini a:

1. Retornar APENAS JSON, sem texto adicional antes ou depois
2. Calcular notas de 1 a 10 para cada categoria
3. Calcular média ponderada final usando os pesos especificados
4. Identificar pelo menos 5-10 problemas comuns
5. Listar os 10 problemas mais críticos no `top_issues`
6. Fornecer pelo menos 7 recomendações priorizadas
7. Garantir JSON válido:
   - Strings com aspas duplas
   - Sem vírgulas após último elemento
   - Escape de caracteres especiais (`\n`, `\t`, `\"`, `\\`)
   - Sem comentários no JSON

### Arquivos Incluídos

Para cada arquivo do lote, o prompt inclui:

```
### Arquivo N: NomeDoArquivo.java
**Path:** /caminho/completo/do/arquivo.java

```java
// Conteúdo completo do arquivo aqui
```
```

## Configurações do Sistema

O objeto `CONFIG` (linhas 24-36) define parâmetros do sistema:

| Configuração | Valor Padrão | Descrição |
|-------------|--------------|-----------|
| `MODEL` | `'gemini-2.5-flash'` | Modelo do Gemini utilizado |
| `MAX_TOKENS` | `100000` | Máximo de tokens na resposta do Gemini |
| `MAX_FILE_SIZE` | `100000` | Máximo de caracteres por arquivo (trunca se exceder) |
| `SUPPORTED_EXTENSIONS` | `['.java']` | Extensões de arquivo aceitas para análise |
| `OUTPUT_FILE` | `'analysis-results.json'` | Nome do arquivo de saída gerado |
| `BATCH_SIZE` | `15` | Número de arquivos por lote |
| `MAX_INPUT_TOKENS` | `800000` | Limite conservador de tokens de input por lote |
| `RETRY_ATTEMPTS` | `3` | Número de tentativas em caso de falha |
| `RETRY_DELAY_MS` | `1000` | Delay inicial para retry em milissegundos |
| `RETRY_BACKOFF` | `2` | Multiplicador de backoff exponencial |
| `PARALLEL_BATCHES` | `3` | Número de lotes processados em paralelo |

### Personalização

Para alterar configurações, edite o objeto `CONFIG` no arquivo `analyze-codebase.js`:

```javascript
const CONFIG = {
  MODEL: 'gemini-2.5-pro',  // Alterar para modelo Pro
  BATCH_SIZE: 20,            // Aumentar tamanho do lote
  PARALLEL_BATCHES: 5,       // Mais processamento paralelo
  // ... outras configurações
};
```

## Arquivos de Saída

### analysis-results.json

Arquivo JSON completo gerado no diretório de trabalho contendo:

```json
{
  "project_summary": {
    "project_name": "nome-do-projeto",
    "total_files": 45,
    "total_classes": 52,
    "analysis_date": "2025-01-23",
    "project_type": "Test Automation",
    "batches_processed": 3
  },
  "grades": {
    "architecture": {
      "score": 7.5,
      "weight": 25,
      "positive_points": [...],
      "negative_points": [...],
      "observations": "..."
    },
    // ... outras categorias
    "overall": {
      "weighted_score": 7.4,
      "final_grade": "B",
      "summary": "..."
    }
  },
  "common_problems": [...],
  "top_issues": [...],
  "recommendations": [...],
  "token_usage": {
    "prompt_tokens": 125430,
    "completion_tokens": 8920,
    "total_tokens": 134350
  },
  "estimated_cost": {
    "model": "gemini-2.5-flash",
    "input_cost_usd": 0.0376,
    "output_cost_usd": 0.0223,
    "total_cost_usd": 0.0599,
    "currency": "USD"
  },
  "execution_metadata": {
    "start_time": "2025-01-23T14:30:00.000Z",
    "end_time": "2025-01-23T14:32:45.000Z",
    "duration_seconds": 165,
    "duration_formatted": "2m 45s"
  }
}
```

### Resumo no Console

Durante e após a execução, o console exibe:

```
============================================================
AUTOMATION CODE ANALYSIS TOOL
============================================================

Target directory: /caminho/para/projeto
Extracting project name...
Project name: meu-projeto
Loading analysis prompt template...
Scanning for Java files...
Found 45 Java file(s)

Preparing to analyze 45 files...
Split into 3 batch(es) for analysis

Using parallel processing (3 batches at a time)...

Processing batches 1-3 in parallel...
Analyzing batch 1/3 (15 files)...
Sending request to Gemini API...
Received response from Gemini API
   Batch 1/3 complete

[... processamento dos outros lotes ...]

Aggregating results from all batches...

Analysis results saved to: ./analysis-results.json

============================================================
ANALYSIS SUMMARY
============================================================

Project Name: meu-projeto
Project Type: Test Automation
Files Analyzed: 45
Classes Found: 52
Analysis Date: 2025-01-23
Batches Processed: 3

------------------------------------------------------------
TOKEN USAGE:
------------------------------------------------------------
Prompt Tokens:      125,430
Completion Tokens:  8,920
Total Tokens:       134,350

EXECUTION TIME:
Duration:           2m 45s
Total Seconds:      165

ESTIMATED COST (gemini-2.5-flash):
Input Cost:         $0.0376
Output Cost:        $0.0223
Total Cost:         $0.0599

------------------------------------------------------------
GRADES:
------------------------------------------------------------
Architecture (25%):      7.5/10
Code Quality (30%):      8.2/10
Validations (25%):       6.8/10
Error Handling (20%):    7.0/10
------------------------------------------------------------
WEIGHTED AVERAGE:        7.4/10
FINAL GRADE:             B

------------------------------------------------------------
COMMON PROBLEMS IDENTIFIED: 12
------------------------------------------------------------
1. Falta de validação de null em métodos críticos (high)
2. Try-catch muito genéricos (medium)
3. Nomenclatura inconsistente de variáveis (medium)
4. Duplicação de código em validações (medium)
5. Assertions fracas em alguns testes (low)

============================================================

Analysis complete!
```

## Custos da API Gemini

### Tabela de Preços (por 1 milhão de tokens)

#### Gemini 2.5 Flash (Modelo Padrão)
| Tipo | Preço |
|------|-------|
| Input (prompt) | $0.30 |
| Output (completion) | $2.50 |

#### Gemini 2.5 Pro (Alternativa)
| Volume | Input | Output |
|--------|-------|--------|
| ≤ 200k tokens | $1.25 | $10.00 |
| > 200k tokens | $2.50 | $15.00 |

### Estimativa de Custo

**Projeto Pequeno** (10-20 arquivos):
- Tokens: ~30k input + 3k output
- Custo: ~$0.02 USD

**Projeto Médio** (50-100 arquivos):
- Tokens: ~150k input + 10k output
- Custo: ~$0.07 USD

**Projeto Grande** (200+ arquivos):
- Tokens: ~500k input + 30k output
- Custo: ~$0.20 USD

**Observação:** Custos são estimativas e variam com:
- Tamanho dos arquivos
- Complexidade do código
- Quantidade de problemas identificados
- Detalhamento das recomendações

## Tratamento de Erros

O sistema implementa mecanismos robustos de tratamento de erros:

### 1. Retry com Backoff Exponencial

```
Tentativa 1: Executa imediatamente
   ↓ Falha
Tentativa 2: Aguarda 1000ms (1s)
   ↓ Falha
Tentativa 3: Aguarda 2000ms (2s)
   ↓ Falha
Lança erro
```

### 2. Reparo Automático de JSON

Estratégias aplicadas automaticamente:

- **Remove vírgulas trailing**: `{"key": "value",}` → `{"key": "value"}`
- **Corrige escapes**: `\n` → `\\n`, `\t` → `\\t`
- **Extrai JSON puro**: Remove texto antes do `{` e após o `}`
- **Múltiplos patterns**: Tenta extrair de markdown, texto puro, JSON marcado

### 3. Processamento Parcial

- Se um lote falha após 3 tentativas, o processamento continua
- Resultados são agregados dos lotes bem-sucedidos
- Erros são reportados mas não interrompem a análise completa

### 4. Debug Files

Em caso de erro de parsing JSON:
- Arquivo `debug-batch-N-TIMESTAMP.txt` é criado
- Contém resposta bruta do Gemini
- Permite análise manual e debugging
- Nome indica número do lote e timestamp

### 5. Validação de Estrutura

Após parsing bem-sucedido, valida:
- Presença de `project_summary`
- Presença de `grades`
- Estrutura completa de categorias

## Troubleshooting

### Erro: "GEMINI_API_KEY environment variable not set"

**Causa:** Variável de ambiente não configurada

**Solução:**
```bash
# PowerShell
$env:GEMINI_API_KEY = "sua-chave-aqui"

# Bash/Zsh
export GEMINI_API_KEY="sua-chave-aqui"

# CMD
set GEMINI_API_KEY=sua-chave-aqui
```

### Erro: "No Java files found in the specified directory"

**Causa:** Diretório não contém arquivos `.java` ou caminho incorreto

**Solução:**
1. Verificar se o caminho está correto
2. Verificar se existem arquivos `.java` no diretório
3. Verificar se arquivos não estão em diretórios ignorados (target, build)

### Erro: "Failed to parse JSON response"

**Causa:** Resposta do Gemini não é JSON válido

**Solução:**
1. Verificar arquivo `debug-batch-*.txt` gerado
2. Analisar conteúdo da resposta bruta
3. Aguardar e tentar novamente (pode ser problema temporário)
4. Considerar reduzir `BATCH_SIZE` se arquivos forem muito complexos

### Erro: "All batches failed to analyze"

**Causa:** Todos os lotes falharam após múltiplas tentativas

**Soluções:**
1. Verificar conectividade com internet
2. Verificar se API Key está válida
3. Verificar se não excedeu quota da API
4. Reduzir `PARALLEL_BATCHES` para 1
5. Reduzir `BATCH_SIZE` para 5-10

### Erro de Rate Limiting (429)

**Causa:** Excedeu limite de requisições da API

**Solução:**
1. Aguardar alguns minutos
2. Retry automático já implementado
3. Reduzir `PARALLEL_BATCHES` para evitar sobrecarga
4. Considerar upgrade do plano Gemini

### Análise Muito Lenta

**Causas Possíveis:**
- Muitos arquivos
- Arquivos muito grandes
- Processamento sequencial

**Otimizações:**
1. Aumentar `PARALLEL_BATCHES` (se API permitir)
2. Aumentar `BATCH_SIZE` para menos lotes
3. Verificar conectividade de rede
4. Filtrar apenas arquivos relevantes

### JSON Incompleto ou Malformado

**Causa:** Gemini retornou JSON parcial ou com erros

**Solução:**
1. Sistema tenta reparo automático
2. Verificar arquivo debug gerado
3. Tentar novamente (variabilidade do modelo)
4. Ajustar temperatura no código (atualmente 0.3)

## Limitações

### Limitações Técnicas

1. **Apenas Arquivos Java**
   - Analisa somente arquivos `.java`
   - Ignora outros tipos (XML, properties, etc.)

2. **Truncamento de Arquivos Grandes**
   - Arquivos > 100.000 caracteres são truncados
   - Mensagem adicionada: `... [File truncated due to size]`

3. **Limite de Tokens**
   - Input limitado a ~800k tokens por lote
   - Output limitado a 100k tokens

4. **Dependência da API**
   - Requer conexão internet estável
   - Sujeito a disponibilidade do Gemini API
   - Custos variam com uso

### Limitações de Análise

1. **Qualidade Variável**
   - Análise depende do modelo Gemini
   - Pode haver variação entre execuções
   - Não substitui revisão humana especializada

2. **Contexto Limitado**
   - Analisa código-fonte apenas
   - Não analisa configurações (pom.xml, properties)
   - Não executa testes

3. **Sem Análise Dinâmica**
   - Análise estática apenas
   - Não detecta problemas de runtime
   - Não mede cobertura de testes

### Limitações de Escopo

1. **Projeto Java**
   - Nome extraído de `pom.xml` ou pasta
   - Assume estrutura Maven

2. **Idioma**
   - Instruções em português no prompt
   - Respostas esperadas em português

3. **Foco em Automação de Testes**
   - Otimizado para projetos de testes
   - Pode não ser ideal para outros tipos

## Exemplo de Uso Completo

### Cenário: Análise de Projeto de Testes E-commerce

```bash
# 1. Navegar até o diretório da ferramenta
cd C:\Users\usuario\poc-analise-codigo

# 2. Configurar API Key (PowerShell)
$env:GEMINI_API_KEY = "AIzaSyDxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# 3. Verificar configuração
echo $env:GEMINI_API_KEY

# 4. Executar análise do projeto
node analyze-codebase.js C:\projetos\automacao-ecommerce
```

### Output Esperado (Resumido)

```
============================================================
AUTOMATION CODE ANALYSIS TOOL
============================================================

Target directory: C:\projetos\automacao-ecommerce
Extracting project name...
Project name: automacao-ecommerce
Loading analysis prompt template...
Scanning for Java files...
Found 67 Java file(s)

Preparing to analyze 67 files...
Split into 5 batch(es) for analysis

Using parallel processing (3 batches at a time)...

Processing batches 1-3 in parallel...
Analyzing batch 1/5 (15 files)...
Sending request to Gemini API...
Received response from Gemini API
   Batch 1/5 complete

Analyzing batch 2/5 (15 files)...
Sending request to Gemini API...
Received response from Gemini API
   Batch 2/5 complete

Analyzing batch 3/5 (15 files)...
Sending request to Gemini API...
Received response from Gemini API
   Batch 3/5 complete

Processing batches 4-5 in parallel...
Analyzing batch 4/5 (15 files)...
Sending request to Gemini API...
Received response from Gemini API
   Batch 4/5 complete

Analyzing batch 5/5 (7 files)...
Sending request to Gemini API...
Received response from Gemini API
   Batch 5/5 complete

Aggregating results from all batches...

Analysis results saved to: ./analysis-results.json

============================================================
ANALYSIS SUMMARY
============================================================

Project Name: automacao-ecommerce
Project Type: Test Automation
Files Analyzed: 67
Classes Found: 78
Analysis Date: 2025-01-23
Batches Processed: 5

------------------------------------------------------------
TOKEN USAGE:
------------------------------------------------------------
Prompt Tokens:      245,680
Completion Tokens:  15,230
Total Tokens:       260,910

EXECUTION TIME:
Duration:           4m 15s
Total Seconds:      255

ESTIMATED COST (gemini-2.5-flash):
Input Cost:         $0.0737
Output Cost:        $0.0381
Total Cost:         $0.1118

------------------------------------------------------------
GRADES:
------------------------------------------------------------
Architecture (25%):      8.2/10
Code Quality (30%):      7.8/10
Validations (25%):       7.5/10
Error Handling (20%):    6.9/10
------------------------------------------------------------
WEIGHTED AVERAGE:        7.6/10
FINAL GRADE:             B

------------------------------------------------------------
COMMON PROBLEMS IDENTIFIED: 18
------------------------------------------------------------
1. Falta de validação de elementos antes de interação (high)
2. Waits implícitos misturados com explícitos (high)
3. Código duplicado em Page Objects (medium)
4. Mensagens de erro pouco descritivas (medium)
5. Falta de logging estruturado (medium)

============================================================

Analysis complete!
```

### Arquivo Gerado

O arquivo `analysis-results.json` será criado em `C:\Users\usuario\poc-analise-codigo\` com o relatório completo.

## Estrutura do Projeto

```
poc-analise-codigo/
├── analyze-codebase.js       # Script principal com toda a lógica
├── package.json              # Configurações NPM e dependências
├── package-lock.json         # Lock de versões das dependências
├── README.md                 # Este arquivo de documentação
│
└── [Gerados após execução]
    ├── analysis-results.json # Resultado da análise
    ├── debug-batch-*.txt     # Arquivos de debug (se houver erros)
    └── node_modules/         # Dependências instaladas
```

## Licença

Este projeto está sob a licença MIT. Veja o arquivo LICENSE para mais detalhes.

## Requisitos de Sistema

### Mínimos
- **Sistema Operacional:** Windows 10+, macOS 10.15+, Linux (Ubuntu 18.04+)
- **Node.js:** 18.0.0 ou superior
- **RAM:** 2 GB disponível
- **Espaço em Disco:** 100 MB livres
- **Internet:** Conexão estável (para API calls)

### Recomendados
- **Node.js:** 20.0.0 ou superior
- **RAM:** 4 GB disponível
- **Espaço em Disco:** 500 MB livres
- **Internet:** Banda larga (>10 Mbps)

### Dependências
- **@google/generative-ai:** ^0.21.0 (instalado via npm)
- **Node.js Built-in Modules:**
  - `fs` (file system)
  - `path` (path utilities)

---

**Desenvolvido para análise automatizada de qualidade de código Java em projetos de automação de testes.**
