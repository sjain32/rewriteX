// THIS MUST BE THE VERY FIRST LINE OF THE FILE
'use client';

// Location: app/page.tsx (or src/app/page.tsx)

// Import the Card components from ShadCN UI
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"; // Ensure this path matches your project structure
console.log("KEY:", process.env.OPENAI_API_KEY); // should print your key

// Import the Textarea, Label, and Button components
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { processTextAction } from './actions';
import { useState } from 'react';
// Import the loader icon
import { Loader2 } from 'lucide-react';

// Import RadioGroup and Select components
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Define possible modes and tones for type safety
export type ProcessingMode = 'summarize' | 'rewrite';
export type RewriteTone = 'formal' | 'casual' | 'creative';

// This remains a Server Component for now
export default function HomePage() {
  // State for the user's input text
  const [inputText, setInputText] = useState<string>('');

  // State for the output text received from the AI
  const [outputText, setOutputText] = useState<string>('');

  // State to track if the Server Action is currently running
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // State to store any error message received from the Server Action
  const [error, setError] = useState<string | null>(null);

  // State for the selected processing mode (summarize or rewrite)
  const [mode, setMode] = useState<ProcessingMode>('summarize');

  // State for the selected rewriting tone
  const [tone, setTone] = useState<RewriteTone>('formal');

  // Define the Submit Handler Function
  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    // Prevent the default form submission behavior
    event.preventDefault();
    console.log("[Client] Form submitted, default prevented.");

    // Set loading state and clear previous results/errors
    setIsLoading(true);
    setError(null);
    setOutputText('');
    console.log("[Client] Set loading state: true");
    console.log("[Client] Current Mode:", mode);
    console.log("[Client] Current Tone:", tone);

    // Call the Server Action
    try {
      console.log('[Client] Calling Server Action processTextAction...');

      // Get the text from state
      const textToProcess = inputText;

      // Prepare options object with mode and tone
      const optionsToSend = {
        mode: mode,
        // Only include tone if mode is 'rewrite'
        tone: mode === 'rewrite' ? tone : undefined,
      };

      // Log the options being sent
      console.log('[Client] Options being sent to Server Action:', optionsToSend);

      // Use await to call the async server action with the new options
      const result = await processTextAction(textToProcess, optionsToSend);

      // Log the raw result from the server action (for debugging)
      console.log('[Client] Server Action returned:', result);

      // Handle the result object with enhanced error checking
      if (result?.result) {
        // Success case: Update output text with the result
        setOutputText(result.result);
        console.log('[Client] Successfully set output text state.');
      } else if (result?.error) {
        // Server-side error case: Display the error message
        // Categorize and format the error message
        const errorMessage = result.error.toLowerCase();
        let formattedError = result.error;

        if (errorMessage.includes('api key')) {
          formattedError = 'Authentication Error: Please check your API configuration.';
        } else if (errorMessage.includes('rate limit')) {
          formattedError = 'Rate Limit Exceeded: Please try again in a few moments.';
        } else if (errorMessage.includes('timeout')) {
          formattedError = 'Request Timeout: The server took too long to respond. Please try again.';
        } else if (errorMessage.includes('invalid input')) {
          formattedError = 'Invalid Input: Please check your text and try again.';
        }

        setError(formattedError);
        console.warn('[Client] Server Action returned an error:', result.error);
      } else {
        // Unexpected response structure
        console.error('[Client] Server Action returned an unexpected object structure:', result);
        setError('An unexpected error occurred. Please try again or contact support if the problem persists.');
      }

    } catch (clientError: unknown) {
      // Catch unexpected errors during the *invocation* of the action
      console.error("[Client] Error invoking server action:", clientError);
      
      // Provide more specific error messages based on the error type
      let errorMessage = 'An unexpected error occurred while communicating with the server.';
      
      if (clientError instanceof Error) {
        if (clientError.message.includes('network')) {
          errorMessage = 'Network Error: Please check your internet connection and try again.';
        } else if (clientError.message.includes('timeout')) {
          errorMessage = 'Connection Timeout: The server took too long to respond. Please try again.';
        }
      }
      
      setError(errorMessage);

    } finally {
      // Set loading state back to false regardless of success or failure
      console.log('[Client] Resetting loading state: false');
      setIsLoading(false);
      console.log('[Client] Loading state reset complete');
    }
  };

  return (
    // Main container: full height, flex column, centered items horizontally, padding
    // We change justify-start to justify-center to center the cards vertically for now
    // We add a gap between flex items using gap-6
    <main className="flex min-h-screen flex-col items-center justify-center p-4 sm:p-8 md:p-12 lg:p-24 bg-gradient-to-b from-background to-muted/40">
      <div className="w-full max-w-3xl space-y-8">
        <h1 className="text-3xl font-bold text-center tracking-tight sm:text-4xl md:text-5xl">
          AI Content Tool
        </h1>
        <p className="text-center text-muted-foreground text-lg">
          Summarize or rewrite your text instantly.
        </p>

        <Card>
          <CardHeader>
            <CardTitle>Input Text & Options</CardTitle>
            <CardDescription>
              Enter text and select processing options below.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* Input Textarea */}
              <div className="grid w-full gap-1.5">
                <Label htmlFor="input-text">Your Text</Label>
                <Textarea
                  id="input-text"
                  placeholder="Paste your text here..."
                  className="min-h-[150px] text-base"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  required
                  disabled={isLoading}
                />
              </div>

              {/* Placeholder for Mode/Tone UI */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                {/* Mode Selection (RadioGroup) */}
                <div className="grid w-full items-center gap-1.5">
                  <Label>Mode</Label>
                  <RadioGroup
                    value={mode}
                    onValueChange={(value) => setMode(value as ProcessingMode)}
                    className="flex items-center space-x-4 pt-1"
                    disabled={isLoading}
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="summarize" id="mode-summarize" />
                      <Label htmlFor="mode-summarize" className="font-normal cursor-pointer">
                        Summarize
                      </Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="rewrite" id="mode-rewrite" />
                      <Label htmlFor="mode-rewrite" className="font-normal cursor-pointer">
                        Rewrite
                      </Label>
                    </div>
                  </RadioGroup>
                </div>

                {/* Tone Selection (Select) */}
                <div className="grid w-full items-center gap-1.5">
                  <Label htmlFor="tone-select">Tone (if rewriting)</Label>
                  <Select
                    value={tone}
                    onValueChange={(value) => setTone(value as RewriteTone)}
                    disabled={mode !== 'rewrite' || isLoading}
                  >
                    <SelectTrigger id="tone-select" className="w-full">
                      <SelectValue placeholder="Select tone..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="formal">Formal</SelectItem>
                      <SelectItem value="casual">Casual</SelectItem>
                      <SelectItem value="creative">Creative</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Submit Button with Loading Spinner */}
              <Button
                type="submit"
                size="lg"
                className="w-full mt-4"
                disabled={isLoading || !inputText.trim()}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Process Text'
                )}
              </Button>
            </CardContent>
          </form>
        </Card>

        {/* Output Section */}
        <Card>
          <CardHeader>
            <CardTitle>Output</CardTitle>
            <CardDescription>
              {isLoading 
                ? "Processing your text..." 
                : outputText 
                  ? "Here's your processed text:" 
                  : "The processed text will appear below."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Error Display Area with Enhanced Styling */}
            {error && (
              <div className="mb-4 p-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-lg text-sm animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <p className="font-medium">Error</p>
                    <p className="text-destructive/90">{error}</p>
                  </div>
                </div>
              </div>
            )}
            {/* Output Textarea with Enhanced State Management */}
            <div className="grid w-full gap-1.5">
              <Label htmlFor="output-text">Result</Label>
              <Textarea
                id="output-text"
                readOnly
                placeholder={isLoading ? "Generating..." : "AI-generated content will be displayed here..."}
                className={`min-h-[150px] text-base transition-opacity duration-200 ${
                  isLoading ? 'opacity-50' : 'opacity-100'
                }`}
                value={outputText}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}