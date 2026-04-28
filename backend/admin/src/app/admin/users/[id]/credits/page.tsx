'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft } from 'lucide-react';
import useSWR from 'swr';
import api from '@/lib/axios';
import Link from 'next/link';
import type { CreditTransaction, User } from '@/types';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

const TYPE_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  recharge: 'default',
  deduction: 'destructive',
  admin_adjust: 'secondary',
};

export default function CreditHistoryPage() {
  const { t } = useTranslation();
  const params = useParams();
  const userId = params.id as string;

  const { data: user } = useSWR<User>(userId ? `/admin/users/${userId}` : null, fetcher);
  const { data: transactions, isLoading } = useSWR<CreditTransaction[]>(
    userId ? `/admin/users/${userId}/credits/history` : null,
    fetcher
  );

  const getTypeLabel = (type: string) => t(`users.creditsPage.types.${type in TYPE_VARIANT ? type : 'admin_adjust'}`);
  const getTypeVariant = (type: string) => TYPE_VARIANT[type] ?? TYPE_VARIANT.admin_adjust;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon" title={t('users.creditsPage.back')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('users.creditsPage.title')}</h2>
          <p className="text-sm text-muted-foreground">
            {t('users.creditsPage.userLabel', { nickname: user?.nickname || t('users.creditsPage.userLoading') })}
            {user?.email && ` (${user.email})`}
            {user && ` - ${t('users.creditsPage.balanceLabel', { balance: Number(user.credits || 0).toFixed(2) })}`}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('users.creditsPage.table.time')}</TableHead>
              <TableHead>{t('users.creditsPage.table.type')}</TableHead>
              <TableHead className="text-right">{t('users.creditsPage.table.amount')}</TableHead>
              <TableHead className="text-right">{t('users.creditsPage.table.balanceBefore')}</TableHead>
              <TableHead className="text-right">{t('users.creditsPage.table.balanceAfter')}</TableHead>
              <TableHead className="text-right">{t('users.creditsPage.table.tokens')}</TableHead>
              <TableHead>{t('users.creditsPage.table.description')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  {t('users.creditsPage.loading')}
                </TableCell>
              </TableRow>
            ) : !transactions || transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t('users.creditsPage.empty')}
                </TableCell>
              </TableRow>
            ) : transactions.map((tx) => {
              const isPositive = tx.amount > 0;
              return (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm">
                    {new Date(tx.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getTypeVariant(tx.transaction_type)}>{getTypeLabel(tx.transaction_type)}</Badge>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-mono ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{Number(tx.amount).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {Number(tx.balance_before).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono">
                    {Number(tx.balance_after).toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-xs text-muted-foreground">
                    {tx.input_tokens > 0 || tx.output_tokens > 0
                      ? `${tx.input_tokens.toLocaleString()} / ${tx.output_tokens.toLocaleString()}`
                      : '-'}
                  </TableCell>
                  <TableCell className="max-w-xs truncate text-sm" title={tx.description || ''}>
                    {tx.description || '-'}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
