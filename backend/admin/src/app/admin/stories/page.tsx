'use client';

import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import useSWR from 'swr';
import api from '@/lib/axios';

const fetcher = (url: string) => api.get(url).then((res) => res.data);

export default function StoriesPage() {
  const { data: stories, error, isLoading } = useSWR('/admin/stories', fetcher);

  return (
    <div className="space-y-4">
      <h2 className="text-3xl font-bold tracking-tight">故事记录</h2>
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">ID</TableHead>
              <TableHead>标题</TableHead>
              <TableHead className="w-[400px]">内容</TableHead>
              <TableHead>创建时间</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
               <TableRow>
                 <TableCell colSpan={4} className="h-24 text-center">
                   加载中...
                 </TableCell>
               </TableRow>
            ) : stories?.map((story: any) => (
              <TableRow key={story.id}>
                <TableCell className="font-medium">{story.id}</TableCell>
                <TableCell>{story.title}</TableCell>
                <TableCell>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div className="max-w-[300px] truncate cursor-default">
                          {story.content}
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p className="max-w-sm">{story.content}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </TableCell>
                <TableCell>{new Date(story.created_at).toLocaleString()}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
