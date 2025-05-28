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
 * Server Action to process the input text using an LLM.
 * This function runs exclusively on the server.
 *
 * @param text The user's input text.
 * @param options Configuration options selected by the user.
 * @returns The processed text or an error message.
 */
export async function processTextAction(
  text: string,
  options: ProcessTextOptions
): Promise<ProcessTextResponse> {
  console.log('[Server Action Called] processTextAction');

  // Log received options for verification
  console.log('[Server Action Options] Received mode:', options.mode);
  console.log('[Server Action Options] Received tone:', options.tone ?? '(not applicable)');

  // Check if OpenAI client is available before proceeding
  if (!openai) {
    const errorMessage = 'Server configuration error: AI service is unavailable. Please check server logs.';
    console.error('[Server Action] Cannot proceed:', errorMessage);
    return { 
      error: errorMessage,
      errorType: 'CONFIGURATION_ERROR',
      success: false 
    };
  }

  // Check if input text is provided
  if (!text || text.trim() === '') {
    const errorMessage = 'Input text cannot be empty.';
    console.log('[Server Action]', errorMessage);
    return { 
      error: errorMessage,
      errorType: 'VALIDATION_ERROR',
      success: false 
    };
  }

  console.log(
    '[Server Action Data] Received text (first 100 chars):',
    text ? (text.length > 100 ? text.substring(0, 100) + '...' : text) : '(empty)'
  );

  try {
    console.log('[Server Action] Calling OpenAI Chat Completions API...');

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

    // Execute the API call using the configured client
    console.log('[Server Action] Sending request to OpenAI API...');
    const completion = await openai.chat.completions.create({
      model: model,
      messages: messages,
      temperature: options.tone === 'creative' ? 0.8 : 0.7, // Higher temperature for creative tone
      max_tokens: 500, // Increased token limit for better responses
      presence_penalty: 0.6, // Encourage diverse vocabulary
      frequency_penalty: 0.3, // Discourage repetition
    });

    console.log('[Server Action] Received response from OpenAI API');

    // Extract the response content and metadata
    if (completion.choices && completion.choices.length > 0) {
      const choice = completion.choices[0];
      const result = choice.message?.content?.trim(); // Added trim() to remove extra whitespace
      
      if (result) {
        console.log('[Server Action] Successfully processed response');
        console.log('[Server Action] Finish reason:', choice.finish_reason);
        console.log('[Server Action] Token usage:', completion.usage);
        
        return {
          result,
          usage: completion.usage,
          finish_reason: choice.finish_reason,
          model: completion.model,
          success: true
        };
      } else {
        const errorMessage = 'No content generated in the response.';
        console.log('[Server Action]', errorMessage);
        console.log('[Server Action] Response structure:', JSON.stringify(completion, null, 2));
        return { 
          error: errorMessage,
          errorType: 'EMPTY_RESPONSE',
          success: false 
        };
      }
    }

    const errorMessage = 'Failed to generate a response. Please try again.';
    console.log('[Server Action]', errorMessage);
    console.log('[Server Action] Full response:', JSON.stringify(completion, null, 2));
    return { 
      error: errorMessage,
      errorType: 'NO_CHOICES',
      success: false 
    };

  } catch (error: unknown) {
    return handleOpenAIError(error);
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