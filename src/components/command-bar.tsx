"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { executeCommand } from "@/lib/actions/command-bar";
import type { ParsedIntent } from "@/lib/ai/intent";

interface CommandResult {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [intent, setIntent] = useState<ParsedIntent | null>(null);
  const [results, setResults] = useState<CommandResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const openRef = useRef(false);
  useEffect(() => {
    openRef.current = open;
  }, [open]);

  const handleOpen = useCallback(() => {
    setInput("");
    setIntent(null);
    setResults([]);
    setSelectedIndex(0);
    setOpen(true);
  }, []);

  // ⌘K to open, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (openRef.current) setOpen(false);
        else handleOpen();
      }
      if (e.key === "Escape") {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleOpen]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleExecute = useCallback(() => {
    if (!input.trim()) return;

    startTransition(async () => {
      const response = await executeCommand(input);
      setIntent(response.intent);
      setResults(response.results ?? []);
      setSelectedIndex(0);

      // Auto-navigate for navigation intents
      if (response.intent.action === "navigate" && response.intent.params.page) {
        const pageMap: Record<string, string> = {
          jobs: "/jobs",
          candidates: "/candidates",
          dashboard: "/dashboard",
          settings: "/settings",
        };
        const href = pageMap[response.intent.params.page];
        if (href) {
          setOpen(false);
          router.push(href);
        }
      }

      // Auto-navigate for create intents
      if (response.intent.action === "create_job") {
        setOpen(false);
        router.push("/jobs/new");
      }
      if (response.intent.action === "create_candidate") {
        setOpen(false);
        router.push("/candidates/new");
      }
    });
  }, [input, router]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      if (results.length > 0 && results[selectedIndex]) {
        setOpen(false);
        router.push(results[selectedIndex].href);
      } else {
        handleExecute();
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Command palette */}
      <div className="fixed inset-x-0 top-[20%] z-50 mx-auto w-full max-w-lg">
        <div className="rounded-xl border border-border bg-card shadow-2xl">
          {/* Input */}
          <div className="flex items-center border-b border-border px-4">
            <span className="mr-2 text-muted-foreground">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a command or search..."
              className="flex-1 border-0 bg-transparent py-3 text-sm text-foreground outline-none placeholder:text-muted-foreground"
            />
            {isPending && (
              <span className="text-xs text-muted-foreground animate-pulse">
                Thinking...
              </span>
            )}
            <kbd className="ml-2 rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground">
              ESC
            </kbd>
          </div>

          {/* Intent display */}
          {intent && !results.length && intent.action !== "navigate" && intent.action !== "create_job" && intent.action !== "create_candidate" && (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              {intent.display}
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div className="max-h-64 overflow-y-auto py-1">
              {results.map((result, i) => (
                <button
                  key={result.id}
                  onClick={() => {
                    setOpen(false);
                    router.push(result.href);
                  }}
                  className={`flex w-full items-center px-4 py-2.5 text-left text-sm transition-colors ${
                    i === selectedIndex
                      ? "bg-primary/10 text-primary"
                      : "text-foreground hover:bg-muted/50"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{result.title}</p>
                    {result.subtitle && (
                      <p className="text-xs text-muted-foreground truncate">
                        {result.subtitle}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Footer hints */}
          <div className="flex items-center justify-between border-t border-border px-4 py-2">
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>
                <kbd className="rounded border border-border px-1">Enter</kbd>{" "}
                to execute
              </span>
              <span>
                <kbd className="rounded border border-border px-1">↑↓</kbd>{" "}
                to navigate
              </span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              AI-powered
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
