import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { TargetAudience, SummaryFormat, RewriteGoal } from '@/types/history';

// --- Constants for Validation ---
const MAX_INPUT_TEXT_LENGTH = 20000; // Match client-side limit
const MIN_INPUT_TEXT_LENGTH = 10;    // Require at least 10 characters
const DEFAULT_MODEL = 'gpt-3.5-turbo';
const VALID_MODELS = ['gpt-3.5-turbo', 'gpt-4'] as const;

// --- Type Definitions ---
export type ProcessingMode = 'summarize' | 'rewrite';
export type RewriteTone = 'formal' | 'casual' | 'creative';
const validTones: RewriteTone[] = ['formal', 'casual', 'creative'];

const summaryDetailLevels = {
  1: 'Very Brief',
  2: 'Short',
  3: 'Medium',
  4: 'Long',
  5: 'Detailed',
} as const;

export type SummaryDetailLevel = keyof typeof summaryDetailLevels;
const validSummaryLevels = Object.keys(summaryDetailLevels).map(Number) as SummaryDetailLevel[];

// Add example definitions after the type definitions
const examples = {
  summarize: {
    veryBrief: {
      input: "The meteorological forecast predicts significant precipitation commencing in the early morning hours, potentially impacting commuter routes. Atmospheric pressure is dropping, indicating an approaching low-pressure system. Temperatures will remain moderate.",
      output: "Heavy rain expected early tomorrow, may affect commutes."
    },
    detailed: {
      input: "The company's Q3 financial report shows a 15% revenue increase, driven by strong performance in the European market. Operating costs rose by 8%, primarily due to expanded R&D investments. The board approved a new dividend policy, increasing shareholder returns by 20%.",
      output: "The company achieved 15% revenue growth in Q3, led by European market success. While operating costs increased 8% due to R&D expansion, the board responded with a 20% dividend increase for shareholders."
    }
  },
  rewrite: {
    creative: {
      input: "The company announced its quarterly earnings, showing a 10% increase in profit.",
      output: "The company's coffers swelled this quarter, boasting a shiny 10% boost in profits as announced."
    },
    formal: {
      input: "The new product launch was a huge success, with sales going through the roof!",
      output: "The product launch achieved exceptional market performance, with sales exceeding all projections."
    },
    casual: {
      input: "The implementation of the new policy resulted in a significant reduction in operational costs.",
      output: "The new policy really helped cut down on costs, making things run more smoothly around here."
    }
  }
} as const;

// Add parameter constants after the examples definition
const LLM_PARAMS = {
  'gpt-3.5-turbo': {
    temperature: {
      summarize: {
        veryBrief: 0.3,
        default: 0.5,
        detailed: 0.7
      },
      rewrite: {
        formal: 0.5,
        casual: 0.7,
        creative: 0.9
      }
    },
    maxTokens: {
      summarize: {
        veryBrief: 256,
        default: 512,
        detailed: 1024
      },
      rewrite: {
        default: 1024
      }
    }
  },
  'gpt-4': {
    temperature: {
      summarize: {
        veryBrief: 0.2,
        default: 0.4,
        detailed: 0.6
      },
      rewrite: {
        formal: 0.4,
        casual: 0.6,
        creative: 0.8
      }
    },
    maxTokens: {
      summarize: {
        veryBrief: 512,
        default: 1024,
        detailed: 2048
      },
      rewrite: {
        default: 2048
      }
    }
  }
} as const;

