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
import { useState, Suspense } from 'react';
// Import the loader icon
import { Loader2, Copy, RotateCcw, Save } from 'lucide-react';

// Import RadioGroup and Select components
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// Import the Slider component
import { Slider } from "@/components/ui/slider";

// Import the toast hook
import { useToast } from "@/components/ui/use-toast";

// Import the Separator component
import { Separator } from "@/components/ui/separator";

// Import Tooltip components
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Import the Toaster component
import { Toaster } from "@/components/ui/toaster"

// Define character limits
const MAX_CHARS = 20000;
const WARNING_CHARS = 15000;

// Define possible modes and tones for type safety
export type ProcessingMode = 'summarize' | 'rewrite';
export type RewriteTone = 'formal' | 'casual' | 'creative';

// Define summary detail levels
const summaryDetailLevels = {
  1: 'Very Brief',
  2: 'Short',
  3: 'Medium',
  4: 'Long',
  5: 'Detailed',
} as const;

type SummaryDetailLevel = keyof typeof summaryDetailLevels;

// Types for the streaming result state
type StreamingState = {
  text: string;
  isComplete: boolean;
  startTime: number | null;
  chunks: number;
  totalLength: number;
};

// Post-streaming actions component
function PostStreamActions({ result, onReset }: { result: string; onReset: () => void }) {
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(result);
      toast({
        title: "Copied to clipboard",
        description: "The processed text has been copied to your clipboard.",
      });
    } catch (err) {
      console.error('Failed to copy:', err);
      toast({
        title: "Failed to copy",
        description: "Unable to copy text to clipboard. Please try again.",
      });
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-4 animate-fade-in">
      <Button 
        variant="outline" 
        size="sm"
        onClick={copyToClipboard}
        className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-w-[100px] transition-all duration-200 hover:scale-105 active:scale-95"
      >
        <Copy className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
        <span className="hidden sm:inline">Copy</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm"
        onClick={onReset}
        className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-w-[100px] transition-all duration-200 hover:scale-105 active:scale-95"
      >
        <RotateCcw className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
        <span className="hidden sm:inline">Reset</span>
      </Button>
      <Button 
        variant="outline" 
        size="sm"
        className="flex-1 sm:flex-none flex items-center justify-center gap-2 min-w-[100px] transition-all duration-200 hover:scale-105 active:scale-95"
      >
        <Save className="h-4 w-4 transition-transform duration-200 group-hover:scale-110" />
        <span className="hidden sm:inline">Save</span>
      </Button>
    </div>
  );
}

