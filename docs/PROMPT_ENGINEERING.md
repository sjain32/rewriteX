# Prompt Engineering Documentation

## Overview
This document tracks the evolution of our prompt engineering efforts for the AI Content Transformer, focusing on summarization and rewriting tasks. Each section documents a specific prompt variation, its goals, parameters, and outcomes.

## Summarization Prompts

### Summarize_v1.0_SystemHeavy
**Goal:** Establish baseline performance with clear, structured instructions.

**Prompt Structure:**
```typescript
{
  role: 'system',
  content: `You are an expert AI text summarizer. Your task is to produce a concise and accurate summary of the user's text.
CRITICAL: Output *only* the summarized text. Do not include any introductory phrases, greetings, or conversational filler like "Here is the summary:".
Key Requirements:
- Adhere strictly to the requested detail level: '${requestedLengthDesc}'. Adjust length and detail accordingly.
- Focus on extracting the main argument and key factual points.
- Target audience is general; explain complex ideas simply if possible.
- Ensure the summary flows well and is grammatically correct.`
}
```

**Parameters:**
- Temperature: 0.5 (default)
- Max Tokens: 1024

**Results:**
- (+) Clear, consistent output format
- (+) Good adherence to detail levels
- (-) Sometimes included unnecessary context
- (-) Occasional verbosity in longer summaries

### Summarize_v2.0_FewShot
**Goal:** Improve consistency and length control using few-shot examples.

**Prompt Structure:**
```typescript
// System message (same as v1.0)
// Added examples:
{
  role: 'user',
  content: `Example Text:\n---\n${examples.summarize[requestedLengthLevel <= 2 ? 'veryBrief' : 'detailed'].input}\n---`
},
{
  role: 'assistant',
  content: examples.summarize[requestedLengthLevel <= 2 ? 'veryBrief' : 'detailed'].output
}
```

**Parameters:**
- Temperature: Dynamic based on detail level
  - Very Brief: 0.3
  - Default: 0.5
  - Detailed: 0.7
- Max Tokens: Dynamic based on detail level
  - Very Brief: 256
  - Default: 512
  - Detailed: 1024

**Results:**
- (+) Better length control
- (+) More consistent style
- (+) Improved focus on key points
- (-) Slightly increased token usage

## Rewriting Prompts

### Rewrite_v1.0_SystemHeavy
**Goal:** Establish baseline for tone-consistent rewrites.

**Prompt Structure:**
```typescript
{
  role: 'system',
  content: `You are a highly skilled AI text rewriter. Your objective is to rewrite the user's text while precisely preserving the original meaning and all essential information.
CRITICAL: Output *only* the rewritten text. No conversational filler.
Key Requirements:
- Strictly adhere to the requested tone: '${requestedTone}'.
- Maintain this tone consistently throughout the output. ('Formal' = no contractions, sophisticated vocabulary; 'Casual' = contractions, simpler language; 'Creative' = vivid language/analogies, no new facts).
- Ensure the rewritten text is fluent, grammatically perfect, and easy to read.`
}
```

**Parameters:**
- Temperature: 0.7 (default)
- Max Tokens: 1024

**Results:**
- (+) Good tone consistency
- (+) Preserved meaning
- (-) Creative tone sometimes too conservative
- (-) Formal tone occasionally too rigid

### Rewrite_v2.0_FewShot
**Goal:** Enhance tone-specific characteristics using examples.

**Prompt Structure:**
```typescript
// System message (same as v1.0)
// Added examples:
{
  role: 'user',
  content: `Example Text:\n---\n${examples.rewrite[requestedTone].input}\n---`
},
{
  role: 'assistant',
  content: examples.rewrite[requestedTone].output
}
```

**Parameters:**
- Temperature: Dynamic based on tone
  - Formal: 0.5
  - Casual: 0.7
  - Creative: 0.9
- Max Tokens: 1024

**Results:**
- (+) More distinct tone characteristics
- (+) Better creative variations
- (+) More natural casual tone
- (-) Slightly increased token usage

## Key Insights

### Prompt Structure
1. **System-Heavy vs User-Heavy:**
   - System-Heavy: Better for consistent behavior and clear role definition
   - User-Heavy: More flexible for specific task variations

2. **Few-Shot Examples:**
   - Most effective for creative rewrites and very brief summaries
   - Helps establish clear expectations for output style
   - Increases token usage but improves quality

### Parameter Tuning
1. **Temperature:**
   - Lower (0.3-0.5): Better for factual accuracy and consistency
   - Higher (0.7-0.9): Better for creative variations and natural language
   - Dynamic adjustment based on task and tone improves results

2. **Max Tokens:**
   - Dynamic limits based on detail level help control output length
   - 1024 tokens sufficient for most rewrites
   - Smaller limits (256-512) effective for brief summaries

### Best Practices
1. **Clear Instructions:**
   - Use "CRITICAL" for non-negotiable requirements
   - Provide specific examples of desired output format
   - Include explicit tone/style guidelines

2. **Error Prevention:**
   - Explicit output format instructions
   - Clear boundaries for creative variations
   - Specific length/detail level guidance

3. **Quality Control:**
   - Few-shot examples for challenging cases
   - Dynamic parameters based on task requirements
   - Consistent error handling and validation

## Future Improvements
1. **Potential Enhancements:**
   - Add more diverse few-shot examples
   - Experiment with top_p parameter
   - Implement more granular temperature control

2. **Areas for Investigation:**
   - Impact of model updates on prompt effectiveness
   - Performance with different input types
   - Cost/quality tradeoffs of few-shot examples

## Version History
- v1.0: Initial implementation with basic instructions
- v2.0: Added few-shot examples and dynamic parameters
- Current: Combined system-heavy structure with few-shot examples 