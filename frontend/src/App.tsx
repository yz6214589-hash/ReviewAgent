import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { App as AntApp, ConfigProvider, theme as antdTheme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { useThemeStore } from './stores/themeStore';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppLayout } from './layouts/AppLayout';
import { Workbench } from './pages/Workbench';
import { TaskList } from './pages/TaskList';
import { Config } from './pages/Config';
import { Standard } from './pages/Standard';

export default function App() {
  const mode = useThemeStore((s) => s.mode);
  const dark = mode === 'dark';

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
  }, [mode]);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        cssVar: true,
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: {
          colorPrimary: dark ? '#00d4ff' : '#165dff',
          colorInfo: dark ? '#00d4ff' : '#165dff',
          borderRadius: 8,
          colorBgLayout: dark ? '#0b0e1d' : '#f7f8fa',
          colorBgContainer: dark ? '#141a30' : '#ffffff',
          colorBgElevated: dark ? '#1a2140' : '#ffffff',
          colorBorder: dark ? '#232a45' : '#e5e8ef',
          colorBorderSecondary: dark ? '#232a45' : '#eef0f5',
          fontSize: 13,
        },
        components: {
          Menu: {
            itemBg: 'transparent',
            activeBarBorderWidth: 0,
          },
        },
      }}
    >
      <AntApp>
        <ErrorBoundary>
          <div className="ra-app">
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/workbench" element={<Workbench />} />
                <Route path="/workbench/:taskId" element={<Workbench />} />
                <Route path="/tasks" element={<TaskList />} />
                <Route path="/config" element={<Config />} />
                <Route path="/standard" element={<Standard />} />
                <Route path="*" element={<Navigate to="/workbench" replace />} />
              </Route>
            </Routes>
          </div>
        </ErrorBoundary>
      </AntApp>
    </ConfigProvider>
  );
}
