'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAgents, useDeleteAgent } from '@/hooks/useAgents';
import { useLLMProviders } from '@/hooks/useLLMProviders';
import { Agent } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/components/ui/use-toast';
import { Plus, Pencil, Trash2, Search, Bot } from 'lucide-react';

export default function AgentsPage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [searchText, setSearchText] = useState('');
  const [pagination, setPagination] = useState({ current: 1, pageSize: 20 });
  const { toast } = useToast();
  
  const { agents, isLoading, mutate } = useAgents(searchText, pagination.current, pagination.pageSize);
  const { providers } = useLLMProviders();
  const { deleteAgent } = useDeleteAgent();

  const handleDelete = async (id: string) => {
    try {
      await deleteAgent(id);
      toast({
        title: t('agents.toast.deleteSuccess'),
      });
      mutate();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: t('agents.toast.deleteFailed'),
        description: err.response?.data?.detail || t('agents.toast.unknownError'),
      });
    }
  };

  return (
    <div className="max-w-[1200px] mx-auto w-full space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">{t('agents.title')}</h2>
          <p className="text-muted-foreground">{t('agents.subtitle')}</p>
        </div>
        
        <div className="flex items-center gap-2">
           <div className="relative">
             <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
             <Input 
               placeholder={t('agents.searchPlaceholder')}
               className="pl-9 w-[200px]"
               onChange={(e) => setSearchText(e.target.value)}
             />
           </div>

                      
           <Button onClick={() => router.push('/admin/agents/new')}>
             <Plus className="mr-2 h-4 w-4" /> {t('agents.create')}
           </Button>
        </div>
      </div>

      <div className="min-h-[400px]">
        <div className="rounded-md border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('agents.table.name')}</TableHead>
                  <TableHead>{t('agents.table.model')}</TableHead>
                  <TableHead>{t('agents.table.params')}</TableHead>
                  <TableHead>{t('agents.table.capabilities')}</TableHead>
                  <TableHead>{t('agents.table.createdAt')}</TableHead>
                  <TableHead className="text-right">{t('agents.table.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      {t('agents.loading')}
                    </TableCell>
                  </TableRow>
                ) : agents?.map((agent: Agent) => {
                   const provider = providers?.find((p) => p.id === agent.provider_id);
                   return (
                    <TableRow 
                      key={agent.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/admin/agents/${agent.id}`)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <Bot className="h-5 w-5" />
                          </div>
                          <div className="flex flex-col">
                            <span className="font-semibold">{agent.name}</span>
                            <span className="text-xs text-muted-foreground line-clamp-1 max-w-[200px]">{agent.description}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t('agents.table.provider')}</span>
                            <Badge variant="outline" className="font-normal">{provider?.name || 'Unknown'}</Badge>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-muted-foreground">{t('agents.table.modelLabel')}</span>
                            <span className="text-sm font-medium">{agent.model}</span>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1">
                           <div className="flex justify-between text-xs w-32">
                             <span className="text-muted-foreground">{t('agents.table.temperature')}</span>
                             <span className="font-mono">{agent.temperature}</span>
                           </div>
                           <div className="flex justify-between text-xs w-32">
                             <span className="text-muted-foreground">{t('agents.table.contextWindow')}</span>
                             <span className="font-mono">{agent.context_window / 1024}k</span>
                           </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {agent.tools && agent.tools.length > 0 ? (
                             agent.tools.map(tn => (
                              <Badge key={tn} variant="secondary" className="text-xs">
                                 {tn}
                               </Badge>
                             ))
                          ) : (
                             <span className="text-muted-foreground text-xs">{t('agents.noTools')}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="text-muted-foreground text-sm">{new Date(agent.created_at || '').toLocaleDateString()}</span>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => router.push(`/admin/agents/${agent.id}`)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>{t('agents.table.editTooltip')}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t('agents.delete.title')}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t('agents.delete.description', { name: agent.name })}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t('agents.delete.cancel')}</AlertDialogCancel>
                                <AlertDialogAction onClick={() => agent.id && handleDelete(agent.id)}>{t('agents.delete.confirm')}</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                   );
                })}
              </TableBody>
            </Table>
        </div>
      </div>
    </div>
  );
}
