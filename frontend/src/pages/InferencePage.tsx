import React, { useState, useRef, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Square,
  Trash2,
  Sliders,
  Copy,
  Check,
  Zap,
  Clock,
  Sparkles,
  Bot,
  User,
} from 'lucide-react';
import { useEngine } from '@/lib/context';
import { useToast } from '@/lib/toast';
import { api } from '@/lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  telemetry?: {
    tokens?: number;
    tokensPerSec?: number;
    ttftMs?: number;
    durationSec?: number;
  };
}

export function InferencePage() {
  const { showSuccess, showError, showInfo } = useToast();
  const { models, activeModelId, activeModel, activeRuntime, selectModel } = useEngine();

  // Chat conversation
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content: 'Inference Studio initialized. Ready for local prompt evaluation and latency testing.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  // Generation telemetry
  const [liveTokensPerSec, setLiveTokensPerSec] = useState<number | null>(null);
  const [liveTtft, setLiveTtft] = useState<number | null>(null);
  const [liveTokenCount, setLiveTokenCount] = useState<number>(0);

  // Settings
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(512);
  const [isStreaming, setIsStreaming] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Clipboard copy state
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, liveTokenCount]);

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleStop = async () => {
    if (abortController) {
      abortController.abort();
    }
    try {
      await api.stopRuntime();
    } catch {
      // ignore
    }
    setIsGenerating(false);
    showInfo('Generation stopped by user');
  };

  const handleSendMessage = async () => {
    const prompt = inputText.trim();
    if (!prompt || isGenerating) return;

    if (!activeModelId) {
      showError('No active model selected. Please select a model in Runtimes & Models.');
      return;
    }

    setInputText('');
    const userMsgId = Math.random().toString(36).substring(2, 9);
    const assistantMsgId = Math.random().toString(36).substring(2, 9);

    const userMsg: ChatMessage = {
      id: userMsgId,
      role: 'user',
      content: prompt,
      timestamp: new Date().toLocaleTimeString(),
    };

    const newMessages = [...messages, userMsg];
    setMessages(newMessages);

    setIsGenerating(true);
    setLiveTokensPerSec(null);
    setLiveTtft(null);
    setLiveTokenCount(0);

    const controller = new AbortController();
    setAbortController(controller);

    const tStart = performance.now();
    let firstTokenTime: number | null = null;
    let accumulatedText = '';
    let tokenCount = 0;

    // Add placeholder assistant message
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);

    try {
      if (isStreaming) {
        await api.streamChatCompletions(
          newMessages
            .filter((m) => m.role !== 'system')
            .map((m) => ({ role: m.role, content: m.content })),
          {
            model: activeModel?.id,
            temperature,
            maxTokens,
            signal: controller.signal,
            onToken: (chunk) => {
              const now = performance.now();
              if (firstTokenTime === null) {
                firstTokenTime = now;
                const ttft = Math.round(now - tStart);
                setLiveTtft(ttft);
              }
              accumulatedText += chunk;
              tokenCount += 1;
              setLiveTokenCount(tokenCount);

              const elapsedSec = (now - tStart) / 1000;
              if (elapsedSec > 0.2) {
                setLiveTokensPerSec(parseFloat((tokenCount / elapsedSec).toFixed(1)));
              }

              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId ? { ...m, content: accumulatedText } : m
                )
              );
            },
            onComplete: () => {
              const totalDurationSec = (performance.now() - tStart) / 1000;
              const finalTps = totalDurationSec > 0 ? parseFloat((tokenCount / totalDurationSec).toFixed(1)) : 0;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        content: accumulatedText,
                        telemetry: {
                          tokens: tokenCount,
                          tokensPerSec: finalTps,
                          ttftMs: firstTokenTime ? Math.round(firstTokenTime - tStart) : undefined,
                          durationSec: parseFloat(totalDurationSec.toFixed(2)),
                        },
                      }
                    : m
                )
              );
              setIsGenerating(false);
            },
            onError: (err) => {
              showError(err.message || 'Streaming inference error');
              setIsGenerating(false);
            },
          }
        );
      } else {
        // Non-streaming fallback
        const res = await api.generateInference(prompt, activeModel?.id, temperature, maxTokens);
        const totalDurationSec = (performance.now() - tStart) / 1000;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: res.response || res.text || 'No response generated',
                  telemetry: {
                    tokens: res.tokens_generated || 0,
                    tokensPerSec: res.tokens_per_second || 0,
                    durationSec: parseFloat(totalDurationSec.toFixed(2)),
                  },
                }
              : m
          )
        );
        setIsGenerating(false);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showError(err.message || 'Inference execution failed');
      }
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleClearHistory = () => {
    setMessages([
      {
        id: 'welcome',
        role: 'system',
        content: 'Conversation history cleared. Ready for new local inference prompts.',
        timestamp: new Date().toLocaleTimeString(),
      },
    ]);
    showInfo('Conversation history reset');
  };

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] space-y-4">
      {/* Studio Header Card */}
      <Card className="shrink-0 p-3.5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-xs text-foreground">
                  {activeModel?.name || 'No Model Selected'}
                </span>
                <Badge variant="purple" className="text-[10px] font-mono capitalize">
                  {activeRuntime}
                </Badge>
              </div>
              <div className="text-[11px] text-muted-foreground flex items-center gap-2 pt-0.5">
                <span>Context: {activeModel?.context_length ? activeModel.context_length.toLocaleString() : '4,096'}</span>
                <span>•</span>
                <span>Temp: {temperature}</span>
                <span>•</span>
                <span>Max: {maxTokens} tok</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            {/* Live generation stats */}
            {isGenerating && (
              <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-primary/10 border border-primary/30 text-[11px] font-mono animate-pulse">
                <Zap className="w-3.5 h-3.5 text-primary" />
                <span>{liveTokensPerSec ? `${liveTokensPerSec} t/s` : 'generating...'}</span>
                {liveTtft && <span>({liveTtft} ms TTFT)</span>}
              </div>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={handleClearHistory}
              disabled={isGenerating || messages.length <= 1}
              className="h-8 text-xs gap-1.5"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSettingsOpen(true)}
              className="h-8 text-xs gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              Parameters
            </Button>
          </div>
        </div>
      </Card>

      {/* Message History Viewport */}
      <Card className="flex-1 overflow-hidden flex flex-col p-4 bg-card/60 backdrop-blur-sm">
        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {messages.map((m) => {
            const isUser = m.role === 'user';
            const isSystem = m.role === 'system';

            if (isSystem) {
              return (
                <div key={m.id} className="text-center py-2">
                  <span className="inline-block px-3 py-1 rounded-full bg-muted/60 text-[11px] text-muted-foreground font-medium border border-border">
                    {m.content}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={m.id}
                className={cn(
                  'flex gap-3 max-w-[85%]',
                  isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
                )}
              >
                {/* Avatar */}
                <div
                  className={cn(
                    'w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold border',
                    isUser
                      ? 'bg-primary text-primary-foreground border-primary/50'
                      : 'bg-muted text-foreground border-border'
                  )}
                >
                  {isUser ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5 text-primary" />}
                </div>

                {/* Bubble */}
                <div className="space-y-1.5">
                  <div
                    className={cn(
                      'p-3.5 rounded-2xl text-xs leading-relaxed break-words shadow-sm',
                      isUser
                        ? 'bg-primary text-primary-foreground rounded-tr-none'
                        : 'bg-muted/70 text-foreground border border-border rounded-tl-none'
                    )}
                  >
                    {m.content ? (
                      <div className="whitespace-pre-wrap">{m.content}</div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-muted-foreground italic">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                        Evaluating prompt on local hardware...
                      </div>
                    )}
                  </div>

                  {/* Metadata & telemetry row */}
                  <div className={cn('flex items-center gap-2 text-[10px] text-muted-foreground px-1', isUser && 'justify-end')}>
                    <span>{m.timestamp}</span>
                    {m.telemetry && (
                      <span className="font-mono text-primary font-medium">
                        • {m.telemetry.tokensPerSec} t/s ({m.telemetry.tokens} toks in {m.telemetry.durationSec}s)
                        {m.telemetry.ttftMs && ` • TTFT: ${m.telemetry.ttftMs}ms`}
                      </span>
                    )}
                    {!isUser && m.content && (
                      <button
                        onClick={() => handleCopy(m.id, m.content)}
                        className="hover:text-foreground p-0.5"
                        title="Copy response"
                      >
                        {copiedId === m.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="pt-3 border-t border-border mt-2">
          <div className="relative flex items-end gap-2 p-1.5 rounded-xl border border-border bg-background/80 focus-within:ring-1 focus-within:ring-ring">
            <textarea
              ref={textareaRef}
              rows={2}
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type your prompt here... (Press Enter to send, Shift+Enter for new line)"
              disabled={isGenerating}
              className="w-full resize-none bg-transparent p-2 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
            {isGenerating ? (
              <Button
                size="sm"
                variant="destructive"
                onClick={handleStop}
                className="h-8 px-3 gap-1.5 shrink-0"
              >
                <Square className="w-3.5 h-3.5 fill-current" />
                Stop
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={handleSendMessage}
                disabled={!inputText.trim()}
                className="h-8 px-3 gap-1.5 shrink-0"
              >
                <Send className="w-3.5 h-3.5" />
                Send
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Parameter Settings Drawer (Sheet) */}
      <Sheet open={settingsOpen} onOpenChange={setSettingsOpen} side="right">
        <div className="p-6 space-y-6">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-foreground">Inference Parameters</h3>
            <p className="text-xs text-muted-foreground">Configure generation settings for this chat session</p>
          </div>

          <div className="space-y-5 text-xs">
            {/* Model switcher */}
            <div className="space-y-1.5">
              <label className="font-medium text-foreground">Active Model</label>
              <Select
                value={activeModelId}
                onChange={(e) => selectModel(e.target.value)}
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.format} - {m.size_formatted})
                  </option>
                ))}
              </Select>
            </div>

            {/* Streaming Toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/20">
              <div className="space-y-0.5">
                <span className="font-medium text-foreground block">Server-Sent Events (SSE)</span>
                <span className="text-[11px] text-muted-foreground">Stream tokens progressively as generated</span>
              </div>
              <Switch checked={isStreaming} onCheckedChange={setIsStreaming} />
            </div>

            {/* Temperature Slider */}
            <div className="space-y-2">
              <div className="flex justify-between font-medium">
                <span>Temperature</span>
                <span className="font-mono text-primary font-semibold">{temperature}</span>
              </div>
              <Slider
                min={0.0}
                max={1.5}
                step={0.05}
                value={temperature}
                onValueChange={setTemperature}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>0.0 (Deterministic)</span>
                <span>0.7</span>
                <span>1.5 (Creative)</span>
              </div>
            </div>

            {/* Max Tokens Slider */}
            <div className="space-y-2">
              <div className="flex justify-between font-medium">
                <span>Max Predicted Tokens</span>
                <span className="font-mono text-primary font-semibold">{maxTokens}</span>
              </div>
              <Slider
                min={32}
                max={2048}
                step={32}
                value={maxTokens}
                onValueChange={setMaxTokens}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
                <span>32</span>
                <span>512</span>
                <span>1024</span>
                <span>2048</span>
              </div>
            </div>
          </div>
        </div>
      </Sheet>
    </div>
  );
}
