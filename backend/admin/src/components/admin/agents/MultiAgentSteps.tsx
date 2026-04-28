'use client';

import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Bot, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface AgentStep {
  subtask_id: string;
  agent_name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: string;
  tokens?: { input: number; output: number };
  error?: string;
}

export interface MultiAgentData {
  steps: AgentStep[];
  finalResult: string;
  totalTokens: { input: number; output: number };
  creditCost: number;
}

const STATUS_CONFIG: Record<string, { icon: React.ReactNode; labelKey: string; color: string }> = {
  pending: { icon: <Loader2 className="h-3 w-3 text-muted-foreground" />, labelKey: 'agents.multiAgent.status.pending', color: 'text-muted-foreground' },
  running: { icon: <Loader2 className="h-3 w-3 animate-spin text-foreground" />, labelKey: 'agents.multiAgent.status.running', color: 'text-foreground' },
  completed: { icon: <CheckCircle2 className="h-3 w-3 text-emerald-600" />, labelKey: 'agents.multiAgent.status.completed', color: 'text-emerald-600' },
  failed: { icon: <XCircle className="h-3 w-3 text-destructive" />, labelKey: 'agents.multiAgent.status.failed', color: 'text-destructive' },
};

export default function MultiAgentSteps({ steps, finalResult, totalTokens, creditCost }: MultiAgentData) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const completedCount = steps.filter(s => s.status === 'completed').length;
  const totalCount = steps.length;
  const isStreaming = !finalResult && steps.some(s => s.status === 'running' || s.status === 'pending');

  return (
    <div className="space-y-3">
      {/* Collapsible agent steps */}
      <Collapsible open={isOpen || isStreaming} onOpenChange={setIsOpen}>
        <CollapsibleTrigger className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer group">
          <ChevronRight className={cn(
            "h-3.5 w-3.5 transition-transform duration-200",
            (isOpen || isStreaming) && "rotate-90"
          )} />
          <Bot className="h-3.5 w-3.5" />
          {isStreaming ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>{t('agents.multiAgent.collaborating')} ({completedCount}/{totalCount} {t('agents.multiAgent.agents')})</span>
            </>
          ) : (
            <span>{t('agents.multiAgent.collaborationProcess')} ({completedCount}/{totalCount} {t('agents.multiAgent.agents')})</span>
          )}
          <span className="text-[10px] opacity-60">
            {totalTokens.input + totalTokens.output > 0 && `${totalTokens.input + totalTokens.output} ${t('agents.multiAgent.tokens')}`}
            {creditCost > 0 && ` · ${creditCost.toFixed(2)} ${t('agents.multiAgent.credits')}`}
          </span>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-2 space-y-2 pl-5 border-l-2 border-muted ml-1.5">
            {steps.map((step) => {
              const config = STATUS_CONFIG[step.status] || STATUS_CONFIG.pending;
              return (
                <div key={step.subtask_id} className="relative">
                  {/* Step header */}
                  <div className="flex items-center gap-2 text-xs">
                    {config.icon}
                    <span className="font-medium text-foreground">{step.agent_name}</span>
                    <span className="text-muted-foreground truncate">{step.description}</span>
                    {step.tokens && (
                      <span className="text-[10px] text-muted-foreground/60 ml-auto shrink-0">
                        {step.tokens.input + step.tokens.output}t
                      </span>
                    )}
                  </div>

                  {/* Step result content (shown during streaming and after completion) */}
                  {step.result && (
                    <div className="mt-1.5 ml-5 p-3 rounded-md bg-muted/40 text-xs">
                      <div className="prose prose-xs dark:prose-invert max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {step.result}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Step error */}
                  {step.error && (
                    <div className="mt-1.5 ml-5 p-2 rounded-md bg-destructive/10 text-xs text-destructive">
                      {step.error}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Final result */}
      {finalResult && (
        <div className="prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {finalResult}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
