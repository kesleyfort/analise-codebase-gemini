# E-Commerce Code Analyzer

Automated code analysis tool for e-commerce automation projects using Google Gemini AI. Analyzes Java codebases following best practices for test automation frameworks (Selenium, Appium, RestAssured, TestNG/JUnit).

## Features

- **Comprehensive Analysis**: Evaluates codebase across 5 key categories
  - Architecture (25%)
  - Code Quality (30%)
  - Validations & Robustness (25%)
  - Error Handling & Logging (20%)

- **Structured Output**: Generates JSON report with:
  - Individual grades for each category
  - Weighted overall score
  - Common problems identified
  - Top 10 critical issues
  - Prioritized recommendations

- **E-Commerce Focus**: Specialized for automation projects covering:
  - Mobile (Android/iOS) testing
  - Web automation
  - API testing
  - Chatbot testing
  - Order flow validation

## Prerequisites

- Node.js >= 18.0.0
- Google Gemini API key (Get one at https://aistudio.google.com/apikey)

## Installation

1. Clone or navigate to this directory

2. Install dependencies:
```bash
npm install
```

3. Set up your Google Gemini API key:

**Windows (PowerShell):**
```powershell
$env:GEMINI_API_KEY="your-api-key-here"
```

**Windows (CMD):**
```cmd
set GEMINI_API_KEY=your-api-key-here
```

**Linux/Mac:**
```bash
export GEMINI_API_KEY="your-api-key-here"
```

## Usage

### Analyze Current Directory

```bash
npm run analyze
```

### Analyze Specific Directory

```bash
node analyze-codebase.js path/to/your/java/project
```

### Example

```bash
node analyze-codebase.js C:\projects\my-ecommerce-automation
```

## Output

The script generates `analysis-results.json` in the current directory with the following structure:

```json
{
  "project_summary": {
    "total_files": 15,
    "total_classes": 15,
    "analysis_date": "2025-10-13",
    "project_type": "E-commerce Automation"
  },
  "grades": {
    "architecture": {
      "score": 7,
      "weight": 25,
      "positive_points": ["..."],
      "negative_points": ["..."],
      "observations": "..."
    },
    "code_quality": {
      "score": 6,
      "weight": 30,
      "positive_points": ["..."],
      "negative_points": ["..."]
    },
    "validations": {
      "score": 5,
      "weight": 25,
      "positive_points": ["..."],
      "negative_points": ["..."]
    },
    "error_handling": {
      "score": 4,
      "weight": 20,
      "positive_points": ["..."],
      "negative_points": ["..."]
    },
    "overall": {
      "weighted_score": 5.65,
      "final_grade": "C",
      "summary": "..."
    }
  },
  "common_problems": [
    {
      "title": "Problem Title",
      "description": "...",
      "severity": "high",
      "occurrences": 10,
      "affected_files": ["file1.java", "file2.java"]
    }
  ],
  "top_issues": [
    {
      "file": "LoginPage.java",
      "class_name": "LoginPage",
      "method": "performLogin()",
      "issue": "Mixed responsibilities",
      "suggestion": "Separate page mapping from interaction logic"
    }
  ],
  "recommendations": [
    {
      "category": "Architecture",
      "priority": "high",
      "description": "...",
      "impact": "..."
    }
  ]
}
```

## Configuration

You can modify `CONFIG` object in `analyze-codebase.js`:

```javascript
const CONFIG = {
  MODEL: 'gemini-2.5-flash', // or 'gemini-1.5-pro', 'gemini-1.5-flash'
  MAX_TOKENS: 100000,
  MAX_FILE_SIZE: 100000,
  SUPPORTED_EXTENSIONS: ['.java'],
  OUTPUT_FILE: 'analysis-results.json'
};
```

**Available Gemini Models:**
- `gemini-2.5-flash` - Latest Gemini 2.5 model (recommended, 1M token context)
- `gemini-1.5-pro` - Best for complex analysis (2M token context)
- `gemini-1.5-flash` - Faster responses, good for smaller projects

## Analysis Criteria

### 1. Architecture (25%)
- Modularity and separation of concerns
- Code duplication elimination
- Consistent architectural patterns
- Package organization
- Cohesion and low coupling

### 2. Code Quality (30%)
- Readability and clarity
- Consistent naming conventions
- JavaDoc documentation
- SOLID principles adherence
- Design patterns usage

### 3. Validations & Robustness (25%)
- Assertion logic correctness
- Proper wait/timeout handling
- Complete and reliable checks
- Input/output validation
- Element state handling

### 4. Error Handling & Logging (20%)
- Specific vs generic exceptions
- Structured logging
- Network/timeout failure handling
- Recovery mechanisms and retry policies

## Common Issues Detected

- Mixed responsibilities in Page Objects
- Code duplication across test classes
- Incorrect assertion logic
- Generic exception handling
- Hardcoded values (coordinates, timeouts, URLs)
- Inconsistent wait strategies
- Missing input validation
- Poor error messages

## Limitations

- Maximum file size: 100,000 characters per file (configurable)
- Analyzes `.java` files only
- Requires internet connection for Gemini API
- API rate limits apply (Gemini offers generous free tier)

## Next Steps

After receiving your analysis:

1. Review the `analysis-results.json` file
2. Focus on high-priority recommendations
3. Address critical issues in `top_issues` section
4. Implement suggested improvements incrementally
5. Re-run analysis to track progress

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Code Analysis
on: [push]
jobs:
  analyze:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - run: node analyze-codebase.js ./src
        env:
          GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
      - uses: actions/upload-artifact@v4
        with:
          name: analysis-results
          path: analysis-results.json
```

### Jenkins Pipeline Example

```groovy
pipeline {
    agent any

    environment {
        GEMINI_API_KEY = credentials('gemini-api-key')
    }

    stages {
        stage('Code Analysis') {
            steps {
                sh 'npm install'
                sh 'node analyze-codebase.js ./src'
                archiveArtifacts artifacts: 'analysis-results.json'
            }
        }
    }
}
```

## Troubleshooting

**Error: "GEMINI_API_KEY environment variable not set"**
- Ensure you've set the API key in your environment
- Get your API key at: https://aistudio.google.com/apikey

**Error: "No Java files found"**
- Verify the target directory contains `.java` files
- Check the path is correct

**Error: "Failed to load analysis prompt template"**
- Ensure `Prompt-Analise-Codigo-Ecommerce.md` exists in parent directory

## Support

For issues or questions, please refer to the analysis prompt template at:
`C:\Users\kesle\Documents\Renner\Prompt-Analise-Codigo-Ecommerce.md`

## License

MIT
