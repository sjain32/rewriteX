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
import JarvisScene from "@/components/Robot";
import Particles from "@/components/ui/Particles";
import SplitText from "@/components/ui/SplitText";
// Import the Textarea, Label, and Button components
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useState, FormEvent, Suspense } from 'react';
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

// Import history utility functions
import { saveHistoryEntryToLocalStorage } from '@/lib/historyUtils';
import type { HistoryEntry } from '@/types/history';
import { TargetAudience, SummaryFormat, RewriteGoal } from '@/types/history';
import { HistoryDisplay } from '@/components/history-display';
import type { ProcessingMode, RewriteTone, SummaryDetailLevel } from '@/app/api/process/route';

// Define character limits
const MAX_CHARS = 20000;
const WARNING_CHARS = 15000;

// Constants for UI options
const targetAudiences = {
  general: 'General Audience',
  simple: 'Simple / Layperson',
  expert: 'Expert / Technical',
} as const;

const summaryFormats = {
  paragraph: 'Paragraph',
  'bullet-points': 'Bullet Points',
} as const;

const rewriteGoals = {
  'maintain-length': 'Maintain Length',
  'make-shorter': 'Make Shorter',
} as const;

// Types for the streaming result state
interface StreamingState {
  text: string;
  isComplete: boolean;
  startTime: number | null;
  chunks: number;
  totalLength: number;
}

// Post-streaming actions component
function PostStreamActions({ result, onReset }: { result: string; onReset: () => void }) {
  const { toast } = useToast();

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

// Add this after the PostStreamActions component
function RetryButton({ onClick }: { onClick: () => void }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onClick}
      className="mt-2 transition-all duration-200 hover:scale-105 active:scale-95"
    >
      <RotateCcw className="h-4 w-4 mr-2" />
      Retry Now
    </Button>
  );
}

// --- Error Response Types ---
type ErrorResponse = {
  code: string;
  error: string;
  details?: Record<string, unknown>;
};

