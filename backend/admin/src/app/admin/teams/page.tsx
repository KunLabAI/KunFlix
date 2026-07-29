'use client';

/**
 * 智能体团队管理页 —— 完整 CRUD
 *
 * 操作流程：
 * 1. "创建团队"按钮 → Dialog → 选 Leader + 选成员 + 配置参数 → PUT agent
 * 2. 卡片"编辑" → 编辑 Dialog → 修改成员/参数 → PUT agent
 * 3. 卡片"解散" → 确认 → PUT agent (is_leader=false, member_agent_ids=[])
 *
 * 所有操作复用 PUT /api/agents/{id} 接口，不需要独立的 team CRUD API。
 */
import React, { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAgents } from '@/hooks/useAgents';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { Agent } from '@/types';
import api from '@/lib/axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { useToast } from '@/components/ui/use-toast';
import {
  Users2, Search, Crown, ShieldCheck, Gauge, Sparkles, ArrowRight, Plus,
} from 'lucide-react';

// 评审策略选项
const REVIEW_POLICIES = ['final_only', 'per_subtask', 'threshold_based', 'disabled'] as const;
const PERMISSION_MODES = ['default', 'explore', 'bypass'] as const;

// ---------------------------------------------------------------------------
// 团队表单默认值
// ---------------------------------------------------------------------------
interface TeamFormData {
  leaderId: string;
  memberIds: string[];
  maxSubtasks: number;
  reviewPolicy: string;
  permissionMode: string;
  enableAutoReview: boolean;
}

const DEFAULT_FORM: TeamFormData = {
  leaderId: '',
  memberIds: [],
  maxSubtasks: 10,
  reviewPolicy: 'final_only',
  permissionMode: 'default',
  enableAutoReview: true,
};

// ---------------------------------------------------------------------------
// 主页面
// ---------------------------------------------------------------------------

