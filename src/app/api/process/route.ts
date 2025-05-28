import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { OpenAIStream, StreamingTextResponse } from 'ai';
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';

// --- Constants for Validation ---
const MAX_INPUT_TEXT_LENGTH = 20000; // Match client-side limit
const MIN_INPUT_TEXT_LENGTH = 10;    // Require at least 10 characters

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

type SummaryDetailLevel = keyof typeof summaryDetailLevels;
const validSummaryLevels = Object.keys(summaryDetailLevels).map(Number) as SummaryDetailLevel[];

// --- Error Response Types ---
type ErrorResponse = {
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

// --- Error Codes ---
const ErrorCodes = {
  // Server Errors (500)
  SERVER_CONFIG_ERROR: 'SERVER_CONFIG_ERROR',
  INTERNAL_SERVER_ERROR: 'INTERNAL_SERVER_ERROR',
  
  // AI Service Errors
  AI_BAD_REQUEST: 'AI_BAD_REQUEST',
  AI_AUTH_ERROR: 'AI_AUTH_ERROR',
  AI_RATE_LIMIT_ERROR: 'AI_RATE_LIMIT_ERROR',
  AI_SERVER_ERROR: 'AI_SERVER_ERROR',
  AI_SERVICE_UNAVAILABLE: 'AI_SERVICE_UNAVAILABLE',
  AI_CONTENT_FILTER: 'AI_CONTENT_FILTER',
  AI_API_ERROR: 'AI_API_ERROR',
  
  // Client Errors (400)
  INVALID_JSON: 'INVALID_JSON',
  VALIDATION_TEXT_MISSING: 'VALIDATION_TEXT_MISSING',
  VALIDATION_TEXT_TOO_SHORT: 'VALIDATION_TEXT_TOO_SHORT',
  VALIDATION_TEXT_TOO_LONG: 'VALIDATION_TEXT_TOO_LONG',
  VALIDATION_INVALID_MODE: 'VALIDATION_INVALID_MODE',
  VALIDATION_INVALID_TONE: 'VALIDATION_INVALID_TONE',
  VALIDATION_INVALID_SUMMARY_LEVEL: 'VALIDATION_INVALID_SUMMARY_LEVEL',
} as const;

type RequestBody = {
  text: string;
  mode: ProcessingMode;
  tone?: RewriteTone;
  summaryLengthLevel?: SummaryDetailLevel;
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
          code: ErrorCodes.SERVER_CONFIG_ERROR,
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
          code: ErrorCodes.INVALID_JSON,
          error: 'Invalid request body: Must be valid JSON.',
        },
        { status: 400 }
      );
    }

    const { text, mode, tone, summaryLengthLevel } = body;

    console.log(`[API Route] Received - Mode: ${mode}, Tone: ${tone ?? 'N/A'}, Summary Level: ${summaryLengthLevel ?? 'N/A'}`);
    console.log('[API Route] Input Text (start):', text?.substring(0, 50) + '...');

    // 2. --- Server-Side Validation ---
    // Check 2a: Basic Text Presence
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      console.log('[API Route] Validation Error: Input text is missing or empty.');
      return NextResponse.json<ErrorResponse>(
        {
          code: ErrorCodes.VALIDATION_TEXT_MISSING,
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
          code: ErrorCodes.VALIDATION_TEXT_TOO_SHORT,
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
          code: ErrorCodes.VALIDATION_TEXT_TOO_LONG,
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
          code: ErrorCodes.VALIDATION_INVALID_MODE,
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
            code: ErrorCodes.VALIDATION_INVALID_SUMMARY_LEVEL,
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
            code: ErrorCodes.VALIDATION_INVALID_TONE,
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
    console.log('[API Route] Validation Passed.');

    // 3. --- Prompt Construction ---
    let messages: ChatCompletionMessageParam[] = [];
    const requestedTone = tone ?? 'formal';
    const requestedLengthLevel = summaryLengthLevel ?? 3;
    const requestedLengthDesc = summaryDetailLevels[requestedLengthLevel];

    if (mode === 'summarize') {
      console.log(`[API Route] Constructing Summarization Prompt (Detail: ${requestedLengthDesc}).`);
      messages = [
        {
          role: 'system',
          content: `You are a highly skilled AI assistant specialized in summarizing text. Your goal is to extract the absolute key points and main argument concisely. Prioritize identifying and stating the single most important conclusion or finding first. The user desires a summary with a detail level described as '${requestedLengthDesc}'. Adjust the length and level of detail accordingly, focusing on factual information only. A 'Very Brief' summary should be just one or two key sentences. A 'Detailed' summary should cover all major sections or arguments. Adjust intermediate levels proportionally. Generate only the summary text as output. Do not include any conversational filler, preamble, or concluding remarks.`
        },
        {
          role: 'user',
          content: `Please summarize the following text for a general audience, aiming for a '${requestedLengthDesc}' level of detail. Focus on the core argument and essential supporting points only. Ensure the summary flows well and is easy to understand. Output *only* the summary text, without any introductory phrases like "Here is the summary:".

---
${text}
---`
        }
      ];
    } else { // mode === 'rewrite'
      console.log(`[API Route] Constructing Rewriting Prompt (Tone: ${requestedTone}).`);
      messages = [
        {
          role: 'system',
          content: `You are an expert AI text rewriter. Your task is to rewrite the provided text, meticulously maintaining the original meaning and all key information, but adjusting the style to a '${requestedTone}' tone. Adhere strictly and consistently to the requested tone throughout the entire rewritten text. For example, a 'casual' tone should use contractions and simpler language, while a 'formal' tone should avoid them, use more sophisticated vocabulary, and maintain a professional, objective stance. For the 'creative' tone, use evocative language, metaphors, or analogies where appropriate to make the text more engaging, while preserving the original meaning. Generate only the rewritten text as output. Do not include any conversational filler, preamble, or concluding remarks.`
        },
        {
          role: 'user',
          content: `Rewrite the following text in a '${requestedTone}' tone. Ensure the core message remains identical to the original. If rewriting in a 'creative' tone, make this text significantly more engaging and imaginative using vivid language or analogies, but do not invent new facts or change the fundamental meaning.

---
${text}
---`
        }
      ];
    }

    // 4. --- LLM API Call (Streaming) ---
    console.log('[API Route] Calling OpenAI API with stream: true...');
    const response = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      stream: true,
      messages: messages,
      temperature: 0.7,
    });
    console.log('[API Route] OpenAI stream initiated.');

    // 5. --- Stream Processing and Response ---
    const stream = OpenAIStream(response);
    console.log('[API Route] Returning StreamingTextResponse.');
    return new StreamingTextResponse(stream);

  } catch (error: unknown) {
    // --- Enhanced Error Handling ---
    console.error('[API Route /api/process] Error caught:', error);

    let errorMessage = 'An unexpected error occurred while processing your request.';
    let statusCode = 500;
    let errorCode = ErrorCodes.INTERNAL_SERVER_ERROR;
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
            ? ErrorCodes.AI_CONTENT_FILTER 
            : ErrorCodes.AI_BAD_REQUEST;
          errorMessage = error.code === 'content_filter'
            ? 'Your request was blocked due to the AI service\'s content policy. Please modify your input text.'
            : `The request to the AI service was invalid. ${error.message || 'Please check your input or configuration.'}`;
          errorDetails = {
            code: error.code,
            type: error.type,
          };
          break;

        case 401: // Unauthorized
          errorCode = ErrorCodes.AI_AUTH_ERROR;
          errorMessage = 'Authentication with the AI service failed. Please check server configuration.';
          errorDetails = {
            type: error.type,
          };
          break;

        case 429: // Rate Limit
          errorCode = ErrorCodes.AI_RATE_LIMIT_ERROR;
          errorMessage = 'The AI service is experiencing high traffic or rate limits have been exceeded. Please try again shortly.';
          errorDetails = {
            type: error.type,
            headers: error.headers,
          };
          break;

        case 500: // OpenAI Internal Error
          errorCode = ErrorCodes.AI_SERVER_ERROR;
          errorMessage = 'The AI service encountered an internal error. Please try again later.';
          errorDetails = {
            type: error.type,
          };
          break;

        case 503: // Service Unavailable
          errorCode = ErrorCodes.AI_SERVICE_UNAVAILABLE;
          errorMessage = 'The AI service is temporarily unavailable or overloaded. Please try again later.';
          errorDetails = {
            type: error.type,
          };
          break;

        default:
          errorCode = ErrorCodes.AI_API_ERROR;
          errorMessage = `An error occurred with the AI service (Status: ${error.status}). ${error.message || 'Please try again.'}`;
          errorDetails = {
            status: error.status,
            code: error.code,
            type: error.type,
          };
      }
    } else if (error instanceof Error) {
      errorMessage = error.message;
      errorCode = ErrorCodes.INTERNAL_SERVER_ERROR;
      
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