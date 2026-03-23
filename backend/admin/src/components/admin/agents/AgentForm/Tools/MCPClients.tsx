import React, { useEffect, useState } from 'react';
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Server } from 'lucide-react';

interface MCPClientOption {
  id: string;
  name: string;
  description: string;
}

// 模拟数据，因为当前系统可能尚未提供获取可用MCP客户端的API
const mockMcpClients: MCPClientOption[] = [
  { id: 'local_sqlite', name: 'local_sqlite', description: '本地 SQLite 数据库查询' },
  { id: 'remote_weather', name: 'remote_weather', description: '实时天气数据查询' }
];

const MCPClients: React.FC<{ disabled?: boolean }> = ({ disabled }) => {
  const { control } = useFormContext();
  const [clients, setClients] = useState<MCPClientOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 模拟从API获取数据
    const fetchClients = async () => {
      try {
        // TODO: 替换为真实的MCP客户端获取API
        // const res = await api.get('/admin/mcp/clients');
        // setClients(res.data);
        setTimeout(() => {
          setClients(mockMcpClients);
          setLoading(false);
        }, 300);
      } catch (error) {
        setClients([]);
        setLoading(false);
      }
    };
    
    fetchClients();
  }, []);

  return (
    <div className="mt-6 border-t pt-4">
      <h4 className="text-sm font-medium mb-3 flex items-center">
        <Server className="w-4 h-4 mr-2 text-muted-foreground" />
        MCP 客户端 (Model Context Protocol)
      </h4>
      <FormField
        control={control}
        name="tools"
        render={({ field }) => (
          <FormItem>
            {loading ? (
              <p className="text-xs text-muted-foreground">正在加载 MCP 客户端…</p>
            ) : clients.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                暂无可用 MCP 客户端，请先在MCP管理页面配置。
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {clients.map((client) => (
                  <label
                    key={client.id}
                    className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-2 shadow-sm cursor-pointer hover:bg-accent/50"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      checked={field.value?.includes(client.id)}
                      onChange={(e) => {
                        const current: string[] = field.value || [];
                        const updated = e.target.checked
                          ? [...current, client.id]
                          : current.filter((v: string) => v !== client.id);
                        field.onChange(updated);
                      }}
                      disabled={disabled}
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-normal">{client.name}</span>
                      <span className="text-xs text-muted-foreground">{client.description}</span>
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

export default MCPClients;
