'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Loader2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import api from '@/lib/axios';

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  status: 'active' | 'inactive';
}

const STATUS_VARIANT: Record<SkillInfo['status'], 'default' | 'secondary'> = {
  active: 'default',
  inactive: 'secondary',
};

export default function SkillsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/skills');
      setSkills(response.data);
    } catch {
      toast({
        title: t('skills.toast.loadFailed'),
        description: t('skills.toast.loadFailedDesc'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSkills(); }, []);

  const handleToggle = async (skill: SkillInfo) => {
    try {
      const response = await api.post(`/admin/skills/${skill.id}/toggle`);
      toast({ title: t('skills.toast.operationSuccess'), description: response.data.message });
      fetchSkills();
    } catch (error: any) {
      toast({
        title: t('skills.toast.operationFailed'),
        description: error.response?.data?.detail || t('skills.toast.toggleFailed'),
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (skill: SkillInfo) => {
    try {
      await api.delete(`/admin/skills/${skill.name}`);
      toast({
        title: t('skills.toast.deleteSuccess'),
        description: t('skills.toast.deleteSuccessDesc', { name: skill.name }),
      });
      fetchSkills();
    } catch (error: any) {
      toast({
        title: t('skills.toast.deleteFailed'),
        description: error.response?.data?.detail || t('skills.toast.deleteFailedDesc'),
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('skills.title')}</h2>
          <p className="text-muted-foreground mt-2">{t('skills.subtitle')}</p>
        </div>
        <Button onClick={() => router.push('/admin/skills/new')}>
          <Plus className="mr-2 h-4 w-4" /> {t('skills.createBtn')}
        </Button>
      </div>

      {loading && skills.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
          {skills.map(skill => {
            const variant = STATUS_VARIANT[skill.status];
            const sourceLabel = t(`skills.source.${skill.source}`, { defaultValue: skill.source });
            return (
              <div
                key={skill.id}
                className="group relative flex flex-col rounded-xl bg-background border border-border cursor-pointer overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:shadow-md hover:border-primary/50"
                onClick={() => router.push(`/admin/skills/${skill.name}`)}
                role="button"
                tabIndex={0}
              >
                {/* 顶部强调线 */}
                <div className="absolute top-0 left-0 right-0 h-1 bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                {/* 卡片主体 */}
                <div className="p-5 flex-1 flex flex-col justify-center">
                  <div className="flex items-center justify-between gap-4">
                    <div className="overflow-hidden">
                      <h3 className="font-semibold text-lg leading-tight text-foreground mb-2 truncate" title={skill.name}>
                        {skill.name}
                      </h3>
                      <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{skill.description}</p>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{sourceLabel}</Badge>
                        <span className="font-mono text-xs text-muted-foreground">v{skill.version}</span>
                      </div>
                    </div>
                    <Badge variant={variant} className="shrink-0">{t(`skills.status.${skill.status}`)}</Badge>
                  </div>
                </div>

                {/* 底部操作区 */}
                <div className="px-5 py-3 border-t border-border/50 flex items-center justify-between transition-colors duration-300 group-hover:bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                    {t('skills.action.edit')}
                    <ArrowRight className="w-3 h-3 opacity-0 -ml-2 group-hover:opacity-100 group-hover:ml-0 transition-all duration-300" />
                  </span>

                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    {skill.source === 'customized' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive opacity-0 group-hover:opacity-100 transition-all duration-300">
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('skills.delete.title')}</AlertDialogTitle>
                            <AlertDialogDescription>
                              {t('skills.delete.description', { name: skill.name })}
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('skills.delete.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(skill)}>
                              {t('skills.delete.confirm')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    <Button
                      variant={skill.status === 'active' ? 'destructive' : 'default'}
                      size="sm"
                      className="h-7 px-2.5 text-xs opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                      onClick={() => handleToggle(skill)}
                    >
                      {skill.status === 'active' ? t('skills.action.disable') : t('skills.action.enable')}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
