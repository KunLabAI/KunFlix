'use client';

import React from 'react';
import { useParams } from 'next/navigation';
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

// 交易类型映射表
const TRANSACTION_TYPE_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' }> = {
  recharge: { label: '充值', variant: 'default' },
  deduction: { label: '消费', variant: 'destructive' },
  admin_adjust: { label: '调整', variant: 'secondary' },
};

export default function CreditHistoryPage() {
  const params = useParams();
  const userId = params.id as string;

  const { data: user } = useSWR<User>(userId ? `/admin/users/${userId}` : null, fetcher);
  const { data: transactions, isLoading } = useSWR<CreditTransaction[]>(
    userId ? `/admin/users/${userId}/credits/history` : null,
    fetcher
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Link href="/admin/users">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">积分历史</h2>
          <p className="text-sm text-muted-foreground">
            用户: {user?.nickname || '加载中...'} ({user?.email})
            {user && ` - 当前余额: ${user.credits?.toFixed(2) || '0.00'}`}
          </p>
        </div>
      </div>

      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>时间</TableHead>
              <TableHead>类型</TableHead>
              <TableHead className="text-right">金额</TableHead>
              <TableHead className="text-right">变动前</TableHead>
              <TableHead className="text-right">变动后</TableHead>
              <TableHead className="text-right">Token</TableHead>
              <TableHead>说明</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  加载中...
                </TableCell>
              </TableRow>
            ) : !transactions || transactions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  暂无积分变动记录
                </TableCell>
              </TableRow>
            ) : transactions.map((tx) => {
              const typeInfo = TRANSACTION_TYPE_MAP[tx.transaction_type] || TRANSACTION_TYPE_MAP.admin_adjust;
              const isPositive = tx.amount > 0;
              return (
                <TableRow key={tx.id}>
                  <TableCell className="text-sm">
                    {new Date(tx.created_at).toLocaleString()}
                  </TableCell>
                  <TableCell>
                    <Badge variant={typeInfo.variant}>{typeInfo.label}</Badge>
                  </TableCell>
                  <TableCell className={`text-right tabular-nums font-mono ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                    {isPositive ? '+' : ''}{tx.amount.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono text-muted-foreground">
                    {tx.balance_before.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums font-mono">
                    {tx.balance_after.toFixed(2)}
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
