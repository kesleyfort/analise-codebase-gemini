# Prompt para Análise Completa de Código - Projetos de Automação E-commerce

**Contexto:** Você é um especialista em qualidade de código e automação de testes que irá analisar projetos de automação de testes para plataformas de e-commerce. O projeto pode incluir automação de **mobile (Android/iOS)**, **web**, **APIs**, **chatbots** e **fluxos de pedidos**, desenvolvidos principalmente em Java com frameworks como Selenium, Appium, RestAssured, TestNG/JUnit.

**Objetivo:** Realizar uma análise detalhada de **todos os pacotes** do projeto (interactions, pages, configurations, utils, services, etc.) focando em clean code, padrões de qualidade, consistência e manutenibilidade.

## Escopo de Análise - Pacotes Típicos:

- **Pages/PageObjects:** Modelos de página e mapeamento de elementos
- **Interactions/Steps:** Lógica de interação e steps de testes
- **Configuration:** Classes de configuração, properties e setup
- **Utils/Helpers:** Utilitários, ferramentas e métodos auxiliares
- **Services:** Integrações com APIs e serviços externos
- **Models/DTOs:** Objetos de transferência de dados
- **Tests:** Classes de teste e cenários
- **Base/Core:** Classes base e infraestrutura

## Critérios de Avaliação (1-10):

### 1. Arquitetura (peso 25%)
- Modularidade e separação de responsabilidades
- Eliminação de duplicação de código
- Padrões arquiteturais consistentes (Page Object, Factory, Builder, etc.)
- Organização e estrutura dos pacotes
- Coesão e baixo acoplamento entre classes

### 2. Qualidade de Código (peso 30%)
- Legibilidade e clareza do código
- Nomenclatura consistente e significativa
- Documentação JavaDoc adequada
- Aderência aos princípios SOLID e clean code
- Formatação e estilo consistentes
- Uso adequado de design patterns

### 3. Validações e Robustez (peso 25%)
- Correção da lógica de validações/assertivas
- Tratamento adequado de waits e timeouts
- Verificações completas e confiáveis
- Validações de dados de entrada e saída
- Tratamento de estados de elementos (mobile/web)

### 4. Tratamento de Erros e Logging (peso 20%)
- Uso adequado de exceções específicas vs genéricas
- Implementação de logging estruturado
- Tratamento robusto de falhas de rede, timeouts e elementos
- Recovery mechanisms e retry policies

## Problemas Comuns por Tipo de Automação:

### Mobile (Android/iOS):
- Inconsistência entre `aguardoElementoVisivel()` e `appDriver.waitObject()`
- Hardcoding de coordenadas e tempos de scroll
- Falta de tratamento para permissões de dispositivo
- Código específico de plataforma não extraído

### Web:
- Waits implícitos vs explícitos inconsistentes
- Locators frágeis e não otimizados
- Falta de tratamento para diferentes browsers
- Page Object com responsabilidades mistas

### API:
- Hardcoding de endpoints e payloads
- Falta de validação de contratos (schema validation)
- Serialização/deserialização inadequada
- Tratamento incompleto de códigos de status HTTP

### Chatbot:
- Falta de tratamento para delays de resposta
- Validação inadequada de fluxos conversacionais
- Hardcoding de mensagens esperadas
- Falta de tratamento para diferentes contextos de conversa

## Padrões Críticos para Identificar:

### 1. Inconsistências Arquiteturais:
```java
// PROBLEMA: Mistura de responsabilidades
public class LoginPage {
    public void login(String user, String pass) {
        // mapeamento de elementos + lógica + validações + API
    }
}

// SOLUÇÃO: Separação clara de responsabilidades
public class LoginPage { /* apenas mapeamento */ }
public class LoginInteractions { /* apenas lógica */ }
public class LoginValidations { /* apenas validações */ }
```

### 2. Duplicação Crítica:
```java
// PROBLEMA: Código repetido em múltiplas classes
public void inicializarApp() {
    permitirNotificacao();
    btnSkip.click();
    aguardoElementoVisivel(btnMenu);
}

// SOLUÇÃO: Classe utilitária
public class AppInitializer {
    public static void inicializarApp() { /* código comum */ }
}
```

### 3. Validações Problemáticas:
```java
// PROBLEMA: Lógica de assertiva incorreta
Assert.assertTrue("Elemento deveria NÃO existir", elemento.isDisplayed());

// PROBLEMA: Comparação inútil
Assert.assertTrue(texto.contains(texto));

// SOLUÇÃO: Lógica e mensagens corretas
Assert.assertFalse("Elemento não deveria estar visível", elemento.isDisplayed());
Assert.assertTrue("Produto não encontrado na lista", lista.contains(produtoEsperado));
```

