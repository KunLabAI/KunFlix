import React, { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import api from '@/lib/axios';

interface SkillOption {
  name: string;
  description: string;
}

const Tools: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control, watch } = useFormContext();
  const toolsEnabled = watch('tools_enabled');

  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/admin/skills')
      .then((res) => {
        const active = (res.data as Array<{ name: string; description: string; status: string }>)
          .filter((s) => s.status === 'active');
        setSkills(active.map(({ name, description }) => ({ name, description })));
      })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm font-medium">工具能力</span>
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
        <FormField
          control={control}
          name="tools"
          render={({ field }) => (
            <FormItem>
              {loading ? (
                <p className="text-xs text-muted-foreground">正在加载技能列表…</p>
              ) : skills.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  暂无可用技能，请先在技能管理页面创建并启用技能。
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {skills.map((skill) => (
                    <label
                      key={skill.name}
                      className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 shadow-sm cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                        checked={field.value?.includes(skill.name)}
                        onChange={(e) => {
                          const current: string[] = field.value || [];
                          const updated = e.target.checked
                            ? [...current, skill.name]
                            : current.filter((v: string) => v !== skill.name);
                          field.onChange(updated);
                        }}
                        disabled={disabled}
                      />
                      <div className="flex flex-col">
                        <span className="text-sm font-normal">{skill.name}</span>
                        <span className="text-xs text-muted-foreground">{skill.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      ) : (
        <p className="text-xs text-muted-foreground">
          启用工具以允许智能体访问外部数据或执行操作。
        </p>
      )}
    </div>
  );
};

export default Tools;
