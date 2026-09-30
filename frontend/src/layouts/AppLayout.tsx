import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Menu, Tooltip } from 'antd';
import { MoonOutlined, SunOutlined } from '@ant-design/icons';
import { useThemeStore } from '../stores/themeStore';
import { TaskSwitcher } from '../components/TaskSwitcher';

const MENU_ITEMS = [
  { key: '/workbench', label: '工作台' },
  { key: '/tasks', label: '任务列表' },
  { key: '/config', label: '配置管理' },
  { key: '/standard', label: '评审标准说明' },
];

export function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const mode = useThemeStore((s) => s.mode);
  const toggle = useThemeStore((s) => s.toggle);

  const selectedKey =
    MENU_ITEMS.find((i) => location.pathname.startsWith(i.key))?.key ?? '/workbench';

  return (
    <>
      <header className="ra-topbar">
        <div className="ra-logo" onClick={() => navigate('/workbench')}>
          <div className="ra-logo-cube">评</div>
          <span className="ra-logo-title">评审智能体</span>
          <span className="ra-logo-tag">内网版</span>
        </div>

        <TaskSwitcher />

        <div className="ra-topbar-spacer" />

        <Menu
          mode="horizontal"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={({ key }) => navigate(key)}
          style={{ flex: 'none', minWidth: 360, borderBottom: 'none', background: 'transparent' }}
        />

        <div className="ra-topbar-spacer" />

        <Tooltip title={mode === 'dark' ? '切换为明亮主题' : '切换为暗色主题'}>
          <div className="ra-icon-btn" onClick={toggle}>
            {mode === 'dark' ? <SunOutlined /> : <MoonOutlined />}
          </div>
        </Tooltip>

        <div className="ra-avatar" title="专家秘书">
          秘
        </div>
      </header>

      <main>
        <Outlet />
      </main>
    </>
  );
}
