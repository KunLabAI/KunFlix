'use client';

import React from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Agent } from '@/types';

interface LeaderConfigProps {
  disabled?: boolean;
  availableAgents?: Agent[];
}

const LeaderConfig: React.FC<LeaderConfigProps> = ({ disabled, availableAgents = [] }) => {
  const { control, watch } = useFormContext();
  const { t } = useTranslation();
  const isLeader = watch('is_leader');
  const currentAgentId = watch('id');

  // Filter out current agent from available members
  const memberOptions = availableAgents.filter(agent => agent.id !== currentAgentId);

  return (
    <div className="rounded-xl border bg-card p-5 space-y-6">
      {/* Enable Leader Mode */}
      <div className="flex justify-between items-center">
        <div>
          <span className="text-sm font-medium">{t('agents.form.leader.leaderMode')}</span>
          <p className="text-xs text-muted-foreground mt-1">
            {t('agents.form.leader.leaderModeDesc')}
          </p>
        </div>
        <FormField
          control={control}
          name="is_leader"
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

      {isLeader && (
        <div className="space-y-6 pt-4 border-t">
          {/* Member Agents */}
          <FormField
            control={control}
            name="member_agent_ids"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('agents.form.leader.memberAgents')}</FormLabel>
                <FormDescription>{t('agents.form.leader.memberAgentsDesc')}</FormDescription>
                <div className="grid grid-cols-1 gap-2 mt-2 max-h-48 overflow-y-auto">
                  {memberOptions.length > 0 ? (
                    memberOptions.map((agent) => (
                      <FormItem
                        key={agent.id}
                        className="flex flex-row items-center space-x-3 space-y-0 rounded-md border p-2 shadow-sm"
                      >
                        <FormControl>
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                            checked={field.value?.includes(agent.id)}
                            onChange={(e) => {
                              const current = field.value || [];
                              const updated = e.target.checked
                                ? [...current, agent.id]
                                : current.filter((v: string) => v !== agent.id);
                              field.onChange(updated);
                            }}
                            disabled={disabled}
                          />
                        </FormControl>
                        <div className="flex-1 min-w-0">
                          <FormLabel className="font-medium cursor-pointer truncate block">
                            {agent.name}
                          </FormLabel>
                          <p className="text-xs text-muted-foreground truncate">
                            {agent.description}
                          </p>
                        </div>
                      </FormItem>
                    ))
                  ) : (
                    <p className="text-xs text-muted-foreground p-2">
                      {t('agents.form.leader.noMembers')}
                    </p>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* Max Subtasks */}
          <FormField
            control={control}
            name="max_subtasks"
            render={({ field }) => (
              <FormItem>
                <div className="flex justify-between">
                  <FormLabel>{t('agents.form.leader.maxSubtasks')}</FormLabel>
                  <span className="text-sm text-muted-foreground">{field.value}</span>
                </div>
                <FormControl>
                  <Slider
                    value={[field.value]}
                    onValueChange={(value) => field.onChange(value[0])}
                    min={1}
                    max={20}
                    step={1}
                    disabled={disabled}
                  />
                </FormControl>
                <FormDescription>
                  {t('agents.form.leader.maxSubtasksDesc')}
                </FormDescription>
              </FormItem>
            )}
          />

          {/* Auto Review */}
          <div className="flex justify-between items-center">
            <div>
              <span className="text-sm font-medium">{t('agents.form.leader.autoReview')}</span>
              <p className="text-xs text-muted-foreground mt-1">
                {t('agents.form.leader.autoReviewDesc')}
              </p>
            </div>
            <FormField
              control={control}
              name="enable_auto_review"
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
        </div>
      )}
    </div>
  );
};

export default LeaderConfig;
