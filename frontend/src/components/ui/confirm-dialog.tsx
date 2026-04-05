"use client";

import { useState, useCallback } from "react";
import { AlertTriangle, Trash2, Edit3, type LucideIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

// 对话框类型配置
const DIALOG_TYPES: Record<string, { icon: LucideIcon; iconClass: string; confirmClass: string }> = {
  delete: {
    icon: Trash2,
    iconClass: "text-destructive bg-destructive/10",
    confirmClass: "bg-destructive hover:bg-destructive/90 text-destructive-foreground",
  },
  edit: {
    icon: Edit3,
    iconClass: "text-primary bg-primary/10",
    confirmClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-yellow-500 bg-yellow-500/10",
    confirmClass: "bg-primary hover:bg-primary/90 text-primary-foreground",
  },
};

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  type?: "delete" | "edit" | "warning";
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  type = "warning",
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  loading = false,
}: ConfirmDialogProps) {
  const config = DIALOG_TYPES[type];
  const Icon = config.icon;

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
  };

  const handleConfirm = () => {
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-6">
        <DialogHeader className="gap-4">
          <div className="flex items-start gap-4">
            <div className={cn("p-3 rounded-xl shrink-0", config.iconClass)}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="space-y-2">
              <DialogTitle className="text-lg font-semibold leading-tight">
                {title}
              </DialogTitle>
              {description && (
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  {description}
                </DialogDescription>
              )}
            </div>
          </div>
        </DialogHeader>
        
        <DialogFooter className="gap-3 sm:gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className={cn(
              "flex-1 h-10 px-4 rounded-lg font-medium text-sm",
              "bg-secondary text-secondary-foreground",
              "hover:bg-secondary/80",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading}
            className={cn(
              "flex-1 h-10 px-4 rounded-lg font-medium text-sm",
              config.confirmClass,
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                处理中...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook for using confirm dialog
interface UseConfirmDialogOptions {
  title: string;
  description?: string;
  type?: "delete" | "edit" | "warning";
  confirmText?: string;
  cancelText?: string;
}

export function useConfirmDialog() {
  const [state, setState] = useState<{
    open: boolean;
    options: UseConfirmDialogOptions | null;
    resolve: ((value: boolean) => void) | null;
    loading: boolean;
  }>({
    open: false,
    options: null,
    resolve: null,
    loading: false,
  });

  const confirm = useCallback((options: UseConfirmDialogOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        options,
        resolve,
        loading: false,
      });
    });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const handleConfirm = useCallback(() => {
    state.resolve?.(true);
    setState((prev) => ({ ...prev, open: false, loading: false }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(false);
    setState((prev) => ({ ...prev, open: false, loading: false }));
  }, [state.resolve]);

  const dialog = state.options ? (
    <ConfirmDialog
      open={state.open}
      onOpenChange={(open) => !open && handleCancel()}
      title={state.options.title}
      description={state.options.description}
      type={state.options.type}
      confirmText={state.options.confirmText}
      cancelText={state.options.cancelText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      loading={state.loading}
    />
  ) : null;

  return { confirm, dialog, setLoading };
}

// Simple input dialog for rename
interface InputDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: (value: string) => void;
  onCancel?: () => void;
  loading?: boolean;
}

export function InputDialog({
  open,
  onOpenChange,
  title,
  description,
  defaultValue = "",
  placeholder = "请输入...",
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
  onCancel,
  loading = false,
}: InputDialogProps) {
  const [value, setValue] = useState(defaultValue);

  const handleCancel = () => {
    onCancel?.();
    onOpenChange(false);
    setValue(defaultValue);
  };

  const handleConfirm = () => {
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.key === "Enter" && handleConfirm();
    e.key === "Escape" && handleCancel();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md gap-6">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Edit3 className="w-5 h-5 text-primary" />
            </div>
            <DialogTitle className="text-lg font-semibold">
              {title}
            </DialogTitle>
          </div>
          {description && (
            <DialogDescription className="text-sm text-muted-foreground ml-10">
              {description}
            </DialogDescription>
          )}
        </DialogHeader>
        
        <div className="ml-10">
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            autoFocus
            className={cn(
              "w-full h-10 px-3 rounded-lg",
              "bg-secondary border border-border",
              "text-foreground placeholder:text-muted-foreground",
              "focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
              "transition-all"
            )}
          />
        </div>
        
        <DialogFooter className="gap-3 sm:gap-3">
          <button
            onClick={handleCancel}
            disabled={loading}
            className={cn(
              "flex-1 h-10 px-4 rounded-lg font-medium text-sm",
              "bg-secondary text-secondary-foreground",
              "hover:bg-secondary/80",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || !value.trim()}
            className={cn(
              "flex-1 h-10 px-4 rounded-lg font-medium text-sm",
              "bg-primary hover:bg-primary/90 text-primary-foreground",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "transition-colors"
            )}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                处理中...
              </span>
            ) : (
              confirmText
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hook for using input dialog
interface UseInputDialogOptions {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

export function useInputDialog() {
  const [state, setState] = useState<{
    open: boolean;
    options: UseInputDialogOptions | null;
    resolve: ((value: string | null) => void) | null;
    loading: boolean;
  }>({
    open: false,
    options: null,
    resolve: null,
    loading: false,
  });

  const input = useCallback((options: UseInputDialogOptions): Promise<string | null> => {
    return new Promise((resolve) => {
      setState({
        open: true,
        options,
        resolve,
        loading: false,
      });
    });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, loading }));
  }, []);

  const handleConfirm = useCallback((value: string) => {
    state.resolve?.(value);
    setState((prev) => ({ ...prev, open: false, loading: false }));
  }, [state.resolve]);

  const handleCancel = useCallback(() => {
    state.resolve?.(null);
    setState((prev) => ({ ...prev, open: false, loading: false }));
  }, [state.resolve]);

  const dialog = state.options ? (
    <InputDialog
      open={state.open}
      onOpenChange={(open) => !open && handleCancel()}
      title={state.options.title}
      description={state.options.description}
      defaultValue={state.options.defaultValue}
      placeholder={state.options.placeholder}
      confirmText={state.options.confirmText}
      cancelText={state.options.cancelText}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
      loading={state.loading}
    />
  ) : null;

  return { input, dialog, setLoading };
}
