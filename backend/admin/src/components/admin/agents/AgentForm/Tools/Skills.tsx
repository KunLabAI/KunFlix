import React, { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import api from '@/lib/axios';

interface SkillOption {
  name: string;
  description: string;
}

const Skills: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control, getValues, setValue } = useFormContext();
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/admin/skills')
      .then((res) => {
        const active = (res.data as Array<{ name: string; description: string; status: string }>)
          .filter((s) => s.status === 'active');
        const activeSkills = active.map(({ name, description }) => ({ name, description }));
        setSkills(activeSkills);

        // 清理已不存在的skill：如果表单中的tools包含已删除的skill，自动过滤掉
        const currentTools: string[] = getValues('tools') || [];
        const validSkillNames = new Set(activeSkills.map(s => s.name));
        const validTools = currentTools.filter(t => validSkillNames.has(t));
        if (validTools.length !== currentTools.length) {
          setValue('tools', validTools, { shouldDirty: true });
        }
      })
      .catch(() => setSkills([]))
      .finally(() => setLoading(false));
  }, [getValues, setValue]);

  return (
    <div>
      <h4 className="text-sm font-medium mb-3">{t('agents.form.tools.skills.title')}</h4>
      <FormField
        control={control}
        name="tools"
        render={({ field }) => (
          <FormItem>
            {loading ? (
              <p className="text-xs text-muted-foreground">{t('agents.form.tools.skills.loading')}</p>
            ) : skills.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('agents.form.tools.skills.empty')}
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {skills.map((skill) => (
                  <label
                    key={skill.name}
                    className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 shadow-sm cursor-pointer hover:bg-accent/50"
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
    </div>
  );
};

export default Skills;
