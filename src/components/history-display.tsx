"use client";

import { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2, RefreshCw, Trash2, Upload } from 'lucide-react';
import { getHistoryFromLocalStorage, clearHistoryFromLocalStorage } from '@/lib/historyUtils';
import type { HistoryEntry } from '@/types/history';
import { useToast } from "@/components/ui/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type SortOption = 'newest' | 'oldest';

interface HistoryDisplayProps {
  onLoadEntry: (entry: HistoryEntry) => void;
}

export function HistoryDisplay({ onLoadEntry }: HistoryDisplayProps) {
  const { toast } = useToast();
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loadedHistory = getHistoryFromLocalStorage();
      
      // Sort entries based on current sort option
      const sortedHistory = [...loadedHistory].sort((a, b) => {
        return sortBy === 'newest' 
          ? b.timestamp - a.timestamp 
          : a.timestamp - b.timestamp;
      });
      
      setHistoryEntries(sortedHistory);
    } catch (err) {
      console.error('[HistoryDisplay] Error loading history:', err);
      setError('Failed to load history. Please try again.');
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load history. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [sortBy]); // Reload when sort option changes

  const formatTimestamp = (timestamp: number): string => {
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  const truncateText = (text: string, maxLength: number = 100): string => {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
  };

  const toggleSort = () => {
    setSortBy(current => current === 'newest' ? 'oldest' : 'newest');
  };

  const handleClearHistory = async () => {
    try {
      clearHistoryFromLocalStorage();
      setHistoryEntries([]);
      toast({
        title: "History Cleared",
        description: "All history entries have been removed.",
      });
    } catch (err) {
      console.error('[HistoryDisplay] Error clearing history:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to clear history. Please try again.",
      });
    }
  };

  const handleLoadEntry = (entry: HistoryEntry) => {
    onLoadEntry(entry);
    toast({
      title: "Entry Loaded",
      description: "The selected entry has been loaded into the form.",
    });
    // Scroll to top of page
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <Card className="mt-8">
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle>Processing History</CardTitle>
            <CardDescription>Your recent summarization and rewrite tasks.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={toggleSort}
              className="text-xs"
            >
              {sortBy === 'newest' ? 'Newest First' : 'Oldest First'}
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={loadHistory} 
              disabled={isLoading}
              className="text-xs"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={isLoading || historyEntries.length === 0}
                  className="text-xs"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear History</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to clear all history entries? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearHistory}>
                    Clear All
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] w-full pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="text-center text-destructive">
              <p>{error}</p>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={loadHistory}
                className="mt-2"
              >
                Try Again
              </Button>
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="text-muted-foreground text-center">No history entries yet.</p>
          ) : (
            <div className="space-y-4">
              {historyEntries.map((entry, index) => (
                <div key={entry.id} className="animate-fade-in">
                  <div className="flex justify-between items-start text-sm mb-2">
                    <span className="text-muted-foreground font-medium">
                      {formatTimestamp(entry.timestamp)}
                    </span>
                    <Badge variant={entry.mode === 'summarize' ? 'secondary' : 'outline'}>
                      {entry.mode === 'summarize' ? 'Summarize' : 'Rewrite'}
                      {entry.mode === 'summarize' && entry.options.summaryLengthLevel && ` (Lvl ${entry.options.summaryLengthLevel})`}
                      {entry.mode === 'rewrite' && entry.options.tone && ` (${entry.options.tone})`}
                    </Badge>
                  </div>
                  <div className="space-y-2 text-xs">
                    <p>
                      <strong className="font-semibold">Input:</strong>
                      <span className="text-muted-foreground ml-1">{truncateText(entry.inputText)}</span>
                    </p>
                    <p>
                      <strong className="font-semibold">Output:</strong>
                      <span className="text-muted-foreground ml-1">{truncateText(entry.outputText)}</span>
                    </p>
                  </div>
                  <div className="flex justify-end space-x-2 mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleLoadEntry(entry)}
                      className="text-xs"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      Load
                    </Button>
                  </div>
                  {index < historyEntries.length - 1 && <Separator className="my-4" />}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 