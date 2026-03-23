'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Plus, Pencil, Trash2 } from 'lucide-react';
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
import SkillDialog from './SkillDialog';

interface SkillInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  source: string;
  status: 'active' | 'inactive';
}

const STATUS_CONFIG = {
  active:   { label: '运行中', variant: 'default'     as const },
  inactive: { label: '已停用', variant: 'secondary'   as const },
};

export default function SkillsPage() {
  const { toast } = useToast();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);

  const fetchSkills = async () => {
    try {
      setLoading(true);
      const response = await api.get('/admin/skills');
      setSkills(response.data);
    } catch {
      toast({ title: "加载失败", description: "无法获取技能列表，请检查网络连接", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchSkills(); }, []);

  const handleToggle = async (skill: SkillInfo) => {
    try {
      const response = await api.post(`/admin/skills/${skill.id}/toggle`);
      toast({ title: "操作成功", description: response.data.message });
      fetchSkills();
    } catch (error: any) {
      toast({ title: "操作失败", description: error.response?.data?.detail || "切换技能状态时发生错误", variant: "destructive" });
    }
  };

  const handleDelete = async (skill: SkillInfo) => {
    try {
      await api.delete(`/admin/skills/${skill.name}`);
      toast({ title: "删除成功", description: `技能 ${skill.name} 已删除` });
      fetchSkills();
    } catch (error: any) {
      toast({ title: "删除失败", description: error.response?.data?.detail || "删除技能时发生错误", variant: "destructive" });
    }
  };

  const openCreate = () => {
    setEditingSkill(null);
    setDialogOpen(true);
  };

  const openEdit = (skill: SkillInfo) => {
    setEditingSkill(skill);
    setDialogOpen(true);
  };

  const handleDialogClose = (refresh?: boolean) => {
    setDialogOpen(false);
    setEditingSkill(null);
    refresh && fetchSkills();
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">技能管理 (Skills)</h2>
          <p className="text-muted-foreground mt-2">
            管理 Agent 的扩展能力。技能是声明式的工具包，支持热插拔和版本控制。
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={fetchSkills} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> 创建技能
          </Button>
        </div>
      </div>

      {loading && skills.length === 0 ? (
        <div className="flex justify-center items-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {skills.map(skill => {
            const cfg = STATUS_CONFIG[skill.status];
            return (
              <Card key={skill.id} className="relative group">
                <CardHeader className="pb-3">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-xl font-bold">{skill.name}</CardTitle>
                    <Badge variant={cfg.variant} className="ml-2">{cfg.label}</Badge>
                  </div>
                  <CardDescription className="pt-2">{skill.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground mb-4">
                    <span className="flex items-center">
                      <Badge variant="outline" className="mr-2">{skill.source}</Badge>
                      v{skill.version}
                    </span>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(skill)}>
                      <Pencil className="h-4 w-4" />
                    </Button>

                    {skill.source === 'customized' && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>确认删除</AlertDialogTitle>
                            <AlertDialogDescription>
                              确定要删除技能「{skill.name}」吗？此操作不可撤销。
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>取消</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(skill)}>
                              删除
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}

                    <Button
                      variant={skill.status === 'active' ? 'destructive' : 'default'}
                      size="sm"
                      onClick={() => handleToggle(skill)}
                    >
                      {skill.status === 'active' ? '停用' : '启用'}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <SkillDialog open={dialogOpen} skill={editingSkill} onClose={handleDialogClose} />
    </div>
  );
}