// --- Error Response Types ---
type ErrorResponse = {
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

// --- Toast Titles ---
const ToastTitles = {
  VALIDATION: 'Validation Error',
  API_ERROR: 'API Error',
  NETWORK_ERROR: 'Network Error',
  UNKNOWN_ERROR: 'Error',
} as const;

type ToastTitle = typeof ToastTitles[keyof typeof ToastTitles];

/**
 * HomePage Component - Implements progressive text streaming with React state management
 * 
 * Key State Management Points:
 * 1. outputText: Stores the progressively growing text content
 * 2. streamProgress: Tracks metrics about the streaming process
 * 3. Controlled Textarea: Bound directly to outputText state for real-time updates
 */
export default function HomePage() {
  const { toast } = useToast();
  
  // --- State Declarations ---
  
  // Core state for text input/output
  const [inputText, setInputText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  
  // Processing mode and tone selection
  const [mode, setMode] = useState<ProcessingMode>('summarize');
  const [tone, setTone] = useState<RewriteTone>('formal');
  const [summaryLengthLevel, setSummaryLengthLevel] = useState<SummaryDetailLevel>(3);

  // Streaming state management
  const [streamingState, setStreamingState] = useState<StreamingState>({
    text: '',
    isComplete: false,
    startTime: null,
    chunks: 0,
    totalLength: 0
  });

  // Calculate character count and status
  const charCount = inputText.length;
  const trimmedCharCount = inputText.trim().length;
  const isNearLimit = charCount > WARNING_CHARS;
  const isOverLimit = charCount > MAX_CHARS;

  // Determine input status
  const getInputStatus = () => {
    if (isOverLimit) return 'error';
    if (isNearLimit) return 'warning';
    if (trimmedCharCount === 0) return 'empty';
    return 'valid';
  };

  const inputStatus = getInputStatus();

  // Get status-specific styles
  const getStatusStyles = () => {
    switch (inputStatus) {
      case 'error':
        return 'text-destructive';
      case 'warning':
        return 'text-amber-500';
      case 'empty':
        return 'text-muted-foreground';
      default:
        return 'text-muted-foreground';
    }
  };

  // Reset handler
  const handleReset = () => {
    setStreamingState({
      text: '',
      isComplete: false,
      startTime: null,
      chunks: 0,
      totalLength: 0
    });
  };

  /**
   * Handles form submission and manages the streaming text process
   * 
   * The progressive display works through these steps:
   * 1. Stream chunks arrive from fetch
   * 2. Each chunk updates outputText state via functional update
   * 3. React re-renders on state change
   * 4. Textarea updates due to value={outputText} binding
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;

    setIsLoading(true);
    setStreamingState({
      text: '',
      isComplete: false,
      startTime: Date.now(),
      chunks: 0,
      totalLength: 0
    });

    try {
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          mode: mode,
          ...(mode === 'summarize' 
            ? { summaryLengthLevel: summaryLengthLevel }
            : { tone: tone }
          ),
        }),
      });

      if (!response.ok) {
        // Attempt to parse the error response
        const errorData: ErrorResponse = await response.json().catch(() => ({
          code: 'UNKNOWN_ERROR',
          error: `API Error: ${response.status} ${response.statusText}`,
        }));

        console.error('[Client] API Error Response:', {
          code: errorData.code,
          message: errorData.error,
          details: errorData.details,
        });

        // Determine toast title based on error code
        let toastTitle: ToastTitle = ToastTitles.API_ERROR;
        if (errorData.code.startsWith('VALIDATION_')) {
          toastTitle = ToastTitles.VALIDATION;
        } else if (errorData.code.startsWith('AI_')) {
          toastTitle = ToastTitles.API_ERROR;
        }

        // Show error toast
        toast({
          variant: "destructive",
          title: toastTitle,
          description: errorData.error,
          duration: 5000, // Show for 5 seconds
        });

        setIsLoading(false);
        return;
      }

      if (!response.body) {
        throw new Error("Response body is missing.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamEndedSuccessfully = false;

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          setStreamingState(prev => ({
            ...prev,
            isComplete: true
          }));
          streamEndedSuccessfully = true;
          break;
        }

        if (value) {
          const decodedChunk = decoder.decode(value, { stream: true });
          
          setStreamingState(prev => ({
            ...prev,
            text: prev.text + decodedChunk,
            chunks: prev.chunks + 1,
            totalLength: prev.totalLength + decodedChunk.length
          }));
        }
      }

      if (streamEndedSuccessfully) {
        toast({
          title: "Processing Complete",
          description: "Your text has been successfully processed.",
        });
      }

    } catch (error: unknown) {
      console.error('[Client] Request Error:', error);
      
      let errorMessage = 'An unexpected error occurred while processing your request.';
      let errorTitle: ToastTitle = ToastTitles.UNKNOWN_ERROR;

      if (error instanceof Error) {
        // Handle network errors
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
          errorTitle = ToastTitles.NETWORK_ERROR;
          errorMessage = 'Unable to connect to the server. Please check your internet connection and try again.';
        } else {
          errorMessage = error.message;
        }
      }

      // Show error toast
      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorMessage,
        duration: 5000,
      });

      setIsLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 xl:p-12 bg-gradient-to-b from-background to-muted/40 min-w-[320px]">
      <div className="w-full max-w-3xl space-y-6 sm:space-y-8 md:space-y-10 animate-fade-in">
        {/* Title Section */}
        <div className="text-center space-y-2 px-2 animate-fade-in">
          <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight text-primary animate-fade-in">
            AI Content Transformer
          </h1>
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground animate-fade-in">
            Summarize or rewrite your text instantly using AI.
          </p>
        </div>

        {/* Input & Options Card */}
        <Card className="shadow-lg dark:shadow-slate-800 transition-all duration-300 hover:shadow-xl dark:hover:shadow-slate-700">
          <CardHeader className="space-y-2 sm:space-y-3">
            <CardTitle className="text-xl sm:text-2xl">Input & Options</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              Paste your text below and choose how you want to process it.
            </CardDescription>
          </CardHeader>
          <Separator className="mb-4 sm:mb-6" />
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4 sm:space-y-6">
              {/* Input Textarea Section */}
              <div className="grid w-full gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="input-text" className="text-sm sm:text-base font-semibold">Your Text</Label>
                  <span className={`text-xs sm:text-sm font-medium transition-colors duration-200 ${getStatusStyles()}`}>
                    {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
                  </span>
                </div>
                <Textarea
                  id="input-text"
                  placeholder="Paste your text here..."
                  className={`min-h-[120px] sm:min-h-[150px] max-h-[300px] sm:max-h-[400px] text-sm sm:text-base resize-y transition-all duration-200 focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                    isOverLimit ? 'border-destructive focus:ring-destructive' : ''
                  }`}
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  required
                  disabled={isLoading}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Enter the content you wish to summarize or rewrite.
                  </p>
                  {isNearLimit && !isOverLimit && (
                    <p className="text-xs sm:text-sm text-amber-500">
                      Approaching character limit
                    </p>
                  )}
                  {isOverLimit && (
                    <p className="text-xs sm:text-sm text-destructive">
                      Character limit exceeded
                    </p>
                  )}
                </div>
              </div>

              {/* Configuration Options Section */}
              <Separator className="my-4 sm:my-6" />
              <div className="space-y-4">
                <h3 className="text-base sm:text-lg font-semibold text-foreground">Processing Options</h3>
                <div className="grid grid-cols-1 gap-4 sm:gap-6 rounded-md border p-3 sm:p-4 bg-muted/30 transition-colors duration-200">
                  {/* Mode Selection */}
                  <div className="grid w-full items-center gap-2">
                    <Label className="text-sm sm:text-base font-medium">Mode</Label>
                    <RadioGroup
                      value={mode}
                      onValueChange={(value) => setMode(value as ProcessingMode)}
                      className="flex flex-wrap sm:flex-nowrap items-center gap-4 pt-1"
                      disabled={isLoading}
                    >
                      <Label htmlFor="mode-summarize" className="flex items-center space-x-2 text-sm sm:text-base font-normal cursor-pointer transition-colors duration-200 hover:text-primary">
                        <RadioGroupItem value="summarize" id="mode-summarize" className="transition-transform duration-200 hover:scale-110" />
                        <span>Summarize</span>
                      </Label>
                      <Label htmlFor="mode-rewrite" className="flex items-center space-x-2 text-sm sm:text-base font-normal cursor-pointer transition-colors duration-200 hover:text-primary">
                        <RadioGroupItem value="rewrite" id="mode-rewrite" className="transition-transform duration-200 hover:scale-110" />
                        <span>Rewrite</span>
                      </Label>
                    </RadioGroup>
                  </div>

                  {/* Tone Selection */}
                  <div className="grid w-full items-center gap-2">
                    <Label htmlFor="tone-select" className={`text-sm sm:text-base font-medium transition-colors duration-200 ${mode !== 'rewrite' ? 'text-muted-foreground/50' : ''}`}>
                      Tone (if rewriting)
                    </Label>
                    <Select
                      value={tone}
                      onValueChange={(value) => setTone(value as RewriteTone)}
                      disabled={mode !== 'rewrite' || isLoading}
                    >
                      <SelectTrigger id="tone-select" className="w-full text-sm sm:text-base transition-all duration-200 hover:border-primary">
                        <SelectValue placeholder="Select tone..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="formal">Formal</SelectItem>
                        <SelectItem value="casual">Casual</SelectItem>
                        <SelectItem value="creative">Creative</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Summary Detail Level */}
                  <div className="grid w-full items-center gap-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="summary-length" className={`text-sm sm:text-base font-medium transition-colors duration-200 ${mode !== 'summarize' ? 'text-muted-foreground/50' : ''}`}>
                        Summary Detail (if summarizing)
                      </Label>
                      <span className={`text-xs sm:text-sm font-medium transition-colors duration-200 ${mode !== 'summarize' || isLoading ? 'text-muted-foreground/50' : 'text-primary'}`}>
                        {summaryDetailLevels[summaryLengthLevel]} ({summaryLengthLevel})
                      </span>
                    </div>
                    <Slider
                      id="summary-length"
                      min={1}
                      max={5}
                      step={1}
                      value={[summaryLengthLevel]}
                      onValueChange={(value: number[]) => setSummaryLengthLevel(value[0] as SummaryDetailLevel)}
                      disabled={mode !== 'summarize' || isLoading}
                      className="pt-2 transition-opacity duration-200"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Button with Tooltip */}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="w-full">
                      <Button
                        type="submit"
                        size="lg"
                        className="w-full mt-6 sm:mt-8 text-base sm:text-lg h-12 sm:h-14 transition-all duration-300 ease-in-out flex items-center justify-center hover:scale-[1.02] active:scale-[0.98]"
                        disabled={isLoading || trimmedCharCount === 0 || isOverLimit}
                      >
                        <span className="relative block h-6">
                          <span
                            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-in-out ${
                              isLoading ? 'opacity-0' : 'opacity-100'
                            }`}
                          >
                            Process Text
                          </span>
                          <span
                            className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ease-in-out ${
                              isLoading ? 'opacity-100' : 'opacity-0'
                            }`}
                          >
                            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...
                          </span>
                        </span>
                      </Button>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isLoading ? (
                      <p>Processing your request...</p>
                    ) : trimmedCharCount === 0 ? (
                      <p>Please enter some text to process</p>
                    ) : isOverLimit ? (
                      <p>Text exceeds maximum length of {MAX_CHARS.toLocaleString()} characters</p>
                    ) : (
                      <p>Click to process your text</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardContent>
          </form>
        </Card>

        {/* Output Card */}
        <Card className={`shadow-lg dark:shadow-slate-800 transition-all duration-300 hover:shadow-xl dark:hover:shadow-slate-700 ${streamingState.text ? 'animate-fade-in' : ''}`}>
          <CardHeader className="space-y-2 sm:space-y-3">
            <CardTitle className="text-xl sm:text-2xl">Output</CardTitle>
            <CardDescription className="text-sm sm:text-base">
              The AI-generated text will appear below as it&apos;s generated.
            </CardDescription>
          </CardHeader>
          <Separator className="mb-4 sm:mb-6" />
          <CardContent>
            <div className="grid w-full gap-2">
              <Label htmlFor="output-text" className="text-sm sm:text-base font-semibold">Result</Label>
              <Textarea
                id="output-text"
                readOnly
                placeholder={isLoading ? "Generating..." : "AI-generated content will appear here..."}
                className="min-h-[120px] sm:min-h-[150px] text-sm sm:text-base whitespace-pre-wrap bg-muted focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-md transition-all duration-200"
                value={streamingState.text}
              />
              <div className="text-xs sm:text-sm text-muted-foreground">
                {streamingState.isComplete ? (
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2 animate-fade-in">
                    <span>Completed in {Math.floor((Date.now() - (streamingState.startTime || Date.now())) / 1000)}s</span>
                    <Suspense fallback={<span>Loading actions...</span>}>
                      <PostStreamActions 
                        result={streamingState.text} 
                        onReset={handleReset}
                      />
                    </Suspense>
                  </div>
                ) : (
                  <span className="transition-opacity duration-200">
                    Processing... ({streamingState.chunks} chunks, {Math.floor((streamingState.totalLength / (Date.now() - (streamingState.startTime || Date.now()))) * 1000)} chars/sec)
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      <Toaster />
    </main>
  );
}