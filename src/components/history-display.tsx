"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { Clock, Trash2, Loader2, RefreshCw } from 'lucide-react';
import type { HistoryEntry } from "@/types/history";
import { useState, useEffect } from "react";
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
      const savedHistory = localStorage.getItem('rewritex-history');
      
      if (savedHistory) {
        const loadedHistory = JSON.parse(savedHistory);
        
        // Sort entries based on current sort option
        const sortedHistory = [...loadedHistory].sort((a, b) => {
          return sortBy === 'newest' 
            ? b.timestamp - a.timestamp 
            : a.timestamp - b.timestamp;
        });
        
        setHistoryEntries(sortedHistory);
      }
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

  const handleDelete = async (id: string) => {
    try {
      const updatedHistory = historyEntries.filter(entry => entry.id !== id);
      setHistoryEntries(updatedHistory);
      localStorage.setItem('rewritex-history', JSON.stringify(updatedHistory));
      toast({
        title: "Entry Deleted",
        description: "The history entry has been removed.",
      });
    } catch (err) {
      console.error('[HistoryDisplay] Error deleting entry:', err);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete entry. Please try again.",
      });
    }
  };

  const handleClearHistory = async () => {
    try {
      localStorage.removeItem('rewritex-history');
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

  const toggleSort = () => {
    setSortBy(current => current === 'newest' ? 'oldest' : 'newest');
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  };

  return (
    <Card className="w-full max-w-4xl mt-8 bg-zinc-900/50 border-zinc-800 shadow-lg transition-all duration-300 hover:shadow-zinc-800/50">
      <CardHeader className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-xl sm:text-2xl text-zinc-100">History</CardTitle>
            <CardDescription className="text-sm sm:text-base text-zinc-400">
              Your recent text processing history
            </CardDescription>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={toggleSort}
              className="text-zinc-100 hover:text-zinc-300 hover:bg-zinc-800 border-zinc-800 bg-zinc-800/50"
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              {sortBy === 'newest' ? 'Newest First' : 'Oldest First'}
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-red-400 hover:text-red-300 hover:bg-zinc-800 border-zinc-800"
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-zinc-900 border-zinc-800">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-zinc-100">Clear History</AlertDialogTitle>
                  <AlertDialogDescription className="text-zinc-400">
                    Are you sure you want to clear all history entries? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-zinc-800 text-zinc-100 hover:bg-zinc-700">Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearHistory}
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    Clear History
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </CardHeader>
      <Separator className="bg-zinc-800" />
      <CardContent className="p-4">
        <ScrollArea className="h-[300px] w-full rounded-md">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <p className="text-red-400">{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                className="text-zinc-100 hover:bg-zinc-800 border-zinc-800"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : historyEntries.length === 0 ? (
            <p className="text-center text-zinc-400 py-4">No history yet</p>
          ) : (
            <div className="space-y-4">
              {historyEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex flex-col space-y-2 p-4 rounded-lg border border-zinc-800 bg-zinc-900/50 hover:bg-zinc-900 transition-colors duration-200"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Clock className="h-4 w-4 text-zinc-400" />
                      <span className="text-sm text-zinc-400">{formatDate(entry.timestamp)}</span>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(entry.id)}
                      className="text-zinc-400 hover:text-red-400 hover:bg-zinc-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium text-zinc-100">Mode: {entry.mode}</p>
                    <p className="text-sm text-zinc-400 line-clamp-2">{entry.inputText}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleLoadEntry(entry)}
                    className="w-full mt-2 border-zinc-800 text-zinc-100 hover:bg-zinc-800 hover:text-zinc-100"
                  >
                    Load
                  </Button>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
} 