### 4. Tratamento de Erros Inadequado:
```java
// PROBLEMA: Exception genérica
public void metodo() throws Exception { /* sem tratamento */ }

// SOLUÇÃO: Tratamento específico
public void metodo() throws ElementNotFoundException, TimeoutException {
    try {
        // lógica
    } catch (NoSuchElementException e) {
        logger.error("Elemento não encontrado: " + e.getMessage());
        throw new ElementNotFoundException("Falha ao localizar elemento crítico");
    }
}
```

---

# INSTRUÇÕES PARA DOCUMENTAÇÃO DA ANÁLISE

## ESTRUTURA OBRIGATÓRIA DE ARQUIVOS:

### Estratégia de Análise por Quantidade de Classes:

#### Se o projeto tiver ≤ 10 classes:
- Analise TODAS as classes no Resumo.md
- Crie arquivo individual para CADA classe

#### Se o projeto tiver > 10 classes:
- Analise TODAS as classes no Resumo.md
- Crie arquivos individuais apenas para as 8-10 classes COM MAIOR NÚMERO DE PROBLEMAS IDENTIFICADOS
- No Resumo.md, adicione seção "Classes Analisadas Mas Não Detalhadas" listando as demais

#### Critérios para Seleção (classes para análise detalhada):
1. **Maior número de problemas identificados**
2. **Maior quantidade de violações dos critérios de qualidade**
3. **Maior complexidade de problemas encontrados**
4. **Classes com mais exemplos relevantes para demonstração**

### Localização dos Arquivos:
- Pasta: `/topics/` (dentro do projeto Writerside)
- Nomenclatura exata: `[NomeDaClasse].md` (sem espaços, PascalCase)

## TEMPLATE VALIDADO PARA Resumo.md:

```markdown
# Resumo das melhorias sugeridas

Este documento foi criado para categorizar e analisar as melhorias necessárias no(s) pacote(s) [LISTAR_PACOTES_ANALISADOS] do projeto, com foco em tornar o código mais limpo, consistente e fácil de manter.
O resumo aqui apresentado é baseado na análise de [QUANTIDADE] classes encontradas nos pacotes [PACOTES], como `[ExemploClasse1]`, `[ExemploClasse2]`, `[ExemploClasse3]`, entre outros.

## Problemas Comuns Identificados

### 1. [Nome do Problema]
[Descrição detalhada do problema com exemplos concretos]

### 2. [Nome do Próximo Problema]
[Descrição detalhada]

[Continue numerando sequencialmente até pelo menos 10 problemas...]

## Exemplos de Melhorias Necessárias

### Método `[nomeDoMetodoReal()]` em [NomeDaClasseReal]
1. **[Tipo específico do problema]**
   ```java
   // Código real extraído da análise
   public void exemploRealProblematico() {
       // código com problema identificado
   }
   ```
   ```java
       // Segundo exemplo se houver
       public void outroExemploReal() {
           // mais código problemático
       }
   ```

2. **[Próximo problema específico]**
    - Descrição detalhada do impacto
    - Sugestão específica de solução

[Repetir para 3-5 métodos mais problemáticos...]

## Recomendações de Melhorias

1. **[Categoria de Melhoria Específica]**
   ```java
   // Antes (código atual problemático)
   códigoAtualProblematico();

   // Depois (código sugerido)
   códigoMelhoradoSugerido();
   ```

2. **[Próxima Categoria]**
   [Descrição e exemplos práticos...]

[Continue numerando até ter pelo menos 7 recomendações...]

## Avaliação Detalhada

### Arquitetura: [NOTA]/10
- **Pontos positivos**: [Listar pontos positivos encontrados]
- **Pontos negativos**: [Listar problemas arquiteturais]
- **Observações**: [Observações específicas]

### Qualidade de código: [NOTA]/10
- **Pontos negativos**: [Identificar problemas de clean code]
   - [Problema específico 1]
   - [Problema específico 2]
   - [Problema específico 3]

### Validações: [NOTA]/10
- **Pontos negativos**:
   - [Problemas de assertivas específicos]
   - [Mensagens de erro identificadas]

### Tratamento de erros: [NOTA]/10
- **Pontos negativos**:
   - [Problemas de exceções específicos]
   - [Problemas de logging identificados]

### Média Final: [CALCULAR_MEDIA]/10

## Principais Pontos de Melhoria

1. **[Categoria de Melhoria]**:
   - [Ação específica 1]
   - [Ação específica 2]
   - [Ação específica 3]

2. **[Próxima Categoria]**:
   - [Ações específicas...]

[Continue até ter 5 categorias principais...]
```

## TEMPLATE VALIDADO PARA Classes Individuais:

