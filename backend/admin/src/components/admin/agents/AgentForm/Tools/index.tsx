import React from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormControl,
  FormField,
  FormItem,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import Skills from './Skills';
import MCPClients from './MCPClients';
import ToolCapabilities from './ToolCapabilities';

const Tools: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control, watch } = useFormContext();
  const { t } = useTranslation();
  const toolsEnabled = watch('tools_enabled');

  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex justify-between items-center mb-4">
        <div>
          <span className="text-sm font-medium">{t('agents.form.tools.title')}</span>
          <p className="text-xs text-muted-foreground mt-1">
            {t('agents.form.tools.desc')}
          </p>
        </div>
        <FormField
          control={control}
          name="tools_enabled"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Switch
                  checked={field.value}
                  onCheckedChange={field.onChange}
                  disabled={disabled}
                />
              </FormControl>
            </FormItem>
          )}
        />
      </div>

      {toolsEnabled ? (
        <div className="space-y-2">
          <Skills disabled={disabled} />
          <MCPClients disabled={disabled} />
          <ToolCapabilities disabled={disabled} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground border-t pt-4">
          {t('agents.form.tools.noToolsEnabled')}
        </p>
      )}
    </div>
  );
};

export default Tools;
