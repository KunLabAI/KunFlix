'use client';

import React from 'react';
import { Bot, X, Trash2, ChevronDown, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { AgentInfo } from '@/store/useAIAssistantStore';

interface PanelHeaderProps {
  agentName: string;
  availableAgents: AgentInfo[];
  isLoadingAgents: boolean;
  onSwitchAgent: (agent: AgentInfo) => void;
  onClearSession: () => void;
  onClose: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  className?: string;
}

export function PanelHeader({
  agentName,
  availableAgents,
  isLoadingAgents,
  onSwitchAgent,
  onClearSession,
  onClose,
  onDragStart,
  className,
}: PanelHeaderProps) {
  return (
    <div
      className={cn(
        'flex items-center justify-between p-3 border-b bg-secondary/30 cursor-grab active:cursor-grabbing',
        className
      )}
      onPointerDown={onDragStart}
    >
      <div className="flex items-center gap-2 pointer-events-none">
        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
          <Bot className="h-4 w-4 text-primary" />
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-sm">AI 创作助手</span>
          {/* Agent selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1 text-xs text-muted-foreground hover:text-foreground pointer-events-auto"
                disabled={isLoadingAgents}
              >
                {agentName}
                {isLoadingAgents ? (
                  <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                ) : (
                  <ChevronDown className="h-3 w-3 ml-1" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              {availableAgents.map((agent) => (
                <DropdownMenuItem
                  key={agent.id}
                  onClick={() => onSwitchAgent(agent)}
                  className="text-xs cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{agent.name}</span>
                    {agent.target_node_types && agent.target_node_types.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">
                        支持: {agent.target_node_types.join(', ')}
                      </span>
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
              {availableAgents.length === 0 && (
                <div className="p-2 text-xs text-muted-foreground text-center">
                  暂无可用智能体
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="flex items-center gap-1 pointer-events-auto">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-muted"
          onClick={async (e) => {
            e.stopPropagation();
            onClearSession();
          }}
          onPointerDown={(e) => e.stopPropagation()}
          title="清空对话"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive z-50"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
