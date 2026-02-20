'use client';
import React, { useState } from 'react';
import { Layout, Menu, Breadcrumb, theme, Avatar, Dropdown, Button } from 'antd';
import {
  PieChartOutlined,
  TeamOutlined,
  UserOutlined,
  BookOutlined,
  RobotOutlined,
  MenuUnfoldOutlined,
  MenuFoldOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import type { MenuProps } from 'antd';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

const { Header, Content, Footer, Sider } = Layout;

type MenuItem = Required<MenuProps>['items'][number];

function getItem(
  label: React.ReactNode,
  key: React.Key,
  icon?: React.ReactNode,
  children?: MenuItem[],
): MenuItem {
  return {
    key,
    icon,
    children,
    label,
  } as MenuItem;
}

const items: MenuItem[] = [
  getItem(<Link href="/admin">仪表盘</Link>, '/admin', <PieChartOutlined />),
  getItem(<Link href="/admin/llm">AI 供应商</Link>, '/admin/llm', <RobotOutlined />),
  getItem(<Link href="/admin/agents">智能体管理</Link>, '/admin/agents', <RocketOutlined />),
  getItem(<Link href="/admin/players">玩家管理</Link>, '/admin/players', <TeamOutlined />),
  getItem(<Link href="/admin/stories">故事管理</Link>, '/admin/stories', <BookOutlined />),
];

const AdminLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [collapsed, setCollapsed] = useState(false);
  const {
    token: { colorBgContainer, borderRadiusLG },
  } = theme.useToken();
  const pathname = usePathname();
  const router = useRouter();
  const { logout } = useAuth();

  const handleMenuClick: MenuProps['onClick'] = (e) => {
    // router.push(e.key); // Link component handles this
  };

  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  const userMenu: MenuProps['items'] = [
    {
      key: 'logout',
      label: '退出登录',
      onClick: () => {
        logout();
      }
    }
  ];

  const getBreadcrumbItems = () => {
    const pathSnippets = pathname.split('/').filter((i) => i);
    const breadcrumbItems = pathSnippets.map((_, index) => {
      const url = `/${pathSnippets.slice(0, index + 1).join('/')}`;
      const title = pathSnippets[index];
      let displayTitle = title;
      
      if (title === 'admin') displayTitle = '后台管理';
      else if (title === 'llm') displayTitle = 'AI 供应商';
      else if (title === 'agents') displayTitle = '智能体管理';
      else if (title === 'players') displayTitle = '玩家管理';
      else if (title === 'stories') displayTitle = '故事管理';
      
      return { title: displayTitle };
    });
    return breadcrumbItems;
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)}>
        <div className="demo-logo-vertical" style={{ height: 32, margin: 16, background: 'rgba(255, 255, 255, 0.2)', borderRadius: 6 }} />
        <Menu 
          theme="dark" 
          defaultSelectedKeys={[pathname]} 
          mode="inline" 
          items={items} 
          selectedKeys={[pathname]}
        />
      </Sider>
      <Layout>
        <Header style={{ padding: 0, background: colorBgContainer, display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingRight: 24 }}>
           <Button
            type="text"
            icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
            onClick={() => setCollapsed(!collapsed)}
            style={{
              fontSize: '16px',
              width: 64,
              height: 64,
            }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
             <Dropdown menu={{ items: userMenu }}>
                <div style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Avatar icon={<UserOutlined />} />
                  <span>管理员</span>
                </div>
             </Dropdown>
          </div>
        </Header>
        <Content style={{ margin: '16px 16px' }}>
          <div
            style={{
              padding: 24,
              minHeight: 360,
              background: colorBgContainer,
              borderRadius: borderRadiusLG,
            }}
          >
            {children}
          </div>
        </Content>
        <Footer style={{ textAlign: 'center' }}>
          Infinite Game Admin ©{new Date().getFullYear()} 由 Ant Design 驱动
        </Footer>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
