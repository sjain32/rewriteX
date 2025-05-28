'use server';

// This file will contain server actions for processing text with OpenAI
// Server actions are functions that run exclusively on the server

// Import the OpenAI client
import OpenAI from 'openai';
// Import the specific type for Chat Completion Messages
import { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
// Import OpenAI error types
import { APIError, RateLimitError, APIConnectionError } from 'openai';
import 'dotenv/config';
// Define the types for processing options
type ProcessingMode = 'summarize' | 'rewrite';
type RewriteTone = 'formal' | 'casual' | 'creative';

// Define the specific options type for the server action
type ProcessTextOptions = {
  mode: ProcessingMode;
  tone?: RewriteTone;
};

// Define the response type for better type safety
type ProcessTextResponse = {
  result?: string;
  error?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  finish_reason?: string;
  model?: string;
  success: boolean;
  errorType?: string;
  isStreaming?: boolean;
};

// Define the streaming response type
type StreamingResponse = {
  content: string;
  done: boolean;
  error?: string;
};

// --- OpenAI Client Initialization ---
// Get API key from environment variable
const apiKey = process.env.OPENAI_API_KEY;

// Log environment variable status (without exposing the key)
console.log('[OpenAI Client] Environment check:', {
  hasApiKey: !!apiKey,
  keyLength: apiKey ? apiKey.length : 0,
  environment: process.env.NODE_ENV
});

// Initialize the OpenAI client instance
let openai: OpenAI | null = null;

if (apiKey) {
  try {
    openai = new OpenAI({
      apiKey: apiKey,
      // Optional: You can specify other settings like organization ID, timeouts, etc.
      // organization: process.env.OPENAI_ORGANIZATION_ID,
      dangerouslyAllowBrowser: false // Ensure this remains false for server-side use
    });
    console.log('[OpenAI Client] Initialized successfully.');
  } catch (error) {
    console.error('[OpenAI Client] Error initializing client:', error);
  }
} else {
  console.error('[OpenAI Client] CRITICAL ERROR: OpenAI API Key is missing. Please check your .env.local file and ensure the server was restarted.');
  console.error('[OpenAI Client] Expected environment variable: OPENAI_API_KEY');
  console.error('[OpenAI Client] Current environment variables:', Object.keys(process.env));
}
// --- End of OpenAI Client Initialization ---

/**
 * Constructs a system message based on the processing options
 * @param options The processing options provided by the user
 * @returns A well-crafted system message for the AI
 */
function constructSystemMessage(options: ProcessTextOptions): string {
  const mode = options.mode;
  const tone = options.tone || 'formal'; // Default to formal if not specified

  if (mode === 'summarize') {
    return 'You are a highly skilled AI assistant specialized in summarizing text concisely and accurately. Focus on extracting the key points and main ideas while maintaining the original meaning.';
  } else {
    // Rewrite mode with tone guidance
    const toneGuidance = {
      formal: 'using professional and academic language, maintaining a serious and authoritative tone',
      casual: 'using conversational and friendly language, making the text more approachable and relaxed',
      creative: 'using engaging and imaginative language, adding flair while preserving the core message'
    }[tone];

    return `You are an expert AI text rewriter. Your task is to rewrite the provided text ${toneGuidance}. Maintain the original meaning while adapting the style to match the requested tone.`;
  }
}

/**
 * Constructs the user message based on the processing options
 * @param text The input text to process
 * @param options The processing options provided by the user
 * @returns A well-crafted user message for the AI
 */
function constructUserMessage(text: string, options: ProcessTextOptions): string {
  const mode = options.mode;
  const tone = options.tone || 'formal';

  if (mode === 'summarize') {
    return `Please summarize the following text, focusing on the key points and main ideas:\n\n---\n${text}\n---`;
  } else {
    return `Rewrite the following text in a ${tone} tone, maintaining the original meaning but adjusting the style:\n\n---\n${text}\n---`;
  }
}

/**
 * Handles OpenAI API errors and returns appropriate error response
 * @param error The error object caught from the API call
 * @returns A structured error response
 */
function handleOpenAIError(error: unknown): ProcessTextResponse {
  console.error('[Server Action] OpenAI API Error:', error);

  // Default error message and type
  let errorMessage = 'An unexpected error occurred while processing the text.';
  let errorType = 'UNKNOWN_ERROR';

  if (error instanceof APIError) {
    errorType = 'API_ERROR';
    errorMessage = `OpenAI API Error (${error.status}): ${error.message}`;
    console.error('[Server Action] API Error Details:', {
      status: error.status,
      code: error.code,
      type: error.type,
      message: error.message
    });
  } else if (error instanceof RateLimitError) {
    errorType = 'RATE_LIMIT_ERROR';
    errorMessage = 'Rate limit exceeded. Please try again in a few moments.';
    console.error('[Server Action] Rate Limit Error:', error.message);
  } else if (error instanceof APIConnectionError) {
    errorType = 'CONNECTION_ERROR';
    errorMessage = 'Failed to connect to OpenAI API. Please check your internet connection.';
    console.error('[Server Action] Connection Error:', error.message);
  } else if (error instanceof Error) {
    // Check for timeout in the error message
    if (error.message.toLowerCase().includes('timeout')) {
      errorType = 'TIMEOUT_ERROR';
      errorMessage = 'Request timed out. Please try again.';
    } else {
      errorType = 'GENERAL_ERROR';
      errorMessage = `Error: ${error.message}`;
    }
    console.error('[Server Action] General Error:', error.message);
  } else {
    errorType = 'UNKNOWN_ERROR';
    errorMessage = `An unexpected error occurred: ${String(error)}`;
    console.error('[Server Action] Unknown Error Type:', error);
  }

  return {
    error: errorMessage,
    errorType,
    success: false
  };
}

/**
 * Server Action to process the input text using an LLM with streaming support.
 * This function runs exclusively on the server.
 *
 * @param text The user's input text.
 * @param options Configuration options selected by the user.
 * @returns An async generator that yields streaming responses.
 */
export async function* processTextAction(
  text: string,
  options: ProcessTextOptions
): AsyncGenerator<StreamingResponse, void, unknown> {
  console.log('[Server Action Called] processTextAction');
  console.log('[Server Action] Starting streaming request with options:', {
    mode: options.mode,
    tone: options.tone,
    textLength: text.length
  });

  // Check if OpenAI client is available before proceeding
  if (!openai) {
    const errorMessage = 'Server configuration error: AI service is unavailable. Please check server logs.';
    console.error('[Server Action] Cannot proceed:', errorMessage);
    yield { content: '', done: true, error: errorMessage };
    return;
  }

  // Check if input text is provided
  if (!text || text.trim() === '') {
    const errorMessage = 'Input text cannot be empty.';
    console.log('[Server Action]', errorMessage);
    yield { content: '', done: true, error: errorMessage };
    return;
  }

  console.log(
    '[Server Action Data] Received text (first 100 chars):',
    text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '(empty)'
  );

  try {
    console.log('[Server Action] Calling OpenAI Chat Completions API with streaming...');

    // Define the model to use
    const model = 'gpt-3.5-turbo';

    // Construct the messages payload for the Chat Completions API
    const messages: ChatCompletionMessageParam[] = [
      {
        role: 'system',
        content: constructSystemMessage(options)
      },
      {
        role: 'user',
        content: constructUserMessage(text, options)
      }
    ];

    console.log('[Server Action] Sending streaming request to OpenAI API with config:', {
      model,
      temperature: options.tone === 'creative' ? 0.8 : 0.7,
      max_tokens: 500,
      presence_penalty: 0.6,
      frequency_penalty: 0.3
    });

    // Execute the API call using the configured client with streaming enabled
    const stream = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: options.tone === 'creative' ? 0.8 : 0.7,
      max_tokens: 500,
      presence_penalty: 0.6,
      frequency_penalty: 0.3,
      stream: true,
    });

    console.log('[Server Action] Stream established, beginning to process chunks...');

    // Process the stream
    let accumulatedContent = '';
    let chunkCount = 0;
    const startTime = Date.now();

    for await (const chunk of stream) {
      chunkCount++;
      const content = chunk.choices[0]?.delta?.content || '';
      
      if (content) {
        accumulatedContent += content;
        yield { content, done: false };
      }

      // Log progress every 10 chunks
      if (chunkCount % 10 === 0) {
        console.log(`[Server Action] Processed ${chunkCount} chunks, current length: ${accumulatedContent.length}`);
      }
    }

    const duration = Date.now() - startTime;
    console.log('[Server Action] Stream processing complete:', {
      totalChunks: chunkCount,
      finalLength: accumulatedContent.length,
      duration: `${duration}ms`,
      averageChunkSize: (accumulatedContent.length / chunkCount).toFixed(2)
    });

    // Send final response
    yield { content: accumulatedContent, done: true };

  } catch (error: unknown) {
    const errorResponse = handleOpenAIError(error);
    console.error('[Server Action] Stream processing error:', errorResponse);
    yield { content: '', done: true, error: errorResponse.error };
  }
}

export async function processText(text: string) {
  if (!text) {
    return { error: 'No text provided' };
  }

  // Check if OpenAI client is available
  if (!openai) {
    return { error: 'AI service is not properly configured. Please contact support.' };
  }

  try {
    // Placeholder for OpenAI API integration
    return { 
      success: true,
      result: 'This is a placeholder response. OpenAI integration coming soon!'
    };
  } catch (error) {
    console.error('Error processing text:', error);
    return { 
      error: 'Failed to process text. Please try again.' 
    };
  }
} 