const summaryDetailLevels = {
  1: 'Very Brief',
  2: 'Short',
  3: 'Medium',
  4: 'Long',
  5: 'Detailed',
} as const;

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
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);

  // Processing mode and tone selection
  const [mode, setMode] = useState<ProcessingMode>('summarize');
  const [selectedTone, setSelectedTone] = useState<RewriteTone>('formal');
  const [summaryLengthLevel, setSummaryLengthLevel] = useState<SummaryDetailLevel>(3);
  const [targetAudience, setTargetAudience] = useState<TargetAudience>('general');
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat>('paragraph');
  const [rewriteGoal, setRewriteGoal] = useState<RewriteGoal>('maintain-length');

  // Streaming state management
  const [streamingState, setStreamingState] = useState<StreamingState>({
    text: '',
    isComplete: false,
    startTime: null,
    chunks: 0,
    totalLength: 0
  });

  // Add to state declarations
  const [selectedModel, setSelectedModel] = useState<'gpt-3.5-turbo' | 'gpt-4'>('gpt-3.5-turbo');

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

  // --- Handlers ---
  const handleSummarySliderChange = (value: number[]) => {
    const level = value[0] as SummaryDetailLevel;
    setSummaryLengthLevel(level);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inputText.trim() || isLoading) return;

    setIsLoading(true);
    let finalOutput = '';

    try {
      console.log('[Client] Sending request to /api/process');
      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: inputText,
          mode,
          model: selectedModel,
          ...(mode === 'rewrite' && { tone: selectedTone }),
          ...(mode === 'summarize' && { summaryLengthLevel }),
          targetAudience,
          ...(mode === 'summarize' ? { summaryFormat } : { rewriteGoal }),
          promptStructure: 'system-heavy'
        }),
      });

      console.log('[Client] Response status:', response.status);

      if (!response.ok) {
        const errorData: ErrorResponse | null = await response.json().catch(() => null);
        const errorMessage = errorData?.error || `API Error: ${response.status} ${response.statusText}`;
        console.error('[Client] API Error Response:', errorMessage, 'Code:', errorData?.code);

        if (errorData?.code === 'AI_RATE_LIMIT_ERROR') {
          toast({
            variant: "destructive",
            title: "Rate Limit Exceeded",
            description: (
              <div className="flex flex-col gap-2">
                <p>The AI service is experiencing high traffic. Please try again in a few moments.</p>
                <RetryButton onClick={() => handleSubmit(event)} />
              </div>
            ),
            duration: 10000,
          });
        } else {
          toast({
            variant: "destructive",
            title: "Request Failed",
            description: errorMessage,
          });
        }
        return;
      }

      if (!response.body) {
        throw new Error('Response body is missing');
      }

      console.log('[Client] Starting to process stream...');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let reading = true;

      while (reading) {
        const { done, value } = await reader.read();
        if (done) {
          reading = false;
          console.log('[Client] Stream finished.');
          continue;
        }

        const chunk = decoder.decode(value, { stream: true });
        finalOutput += chunk;
        setStreamingState((prev: StreamingState) => ({ ...prev, text: prev.text + chunk }));
      }

      // --- SUCCESS POINT: Stream Completed ---
      console.log('[Client] Operation successful. Saving to history...');

      // Create the history entry
      const historyEntry: HistoryEntry = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        inputText,
        outputText: finalOutput,
        mode,
        options: {
          summaryLengthLevel,
          tone: selectedTone,
          targetAudience,
          summaryFormat,
          rewriteGoal,
          model: selectedModel,
        },
      };
      saveHistoryEntryToLocalStorage(historyEntry);
      setHistoryEntries(prev => [...prev, historyEntry]);

    } catch (clientError: unknown) {
      console.error("[Client] Fetch or Stream Processing Error:", clientError);
      let message = 'An unexpected error occurred while fetching the result.';
      if (clientError instanceof Error) {
        message = clientError.message;
      }
      toast({
        variant: "destructive",
        title: "Operation Failed",
        description: message,
      });
    } finally {
      setIsLoading(false);
      console.log('[Client] handleSubmit finished.');
    }
  };

  const handleLoadHistoryEntry = (entry: HistoryEntry) => {
    setInputText(entry.inputText);
    setMode(entry.mode);
    setStreamingState(prev => ({ ...prev, text: entry.outputText }));
    setSummaryLengthLevel(entry.options.summaryLengthLevel);
    setSelectedTone(entry.options.tone);
    setTargetAudience(entry.options.targetAudience);
    if (entry.mode === 'summarize') {
      setSummaryFormat(entry.options.summaryFormat ?? 'paragraph');
    } else {
      setRewriteGoal(entry.options.rewriteGoal ?? 'maintain-length');
    }
  };

  return (
    <div className="relative min-h-screen w-full bg-black overflow-hidden">
      {/* Particles Background */}
      <div className="fixed inset-0 z-0">
        <Particles
          particleColors={['#ffffff', '#ffffff']}
          particleCount={200}
          particleSpread={10}
          speed={0.1}
          particleBaseSize={100}
          moveParticlesOnHover={true}
          alphaParticles={false}
          disableRotation={false}
        />
      </div>

      {/* Content Container */}
      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen">
        {/* Title Section */}
        <div className="text-center space-y-2 px-2 animate-fade-in mt-15">
          <SplitText
            text="RewriteX"
            className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-zinc-200 animate-fade-in bg-gradient-to-r from-zinc-200 to-zinc-400 bg-clip-text text-transparent transition-all duration-700 ease-in-out"
            delay={100}
            duration={0.6}
            ease="power3.out"
            splitType="chars"
            from={{ opacity: 0, y: 40 }}
            to={{ opacity: 1, y: 0 }}
            threshold={0.1}
            rootMargin="-100px"
            textAlign="center"
          />
          <p className="text-lg sm:text-xl md:text-2xl text-zinc-400 animate-fade-in font-light tracking-wide transition-all duration-700 ease-in-out">
            Summarize or rewrite your text instantly using AI.
          </p>
        </div>

        <div className="flex flex-row w-full max-w-[1920px] px-4">
          <div className="w-3/5 ">
            <JarvisScene />
          </div>
          <main className="flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 lg:p-8 xl:p-12 bg-black min-w-[320px] w-3/5">
            <div className="w-full max-w-4xl space-y-6 sm:space-y-8 md:space-y-10 animate-fade-in transition-all duration-700 ease-in-out">


              {/* Input & Options Card */}
              <Card className="bg-zinc-900/50 border-zinc-800 shadow-lg transition-all duration-500 ease-in-out hover:shadow-zinc-800/50 hover:scale-[1.01]">
                <CardHeader className="space-y-2 sm:space-y-3">
                  <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 transition-all duration-500 ease-in-out">Input & Options</CardTitle>
                  <CardDescription className="text-base sm:text-lg text-zinc-400 font-light transition-all duration-500 ease-in-out">
                    Paste your text below and choose how you want to process it.
                  </CardDescription>
                </CardHeader>
                <Separator className="mb-4 sm:mb-6 bg-zinc-800" />
                <form onSubmit={handleSubmit}>
                  <CardContent className="space-y-4 sm:space-y-6">
                    {/* Input Textarea Section */}
                    <div className="grid w-full gap-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="input-text" className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">Your Text</Label>
                        <span className={`text-sm sm:text-base font-medium transition-colors duration-200 ${getStatusStyles()}`}>
                          {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()} characters
                        </span>
                      </div>
                      <Textarea
                        id="input-text"
                        placeholder="Paste your text here..."
                        className={`min-h-[120px] sm:min-h-[150px] max-h-[300px] sm:max-h-[400px] text-base sm:text-lg resize-y transition-all duration-200 focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 bg-zinc-900/50 border-zinc-800 text-zinc-100 placeholder-zinc-500 font-light ${isOverLimit ? 'border-red-500 focus:ring-red-500' : ''
                          }`}
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        required
                        disabled={isLoading}
                      />
                      <div className="flex items-center justify-between">
                        <p className="text-sm sm:text-base text-zinc-400 font-light">
                          Enter the content you wish to summarize or rewrite.
                        </p>
                        {isNearLimit && !isOverLimit && (
                          <p className="text-sm sm:text-base text-amber-400 font-medium">
                            Approaching character limit
                          </p>
                        )}
                        {isOverLimit && (
                          <p className="text-sm sm:text-base text-red-400 font-medium">
                            Character limit exceeded
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Configuration Options Section */}
                    <Separator className="my-4 sm:my-6 bg-zinc-800" />
                    <div className="space-y-4">
                      <h3 className="text-lg sm:text-xl font-bold tracking-wide text-zinc-100">Processing Options</h3>
                      <div className="grid grid-cols-1 gap-4 sm:gap-6 rounded-md border border-zinc-800 p-3 sm:p-4 bg-zinc-900/50 transition-colors duration-200">
                        {/* Mode Selection */}
                        <div className="grid w-full items-center gap-2">
                          <Label className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">Mode</Label>
                          <RadioGroup
                            value={mode}
                            onValueChange={(value) => setMode(value as ProcessingMode)}
                            className="flex flex-wrap sm:flex-nowrap items-center gap-4 pt-1"
                            disabled={isLoading}
                          >
                            <Label htmlFor="mode-summarize" className="flex items-center space-x-2 text-base sm:text-lg font-normal cursor-pointer transition-colors duration-200 hover:text-zinc-300 text-zinc-100">
                              <RadioGroupItem value="summarize" id="mode-summarize" className="border-zinc-600 data-[state=checked]:bg-zinc-700 data-[state=checked]:text-zinc-100" />
                              <span>Summarize</span>
                            </Label>
                            <Label htmlFor="mode-rewrite" className="flex items-center space-x-2 text-base sm:text-lg font-normal cursor-pointer transition-colors duration-200 hover:text-zinc-300 text-zinc-100">
                              <RadioGroupItem value="rewrite" id="mode-rewrite" className="border-zinc-600 data-[state=checked]:bg-zinc-700 data-[state=checked]:text-zinc-100" />
                              <span>Rewrite</span>
                            </Label>
                          </RadioGroup>
                        </div>

                        {/* Tone Selection */}
                        <div className="grid w-full items-center gap-2">
                          <Label htmlFor="tone-select" className={`text-base sm:text-lg font-semibold text-zinc-100 tracking-wide ${mode !== 'rewrite' ? 'opacity-50' : ''}`}>
                            Tone (if rewriting)
                          </Label>
                          <Select
                            value={selectedTone}
                            onValueChange={(value) => setSelectedTone(value as RewriteTone)}
                            disabled={mode !== 'rewrite' || isLoading}
                          >
                            <SelectTrigger id="tone-select" className="w-full text-base sm:text-lg transition-all duration-200 hover:border-zinc-600 bg-zinc-900/50 border-zinc-800 text-zinc-100 font-light">
                              <SelectValue placeholder="Select tone..." />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="formal" className="text-zinc-100 hover:bg-zinc-800 focus:bg-zinc-800 font-light">Formal</SelectItem>
                              <SelectItem value="casual" className="text-zinc-100 hover:bg-zinc-800 focus:bg-zinc-800 font-light">Casual</SelectItem>
                              <SelectItem value="creative" className="text-zinc-100 hover:bg-zinc-800 focus:bg-zinc-800 font-light">Creative</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Summary Detail Level */}
                        <div className="grid w-full items-center gap-2">
                          <div className="flex items-center justify-between">
                            <Label htmlFor="summary-length" className={`text-base sm:text-lg font-semibold text-zinc-100 tracking-wide ${mode !== 'summarize' ? 'opacity-50' : ''}`}>
                              Summary Detail (if summarizing)
                            </Label>
                            <span className={`text-sm sm:text-base font-medium text-zinc-400 ${mode !== 'summarize' || isLoading ? 'opacity-50' : ''}`}>
                              {summaryDetailLevels[summaryLengthLevel]} ({summaryLengthLevel})
                            </span>
                          </div>
                          <Slider
                            id="summary-length"
                            min={1}
                            max={5}
                            step={1}
                            value={[summaryLengthLevel]}
                            onValueChange={handleSummarySliderChange}
                            disabled={mode !== 'summarize' || isLoading}
                            className="pt-2 transition-opacity duration-200"
                          />
                        </div>

                        {/* Target Audience */}
                        <div className="space-y-2">
                          <Label className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">Target Audience</Label>
                          <Select
                            value={targetAudience}
                            onValueChange={(value: TargetAudience) => setTargetAudience(value)}
                          >
                            <SelectTrigger className="w-full text-base sm:text-lg transition-all duration-200 hover:border-zinc-600 bg-zinc-900/50 border-zinc-800 text-zinc-100 font-light">
                              <SelectValue placeholder="Select Audience" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              {Object.entries(targetAudiences).map(([key, label]) => (
                                <SelectItem key={key} value={key} className="text-zinc-100 hover:bg-zinc-800 focus:bg-zinc-800 font-light">{label}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        {/* Mode-specific Options */}
                        {mode === 'summarize' ? (
                          <>
                            {/* Summarization Format */}
                            <div className="space-y-2 md:col-span-2">
                              <Label className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">Output Format</Label>
                              <RadioGroup
                                value={summaryFormat}
                                onValueChange={(value: SummaryFormat) => setSummaryFormat(value)}
                                className="flex flex-col md:flex-row md:space-x-4 space-y-2 md:space-y-0"
                              >
                                {Object.entries(summaryFormats).map(([key, label]) => (
                                  <div key={key} className="flex items-center space-x-2">
                                    <RadioGroupItem value={key} id={`format-${key}`} className="border-zinc-600 data-[state=checked]:bg-zinc-700 data-[state=checked]:text-zinc-100" />
                                    <Label htmlFor={`format-${key}`} className="text-base sm:text-lg font-normal cursor-pointer text-zinc-100 hover:text-zinc-300">{label}</Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Rewrite Goal */}
                            <div className="space-y-2">
                              <Label className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">Rewrite Goal</Label>
                              <RadioGroup
                                value={rewriteGoal}
                                onValueChange={(value: RewriteGoal) => setRewriteGoal(value)}
                                className="flex items-center space-x-4"
                              >
                                {Object.entries(rewriteGoals).map(([key, label]) => (
                                  <div key={key} className="flex items-center space-x-2">
                                    <RadioGroupItem value={key} id={`goal-${key}`} className="border-zinc-600 data-[state=checked]:bg-zinc-700 data-[state=checked]:text-zinc-100" />
                                    <Label htmlFor={`goal-${key}`} className="text-base sm:text-lg font-normal cursor-pointer text-zinc-100 hover:text-zinc-300">{label}</Label>
                                  </div>
                                ))}
                              </RadioGroup>
                            </div>
                          </>
                        )}

                        {/* Model Selection */}
                        <div className="space-y-2">
                          <Label className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">AI Model</Label>
                          <Select
                            value={selectedModel}
                            onValueChange={(value: 'gpt-3.5-turbo' | 'gpt-4') => setSelectedModel(value)}
                          >
                            <SelectTrigger className="w-full text-base sm:text-lg transition-all duration-200 hover:border-zinc-600 bg-zinc-900/50 border-zinc-800 text-zinc-100 font-light">
                              <SelectValue placeholder="Select Model" />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-900 border-zinc-800">
                              <SelectItem value="gpt-3.5-turbo" className="text-zinc-100 hover:bg-zinc-800 focus:bg-zinc-800 font-light">GPT-3.5 Turbo (Faster)</SelectItem>
                              <SelectItem value="gpt-4" className="text-zinc-100 hover:bg-zinc-800 focus:bg-zinc-800 font-light">GPT-4 (Better Quality)</SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="text-sm sm:text-base text-zinc-400 font-light">
                            {selectedModel === 'gpt-4'
                              ? 'GPT-4 provides higher quality results but may be slower and more expensive.'
                              : 'GPT-3.5 Turbo is faster and more cost-effective.'}
                          </p>
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
                              className="w-full mt-6 sm:mt-8 text-lg sm:text-xl h-12 sm:h-14 transition-all duration-500 ease-in-out flex items-center justify-center hover:scale-[1.02] active:scale-[0.98] bg-zinc-800 hover:bg-zinc-700 text-zinc-100 font-semibold tracking-wide"
                              disabled={isLoading || trimmedCharCount === 0 || isOverLimit}
                            >
                              <span className="relative block h-6">
                                <span
                                  className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${isLoading ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}
                                >
                                  Process Text
                                </span>
                                <span
                                  className={`absolute inset-0 flex items-center justify-center transition-all duration-500 ease-in-out ${isLoading ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
                                >
                                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Processing...
                                </span>
                              </span>
                            </Button>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent className="bg-zinc-800 text-zinc-100 border-zinc-700 font-light">
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
              {streamingState.text && (
                <Card className="bg-zinc-900/50 border-zinc-800 shadow-lg transition-all duration-500 ease-in-out hover:shadow-zinc-800/50 hover:scale-[1.01] animate-fade-in">
                  <CardHeader className="space-y-2 sm:space-y-3">
                    <CardTitle className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-100 transition-all duration-500 ease-in-out">Output</CardTitle>
                    <CardDescription className="text-base sm:text-lg text-zinc-400 font-light transition-all duration-500 ease-in-out">
                      The AI-generated text will appear below as it&apos;s generated.
                    </CardDescription>
                  </CardHeader>
                  <Separator className="mb-4 sm:mb-6 bg-zinc-800" />
                  <CardContent>
                    <div className="grid w-full gap-2">
                      <Label htmlFor="output-text" className="text-base sm:text-lg font-semibold text-zinc-100 tracking-wide">Result</Label>
                      <Textarea
                        id="output-text"
                        readOnly
                        placeholder={isLoading ? "Generating..." : "AI-generated content will appear here..."}
                        className="min-h-[120px] sm:min-h-[150px] text-base sm:text-lg whitespace-pre-wrap bg-zinc-900/50 focus:ring-2 focus:ring-zinc-600 focus:ring-offset-2 rounded-md transition-all duration-200 text-zinc-100 placeholder-zinc-500 font-light"
                        value={streamingState.text}
                      />
                      <div className="text-sm sm:text-base text-zinc-400 font-light">
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
              )}
            </div>
            <Toaster />

            {/* History Display */}
            {historyEntries.length > 0 && (
              <HistoryDisplay onLoadEntry={handleLoadHistoryEntry} />
            )}
          </main>
        </div>
      </div>
    </div>
  );
}