```markdown
# [NomeDaClasse]

## Melhorias e Refatorações Sugeridas

### Método `[nomeExatoDoMetodo()]`
1. **[Problema específico identificado]**
   ```java
   // Código atual extraído da classe
   public void metodoAtual() {
       // código problemático real
   }
   ```
    - [Descrição específica do problema]
    - [Sugestão de melhoria específica]

2. **[Próximo problema do mesmo método]**
    - [Descrição]
    - [Sugestão]

### Método `[proximoMetodoAnalisado()]`
[Seguir exatamente o mesmo padrão...]

### Geral para Toda a Classe
1. **[Problema que afeta toda a classe]**
   ```java
   // Exemplo específico do problema
   ```
    - [Descrição e impacto]
    - [Solução sugerida]

2. **[Próximo problema geral]**
    - [Descrição e solução]

[Continue numerando todos os problemas identificados...]
```

## Template Adicional para Projetos Grandes:

Adicionar no final do Resumo.md quando houver > 10 classes:

```markdown
## Classes Analisadas Mas Não Detalhadas

As seguintes classes foram analisadas e incluídas nas estatísticas gerais, mas não receberam análise detalhada individual:

### [NomeDaClasse1]
- **Nota atribuída:** X/10
- **Principais problemas identificados:** [2-3 problemas mais relevantes]

### [NomeDaClasse2]
- **Nota atribuída:** X/10
- **Principais problemas identificados:** [2-3 problemas mais relevantes]

[Continuar para todas as classes não detalhadas...]

## Estatísticas Gerais do Projeto

### Distribuição de Notas:
- **Notas 8-10:** X classes (Y%)
- **Notas 6-7:** X classes (Y%)
- **Notas 4-5:** X classes (Y%)
- **Notas 1-3:** X classes (Y%)

### Problemas Mais Recorrentes:
1. [Problema X] - encontrado em Y classes
2. [Problema Y] - encontrado em Z classes
3. [Problema Z] - encontrado em W classes
```

## Padrões de Formatação Obrigatórios:

### Títulos e Seções:
- `#` para título principal (nome da classe)
- `##` para seções principais
- `###` para métodos específicos
- `####` para subseções (se necessário)

### Listas e Numeração:
- Use numeração sequencial (`1.`, `2.`, etc.) para problemas principais
- Use bullet points (`-`) para subitens
- Use checkboxes (`- [ ]`) para itens de checklist

### Blocos de Código:
```java
// SEMPRE inclua comentários explicativos
// Use linguagem "java" para syntax highlighting
// Mantenha indentação consistente
```

### Formatação de Problemas:
```markdown
1. **[Nome do Problema em Negrito]**
   ```java
   // Código demonstrando o problema
   ```
    - Explicação com bullet point e indentação de 4 espaços
    - Continue explicações com mesma indentação
```

## Padrões de Conteúdo:

### Linguagem e Tom:
- Use linguagem técnica e precisa
- Seja direto e objetivo
- Mantenha consistência na terminologia
- Use verbos no infinitivo para sugestões

### Estrutura de Problemas:
1. **Identificação clara** do problema
2. **Exemplo de código** demonstrando o problema
3. **Explicação detalhada** do impacto
4. **Sugestão específica** de melhoria

## INSTRUÇÕES FINAIS DEFINITIVAS:

1. **SEMPRE analise TODAS as classes** no Resumo.md (incluir nas estatísticas)
2. **SEMPRE crie arquivos individuais** para as classes com mais problemas (máximo 10)
3. **SEMPRE inclua lista** das classes não detalhadas no Resumo.md (quando aplicável)
4. **SEMPRE forneça estatísticas gerais** (total de classes, distribuição de notas, problemas recorrentes)
5. **SEMPRE mantenha caráter puramente informativo** - sem recomendações de ação
6. **SEMPRE justifique** por que certas classes receberam análise detalhada (baseado apenas na quantidade/complexidade de problemas)
7. **SEMPRE inclua dados quantitativos** para embasar a análise

## Contextos de E-commerce para Considerar:

- **Fluxos de Compra:** Carrinho, checkout, pagamento, confirmação
- **Catálogo de Produtos:** Busca, filtros, listagem, detalhes
- **Autenticação:** Login, registro, recuperação de senha
- **Perfil do Cliente:** Dados pessoais, endereços, histórico
- **Atendimento:** Chat, FAQ, suporte
- **Integrações:** Pagamento, logística, ERP, CRM

**Meta:** Transformar código de qualidade baixa/média (5-6/10) em código de alta qualidade (8-9/10), priorizando robustez, manutenibilidade e escalabilidade.

**CRÍTICO:** Este prompt foi validado contra os arquivos existentes e templates reais. A execução seguindo estas instruções produzirá exatamente o formato e qualidade esperados, mantendo caráter puramente informativo sem direcionamento de ações.