export default function TeamsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const { toast } = useToast();
  const [searchText, setSearchText] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<TeamFormData>(DEFAULT_FORM);

  const { agents, isLoading, isError, mutate } = useAgents('', 1, 100);
  const { providers } = useLLMProviders();

  // id -> Agent 映射
  const agentById = useMemo(() => {
    const m = new Map<string, Agent>();
    (agents || []).forEach((a) => a.id && m.set(a.id, a));
    return m;
  }, [agents]);

  // leaders 列表
  const leaders = useMemo(() => {
    const all = (agents || []).filter((a) => a.is_leader);
    if (!searchText.trim()) return all;
    const kw = searchText.trim().toLowerCase();
    return all.filter((a) =>
      a.name.toLowerCase().includes(kw) || (a.description || '').toLowerCase().includes(kw)
    );
  }, [agents, searchText]);

  // 非 leader 的 agents（可作为 leader 候选）
  const nonLeaderAgents = useMemo(
    () => (agents || []).filter((a) => !a.is_leader),
    [agents],
  );

  // 统计
  const stats = useMemo(() => {
    const totalTeams = leaders.length;
    const totalMembers = leaders.reduce((sum, l) => sum + (l.member_agent_ids?.length || 0), 0);
    const avgMembers = totalTeams > 0 ? (totalMembers / totalTeams).toFixed(1) : '0';
    return { totalTeams, totalMembers, avgMembers };
  }, [leaders]);

  // ----- 创建团队 -----
  const openCreate = () => {
    setForm(DEFAULT_FORM);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.leaderId) return;
    try {
      await api.put(`/agents/${form.leaderId}`, {
        is_leader: true,
        member_agent_ids: form.memberIds,
        max_subtasks: form.maxSubtasks,
        review_policy: form.reviewPolicy,
        permission_mode: form.permissionMode,
        enable_auto_review: form.enableAutoReview,
      });
      toast({ title: t('teams.toast.createSuccess') });
      setCreateOpen(false);
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('teams.toast.error'), description: err?.response?.data?.detail || '' });
    }
  };

  // ----- 编辑团队 -----
  const openEdit = (leader: Agent) => {
    setForm({
      leaderId: leader.id || '',
      memberIds: leader.member_agent_ids || [],
      maxSubtasks: leader.max_subtasks || 10,
      reviewPolicy: leader.review_policy || 'final_only',
      permissionMode: leader.permission_mode || 'default',
      enableAutoReview: leader.enable_auto_review !== false,
    });
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!form.leaderId) return;
    try {
      await api.put(`/agents/${form.leaderId}`, {
        member_agent_ids: form.memberIds,
        max_subtasks: form.maxSubtasks,
        review_policy: form.reviewPolicy,
        permission_mode: form.permissionMode,
        enable_auto_review: form.enableAutoReview,
      });
      toast({ title: t('teams.toast.editSuccess') });
      setEditOpen(false);
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('teams.toast.error'), description: err?.response?.data?.detail || '' });
    }
  };

  // ----- 解散团队 -----
  const handleDissolve = async (leaderId: string) => {
    try {
      await api.put(`/agents/${leaderId}`, {
        is_leader: false,
        member_agent_ids: [],
      });
      toast({ title: t('teams.toast.dissolveSuccess') });
      mutate();
    } catch (err: any) {
      toast({ variant: 'destructive', title: t('teams.toast.error'), description: err?.response?.data?.detail || '' });
    }
  };

  // ----- 成员多选 toggle -----
  const toggleMember = (agentId: string) => {
    setForm((prev) => ({
      ...prev,
      memberIds: prev.memberIds.includes(agentId)
        ? prev.memberIds.filter((id) => id !== agentId)
        : [...prev.memberIds, agentId],
    }));
  };

  // 当前表单中可选的成员（排除自己）
  const availableMembers = useMemo(
    () => (agents || []).filter((a) => a.id !== form.leaderId),
    [agents, form.leaderId],
  );

  // ---------------------------------------------------------------------------
  // 创建/编辑 Dialog 内的表单内容（复用）
  // ---------------------------------------------------------------------------
  const TeamFormContent = ({ isCreate }: { isCreate: boolean }) => (
    <div className="space-y-5 py-2 max-h-[60vh] overflow-y-auto">
      {/* Leader 选择（仅创建时） */}
      {isCreate && (
        <div>
          <label className="text-sm font-medium">{t('teams.create.selectLeader')}</label>
          <p className="text-xs text-muted-foreground mb-2">{t('teams.create.selectLeaderDesc')}</p>
          <Select value={form.leaderId} onValueChange={(v) => setForm({ ...form, leaderId: v, memberIds: [] })}>
            <SelectTrigger><SelectValue placeholder={t('teams.create.selectLeader')} /></SelectTrigger>
            <SelectContent>
              {nonLeaderAgents.map((a) => (
                <SelectItem key={a.id} value={a.id || ''}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* 成员选择 */}
      {form.leaderId && (
        <div>
          <label className="text-sm font-medium">{t('teams.create.selectMembers')}</label>
          <p className="text-xs text-muted-foreground mb-2">{t('teams.create.selectMembersDesc')}</p>
          <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
            {availableMembers.length > 0 ? availableMembers.map((a) => (
              <label key={a.id} className="flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 cursor-pointer">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={form.memberIds.includes(a.id || '')}
                  onChange={() => a.id && toggleMember(a.id)}
                />
                <span className="text-sm font-medium">{a.name}</span>
                <span className="text-xs text-muted-foreground ml-auto truncate max-w-[150px]">{a.description}</span>
              </label>
            )) : (
              <p className="text-xs text-muted-foreground p-2">{t('teams.create.noAvailableAgents')}</p>
            )}
          </div>
        </div>
      )}

      {/* 参数配置 */}
      {form.leaderId && (
        <div className="space-y-4 pt-2 border-t">
          <h4 className="text-sm font-medium">{t('teams.create.settings')}</h4>

          {/* max_subtasks */}
          <div>
            <div className="flex justify-between text-sm">
              <span>{t('teams.create.maxSubtasks')}</span>
              <span className="text-muted-foreground font-mono">{form.maxSubtasks}</span>
            </div>
            <Slider
              value={[form.maxSubtasks]}
              onValueChange={(v) => setForm({ ...form, maxSubtasks: v[0] })}
              min={1} max={20} step={1}
            />
          </div>

          {/* review_policy */}
          <div>
            <label className="text-sm">{t('teams.create.reviewPolicy')}</label>
            <Select value={form.reviewPolicy} onValueChange={(v) => setForm({ ...form, reviewPolicy: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REVIEW_POLICIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(`agents.form.leader.reviewPolicyOptions.${p}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* permission_mode */}
          <div>
            <label className="text-sm">{t('teams.create.permissionMode')}</label>
            <Select value={form.permissionMode} onValueChange={(v) => setForm({ ...form, permissionMode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PERMISSION_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {t(`agents.form.leader.permissionModeOptions.${m}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* auto_review */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm">{t('teams.create.autoReview')}</span>
              <p className="text-xs text-muted-foreground">{t('teams.create.autoReviewDesc')}</p>
            </div>
            <Switch
              checked={form.enableAutoReview}
              onCheckedChange={(v) => setForm({ ...form, enableAutoReview: v })}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('teams.title')}</h2>
          <p className="text-muted-foreground">{t('teams.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={t('teams.filter.searchPlaceholder')}
              className="pl-9 w-[220px]"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> {t('teams.create.title')}
          </Button>
        </div>
      </div>

      {/* 统计条 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: t('teams.stats.totalTeams'), value: stats.totalTeams },
          { label: t('teams.stats.totalMembers'), value: stats.totalMembers },
          { label: t('teams.stats.avgMembers'), value: stats.avgMembers },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-4">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-2xl font-semibold mt-1 font-mono">{s.value}</div>
          </div>
        ))}
      </div>

      {/* 卡片列表 */}
      <div className="min-h-[300px]">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-24 text-sm">{t('teams.loading')}</div>
        ) : isError ? (
          <div className="text-center text-destructive py-24 text-sm">{t('teams.error')}</div>
        ) : leaders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center gap-3">
            <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center">
              <Users2 className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium">{t('teams.empty.title')}</h3>
            <p className="text-sm text-muted-foreground max-w-md">{t('teams.empty.desc')}</p>
            <Button variant="outline" onClick={openCreate}>
              <Plus className="mr-2 h-4 w-4" /> {t('teams.create.title')}
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {leaders.map((leader) => {
              const members = (leader.member_agent_ids || [])
                .map((id) => agentById.get(id))
                .filter((a): a is Agent => Boolean(a));
              const provider = providers?.find((p) => p.id === leader.provider_id);
              return (
                <Card key={leader.id} className="flex flex-col hover:shadow-md transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Crown className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{leader.name}</span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">{t('teams.card.leader')}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{leader.description || '—'}</p>
                        <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                          {provider && <Badge variant="outline" className="font-normal">{provider.name}</Badge>}
                          <span className="font-mono truncate">{leader.model}</span>
                        </div>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col gap-3 pb-4">
                    {/* 成员 */}
                    <div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
                        <Users2 className="h-3.5 w-3.5" />
                        <span>{t('teams.card.members')}</span>
                        <span className="ml-auto font-mono">{members.length}</span>
                      </div>
                      {members.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {members.map((m) => (
                            <span key={m.id} className="inline-flex items-center rounded-md border bg-muted/40 px-2 py-0.5 text-xs max-w-[140px] truncate">
                              {m.name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground italic">{t('teams.card.noMembers')}</p>
                      )}
                    </div>
                    {/* 配置摘要 */}
                    <div className="grid grid-cols-2 gap-1.5 text-xs">
                      <span className="text-muted-foreground">{t('teams.card.maxSubtasks')}</span>
                      <span className="text-right font-mono">{leader.max_subtasks || 10}</span>
                      <span className="text-muted-foreground">{t('teams.card.reviewPolicy')}</span>
                      <Badge variant="secondary" className="justify-self-end text-[10px] font-normal">
                        {t(`agents.form.leader.reviewPolicyOptions.${leader.review_policy || 'final_only'}`)}
                      </Badge>
                    </div>
                    {/* 操作按钮 */}
                    <div className="flex items-center justify-between pt-2 border-t mt-auto">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => openEdit(leader)}>
                        {t('teams.card.editTeam')}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive">
                            {t('teams.card.dissolve')}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('teams.dissolve.title')}</AlertDialogTitle>
                            <AlertDialogDescription>{t('teams.dissolve.desc')}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.buttons.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => leader.id && handleDissolve(leader.id)}>
                              {t('teams.dissolve.confirm')}
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 创建团队 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('teams.create.title')}</DialogTitle>
          </DialogHeader>
          <TeamFormContent isCreate={true} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{t('common.buttons.cancel')}</Button></DialogClose>
            <Button onClick={handleCreate} disabled={!form.leaderId || form.memberIds.length === 0}>
              {t('teams.create.submit')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑团队 Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{t('teams.edit.title')} — {agentById.get(form.leaderId)?.name}</DialogTitle>
          </DialogHeader>
          <TeamFormContent isCreate={false} />
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">{t('common.buttons.cancel')}</Button></DialogClose>
            <Button onClick={handleEdit}>{t('teams.edit.submit')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
