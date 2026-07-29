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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Agent } from '@/types';

interface LeaderConfigProps {
  disabled?: boolean;
  availableAgents?: Agent[];
}

// P0-4 评审策略选项（与 backend/services/orchestrator.py 的枚举一致）
const REVIEW_POLICY_OPTIONS = ['final_only', 'per_subtask', 'threshold_based', 'disabled'] as const;
// P1-3 权限模式选项（与 backend/security/permission.py 一致）
const PERMISSION_MODE_OPTIONS = ['default', 'explore', 'bypass'] as const;
// P1-4 编排模式选项
const ORCHESTRATION_STYLE_OPTIONS = ['legacy_json', 'team_tools'] as const;

const LeaderConfig: React.FC<LeaderConfigProps> = ({ disabled, availableAgents = [] }) => {
  const { control, watch } = useFormContext();
  const { t } = useTranslation();
  const isLeader = watch('is_leader');
  const currentAgentId = watch('id');

  // Filter out current agent from available members
  const memberOptions = availableAgents.filter(agent => agent.id !== currentAgentId);

  return (
    <div className="space-y-6">
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

          {/* P0-4: Review Policy */}
          <FormField
            control={control}
            name="review_policy"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('agents.form.leader.reviewPolicy')}</FormLabel>
                <Select
                  value={field.value || 'final_only'}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {REVIEW_POLICY_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {t(`agents.form.leader.reviewPolicyOptions.${opt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(`agents.form.leader.reviewPolicyDescMap.${field.value || 'final_only'}`)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* P1-3: Permission Mode */}
          <FormField
            control={control}
            name="permission_mode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('agents.form.leader.permissionMode')}</FormLabel>
                <Select
                  value={field.value || 'default'}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {PERMISSION_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {t(`agents.form.leader.permissionModeOptions.${opt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(`agents.form.leader.permissionModeDescMap.${field.value || 'default'}`)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* P1-4: Orchestration Style */}
          <FormField
            control={control}
            name="orchestration_style"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('agents.form.leader.orchestrationStyle')}</FormLabel>
                <Select
                  value={field.value || 'legacy_json'}
                  onValueChange={field.onChange}
                  disabled={disabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {ORCHESTRATION_STYLE_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>
                        {t(`agents.form.leader.orchestrationStyleOptions.${opt}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  {t(`agents.form.leader.orchestrationStyleDescMap.${field.value || 'legacy_json'}`)}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}
    </div>
  );
};

export default LeaderConfig;