// --- Error Response Types ---
type ErrorResponse = {
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

// --- Error Codes ---
type ErrorCode = 
  | 'INTERNAL_SERVER_ERROR'
  | 'MISSING_API_KEY'
  | 'INVALID_API_KEY'
  | 'MISSING_TEXT'
  | 'INVALID_TEXT_TYPE'
  | 'TEXT_TOO_SHORT'
  | 'TEXT_TOO_LONG'
  | 'INVALID_MODE'
  | 'MISSING_TONE'
  | 'INVALID_TONE'
  | 'MISSING_SUMMARY_LEVEL'
  | 'INVALID_SUMMARY_LEVEL'
  | 'AI_BAD_REQUEST'
  | 'AI_AUTH_ERROR'
  | 'AI_RATE_LIMIT_ERROR'
  | 'AI_SERVER_ERROR'
  | 'AI_SERVICE_UNAVAILABLE'
  | 'AI_API_ERROR'
  | 'AI_CONTENT_FILTER'
  | 'INVALID_MODEL';

type RequestBody = {
  text: string;
  mode: ProcessingMode;
  tone?: RewriteTone;
  summaryLengthLevel?: SummaryDetailLevel;
  targetAudience: TargetAudience;
  summaryFormat?: SummaryFormat;
  rewriteGoal?: RewriteGoal;
  model: 'gpt-3.5-turbo' | 'gpt-4';
  promptStructure?: 'system-heavy' | 'user-heavy';
};

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const runtime = 'edge';

export async function POST(req: NextRequest) {
  console.log('[API Route /api/process] Received POST request');

  try {
    // --- Essential Prerequisite Check: API Key ---
    if (!process.env.OPENAI_API_KEY) {
      console.error('[API Route] Server Configuration Error: OpenAI API Key is missing.');
      return NextResponse.json<ErrorResponse>(
        {
          code: 'MISSING_API_KEY',
          error: 'Server configuration error. Please contact the administrator.',
        },
        { status: 500 }
      );
    }

    // 1. --- Input Reception & Parsing ---
    let body: RequestBody;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error('[API Route] Invalid JSON body:', parseError);
      return NextResponse.json<ErrorResponse>(
        {
          code: 'INVALID_JSON',
          error: 'Invalid request body: Must be valid JSON.',
        },
        { status: 400 }
      );
    }

    const { text, mode, tone, summaryLengthLevel, promptStructure = 'system-heavy', model } = body;

    console.log(`[API Route] Received - Mode: ${mode}, Tone: ${tone ?? 'N/A'}, Summary Level: ${summaryLengthLevel ?? 'N/A'}`);
    console.log('[API Route] Input Text (start):', text?.substring(0, 50) + '...');

    // 2. --- Server-Side Validation ---
    // Check 2a: Basic Text Presence
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('[API Route] Validation Error: Input text is missing or empty.');
      return NextResponse.json<ErrorResponse>(
        {
          code: 'MISSING_TEXT',
          error: 'Input text cannot be empty.',
        },
        { status: 400 }
      );
    }

    // Check 2b: Text Length Limits
    const trimmedTextLength = text.trim().length;
    if (trimmedTextLength < MIN_INPUT_TEXT_LENGTH) {
      console.log(`[API Route] Validation Error: Input text too short (${trimmedTextLength} chars).`);
      return NextResponse.json<ErrorResponse>(
        {
          code: 'TEXT_TOO_SHORT',
          error: `Input text is too short. Please provide at least ${MIN_INPUT_TEXT_LENGTH} characters.`,
          details: { minLength: MIN_INPUT_TEXT_LENGTH, actualLength: trimmedTextLength },
        },
        { status: 400 }
      );
    }
    if (trimmedTextLength > MAX_INPUT_TEXT_LENGTH) {
      console.log(`[API Route] Validation Error: Input text too long (${trimmedTextLength} chars).`);
      return NextResponse.json<ErrorResponse>(
        {
          code: 'TEXT_TOO_LONG',
          error: `Input text is too long. Please limit input to ${MAX_INPUT_TEXT_LENGTH} characters.`,
          details: { maxLength: MAX_INPUT_TEXT_LENGTH, actualLength: trimmedTextLength },
        },
        { status: 400 }
      );
    }

    // Check 2c: Mode Validity
    if (!mode || (mode !== 'summarize' && mode !== 'rewrite')) {
      console.log(`[API Route] Validation Error: Invalid mode specified: ${mode}`);
      return NextResponse.json<ErrorResponse>(
        {
          code: 'INVALID_MODE',
          error: `Invalid processing mode specified. Must be 'summarize' or 'rewrite'.`,
          details: { receivedMode: mode },
        },
        { status: 400 }
      );
    }

    // Check 2d: Required Options Based on Mode
    if (mode === 'summarize') {
      if (summaryLengthLevel === undefined || summaryLengthLevel === null || !validSummaryLevels.includes(summaryLengthLevel)) {
        console.log(`[API Route] Validation Error: Invalid or missing summary detail level for summarize mode. Received: ${summaryLengthLevel}`);
        return NextResponse.json<ErrorResponse>(
          {
            code: 'MISSING_SUMMARY_LEVEL',
            error: `Invalid or missing summary detail level specified for summarize mode. Must be between ${validSummaryLevels[0]} and ${validSummaryLevels[validSummaryLevels.length - 1]}.`,
            details: { 
              receivedLevel: summaryLengthLevel,
              validLevels: validSummaryLevels,
            },
          },
          { status: 400 }
        );
      }
    } else { // mode === 'rewrite'
      if (!tone || !validTones.includes(tone)) {
        console.log(`[API Route] Validation Error: Invalid or missing tone for rewrite mode. Received: ${tone}`);
        return NextResponse.json<ErrorResponse>(
          {
            code: 'MISSING_TONE',
            error: `Invalid or missing tone specified for rewrite mode. Must be one of: ${validTones.join(', ')}.`,
            details: { 
              receivedTone: tone,
              validTones,
            },
          },
          { status: 400 }
        );
      }
    }

    // Check 2e: Model Validation
    if (!model || !VALID_MODELS.includes(model as typeof VALID_MODELS[number])) {
      console.log(`[API Route] Validation Error: Invalid or missing model. Received: ${model}`);
      return NextResponse.json<ErrorResponse>(
        {
          code: 'INVALID_MODEL',
          error: `Invalid or missing model specified. Must be one of: ${VALID_MODELS.join(', ')}.`,
          details: { 
            receivedModel: model,
            validModels: VALID_MODELS,
          },
        },
        { status: 400 }
      );
    }

    // Ensure we have a valid model for the API call
    const selectedModel = VALID_MODELS.includes(model as typeof VALID_MODELS[number]) 
      ? model 
      : DEFAULT_MODEL;

    console.log('[API Route] Validation Passed.');

    // 3. --- Prompt Construction ---
    let messages: ChatCompletionMessageParam[] = [];
    const requestedTone = tone ?? 'formal';
    const requestedLengthLevel = summaryLengthLevel ?? 3;
    const requestedLengthDesc = summaryDetailLevels[requestedLengthLevel];

    if (mode === 'summarize') {
      if (promptStructure === 'system-heavy') {
        messages = [
          {
            role: 'system',
            content: `You are an expert AI text summarizer. Your task is to produce a concise and accurate summary of the user's text.
CRITICAL: Output *only* the summarized text. Do not include any introductory phrases, greetings, or conversational filler like "Here is the summary:".
Key Requirements:
- Adhere strictly to the requested detail level: '${requestedLengthDesc}'. Adjust length and detail accordingly.
- Focus on extracting the main argument and key factual points.
- Target audience is general; explain complex ideas simply if possible.
- Ensure the summary flows well and is grammatically correct.`
          },
          // Add relevant example based on requested detail level
          {
            role: 'user',
            content: `Example Text:\n---\n${examples.summarize[requestedLengthLevel <= 2 ? 'veryBrief' : 'detailed'].input}\n---`
          },
          {
            role: 'assistant',
            content: examples.summarize[requestedLengthLevel <= 2 ? 'veryBrief' : 'detailed'].output
          },
          {
            role: 'user',
            content: `Please process the following text according to the requirements defined in the system prompt:\n\n---\n${text}\n---`
          }
        ];
      } else { // user-heavy
        messages = [
          {
            role: 'system',
            content: `You are a helpful AI assistant capable of text processing.`
          },
          // Add relevant example based on requested detail level
          {
            role: 'user',
            content: `Example Text:\n---\n${examples.summarize[requestedLengthLevel <= 2 ? 'veryBrief' : 'detailed'].input}\n---`
          },
          {
            role: 'assistant',
            content: examples.summarize[requestedLengthLevel <= 2 ? 'veryBrief' : 'detailed'].output
          },
          {
            role: 'user',
            content: `Task: Summarize the following text.\nInput Text:\n---\n${text}\n---\nConstraints:\n- Requested Detail Level: '${requestedLengthDesc}'. Adjust summary length and detail accordingly.\n- Focus: Extract main argument and key factual points.\n- Audience: General audience, simplify complex ideas.\n- Quality: Ensure good flow and grammar.\n- Output Format: Output *only* the summarized text, without any introductory phrases.`
          }
        ];
      }
    } else { // mode === 'rewrite'
      if (promptStructure === 'system-heavy') {
        messages = [
          {
            role: 'system',
            content: `You are a highly skilled AI text rewriter. Your objective is to rewrite the user's text while precisely preserving the original meaning and all essential information.
CRITICAL: Output *only* the rewritten text. No conversational filler.
Key Requirements:
- Strictly adhere to the requested tone: '${requestedTone}'.
- Maintain this tone consistently throughout the output. ('Formal' = no contractions, sophisticated vocabulary; 'Casual' = contractions, simpler language; 'Creative' = vivid language/analogies, no new facts).
- Ensure the rewritten text is fluent, grammatically perfect, and easy to read.`
          },
          // Add example for the requested tone
          {
            role: 'user',
            content: `Example Text:\n---\n${examples.rewrite[requestedTone].input}\n---`
          },
          {
            role: 'assistant',
            content: examples.rewrite[requestedTone].output
          },
          {
            role: 'user',
            content: `Please rewrite the following text based on the system prompt instructions:\n\n---\n${text}\n---`
          }
        ];
      } else { // user-heavy
        messages = [
          {
            role: 'system',
            content: `You are a helpful AI assistant capable of text processing.`
          },
          // Add example for the requested tone
          {
            role: 'user',
            content: `Example Text:\n---\n${examples.rewrite[requestedTone].input}\n---`
          },
          {
            role: 'assistant',
            content: examples.rewrite[requestedTone].output
          },
          {
            role: 'user',
            content: `Task: Rewrite the following text.\nInput Text:\n---\n${text}\n---\nConstraints:\n- Requested Tone: '${requestedTone}'. Adhere strictly and consistently. Maintain original meaning precisely. ('Formal' = no contractions, etc.; 'Casual' = contractions, etc.; 'Creative' = vivid language/analogies, no new facts).\n- Quality: Ensure fluency and perfect grammar.\n- Output Format: Output *only* the rewritten text, no conversational filler.`
          }
        ];
      }
    }

    // 4. --- LLM API Call (Streaming) ---
    console.log('[API Route] Calling OpenAI API with stream: true...');
    const response = await openai.chat.completions.create({
      model: selectedModel,
      stream: true,
      messages: messages,
      temperature: mode === 'summarize' 
        ? (requestedLengthLevel <= 2 
          ? LLM_PARAMS[selectedModel].temperature.summarize.veryBrief 
          : requestedLengthLevel >= 4 
            ? LLM_PARAMS[selectedModel].temperature.summarize.detailed 
            : LLM_PARAMS[selectedModel].temperature.summarize.default)
        : LLM_PARAMS[selectedModel].temperature.rewrite[requestedTone],
      max_tokens: mode === 'summarize'
        ? (requestedLengthLevel <= 2
          ? LLM_PARAMS[selectedModel].maxTokens.summarize.veryBrief
          : requestedLengthLevel >= 4
            ? LLM_PARAMS[selectedModel].maxTokens.summarize.detailed
            : LLM_PARAMS[selectedModel].maxTokens.summarize.default)
        : LLM_PARAMS[selectedModel].maxTokens.rewrite.default
    });
    console.log('[API Route] OpenAI stream initiated.');

    // 5. --- Stream Processing and Response ---
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const stream = OpenAIStream(response as any, {
      onCompletion: () => {
        console.log('[API Route] Stream completed successfully');
      }
    });
    console.log('[API Route] Returning StreamingTextResponse.');
    return new StreamingTextResponse(stream);

  } catch (error: unknown) {
    // --- Enhanced Error Handling ---
    console.error('[API Route /api/process] Error caught:', error);

    let errorMessage = 'An unexpected error occurred while processing your request.';
    let statusCode = 500;
    let errorCode: ErrorCode = 'INTERNAL_SERVER_ERROR';
    let errorDetails: Record<string, unknown> | undefined;

    // Check if it's an OpenAI API error
    if (error instanceof OpenAI.APIError) {
      statusCode = error.status || 500;
      console.error(`[API Route] OpenAI API Error Details:`, {
        status: error.status,
        code: error.code,
        type: error.type,
        message: error.message,
        headers: error.headers,
      });

      // Handle specific status codes
      switch (error.status) {
        case 400: // Bad Request
          errorCode = error.code === 'content_filter' 
            ? 'AI_CONTENT_FILTER' 
            : 'AI_BAD_REQUEST';
          errorMessage = error.code === 'content_filter'
            ? 'Your request was blocked due to the AI service\'s content policy. Please modify your input text.'
            : `The request to the AI service was invalid. ${error.message || 'Please check your input or configuration.'}`;
          errorDetails = {
            code: error.code,
            type: error.type,
          };
          break;

        case 401: // Unauthorized
          errorCode = 'AI_AUTH_ERROR';
          errorMessage = 'Authentication with the AI service failed. Please check server configuration.';
          errorDetails = {
            type: error.type,
          };
          break;

        case 429: // Rate Limit
          errorCode = 'AI_RATE_LIMIT_ERROR';
          errorMessage = 'The AI service is experiencing high traffic or rate limits have been exceeded. Please try again shortly.';
          errorDetails = {
            type: error.type,
            headers: error.headers,
          };
          break;

        case 500: // Server Error
          errorCode = 'AI_SERVER_ERROR';
          errorMessage = 'The AI service encountered an internal error. Please try again later.';
          errorDetails = {
            type: error.type,
          };
          break;

        case 503: // Service Unavailable
          errorCode = 'AI_SERVICE_UNAVAILABLE';
          errorMessage = 'The AI service is temporarily unavailable or overloaded. Please try again later.';
          errorDetails = {
            type: error.type,
          };
          break;

        default:
          errorCode = 'AI_API_ERROR';
          errorMessage = `An error occurred with the AI service (Status: ${error.status}). ${error.message || 'Please try again.'}`;
          errorDetails = {
            status: error.status,
            code: error.code,
            type: error.type,
          };
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorCode = 'INTERNAL_SERVER_ERROR';
      
      if (process.env.NODE_ENV !== 'development') {
        errorMessage = 'An unexpected error occurred.';
      } else {
        errorDetails = {
          name: error.name,
          stack: error.stack,
        };
      }
      console.error(`[API Route] Generic Error Details:`, {
        name: error.name,
        message: error.message,
        stack: error.stack,
      });
    } else {
      console.error('[API Route] Unknown error type:', error);
    }

    console.log(`[API Route] Sending error response:`, {
      status: statusCode,
      code: errorCode,
      message: errorMessage,
      details: errorDetails,
    });

    return NextResponse.json<ErrorResponse>(
      {
        code: errorCode,
        error: errorMessage,
        details: errorDetails,
      },
      { status: statusCode }
    );
  }
} 