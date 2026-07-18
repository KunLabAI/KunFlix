'use client';

import React from 'react';
import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface StepMeta {
  key: string;
  title: string;
  description: string;
}

interface FormStepperProps {
  steps: StepMeta[];
  currentStep: number;
  visitedSteps: number[];
  onStepClick: (index: number) => void;
}

export function FormStepper({ steps, currentStep, visitedSteps, onStepClick }: FormStepperProps) {
  return (
    <ol className="flex w-full items-center">
      {steps.map((step, index) => {
        const isCurrent = index === currentStep;
        const isCompleted = index < currentStep;
        const isVisited = visitedSteps.includes(index);
        return (
          <li key={step.key} className={cn("flex items-center", index < steps.length - 1 && "flex-1")}>
            <button
              type="button"
              disabled={!isVisited || isCurrent}
              onClick={() => onStepClick(index)}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-2 py-1 text-left transition-colors",
                isVisited && !isCurrent && "cursor-pointer hover:bg-muted/60",
                (!isVisited || isCurrent) && "cursor-default"
              )}
            >
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isCompleted && "border-primary bg-primary/10 text-primary",
                  !isCurrent && !isCompleted && "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="h-4 w-4" /> : index + 1}
              </span>
              <span className="hidden sm:block">
                <span className={cn(
                  "block text-sm font-medium leading-tight",
                  isCurrent ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
                )}>
                  {step.title}
                </span>
                <span className="block text-xs text-muted-foreground/80 leading-tight mt-0.5">
                  {step.description}
                </span>
              </span>
            </button>
            {index < steps.length - 1 && (
              <div className={cn("mx-3 h-px flex-1", isCompleted ? "bg-primary" : "bg-border")} />
            )}
          </li>
        );
      })}
    </ol>
  );
}
