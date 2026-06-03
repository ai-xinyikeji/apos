'use client';

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button, buttonVariants } from '@/components/ui/button';
import { 
  Key, 
  Eye, 
  EyeOff, 
  Save, 
  Loader2, 
  CheckCircle2, 
  AlertCircle,
  Activity,
  Cpu,
  Globe,
  ShieldCheck,
  RefreshCw,
  Terminal,
  Copy,
  Plug,
  FileCode,
  X,
  Trash2
} from 'lucide-react';
import { GithubIcon } from '@/components/icons';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/toast';

export default function SettingsPage() {
  const { addToast } = useToast();
  const [formData, setFormData] = useState({
    openai_api_key: '',
    anthropic_api_key: '',
    google_api_key: '',
    deepseek_api_key: '',
    custom_openai_base_url: '',
    custom_openai_api_key: '',
    custom_openai_model: '',
    github_token: '',
    chatgpt_cookies: '',
    gemini_cookies: '',
    kimi_cookies: '',
    use_lmstudio: 'false',
    OPENHANDS_API_URL: '',
    enable_context_compression: 'false',
    context_compression_threshold: '8000',
    model_ProtoBuilder: 'default',
    model_ReviewBot: 'default',
    model_SignalCollector: 'default',
    model_ReportGenerator: 'default',
    model_task_reasoning: 'default',
    model_task_coding: 'default',
    model_task_retrieval: 'default',
    model_task_planning: 'default',
    model_task_refactor: 'default',
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncingCookies, setSyncingCookies] = useState(false);
  const [extensionInstalled, setExtensionInstalled] = useState(false);
  const [capturedHeaders, setCapturedHeaders] = useState<{
    chatgpt: Record<string, string> | null;
    gemini: Record<string, string> | null;
    kimi: Record<string, string> | null;
  }>({ chatgpt: null, gemini: null, kimi: null });
  const [showHeaderDetails, setShowHeaderDetails] = useState<Record<string, boolean>>({
    chatgpt: false, gemini: false, kimi: false,
  });
  const [extStatus, setExtStatus] = useState<{
    online: boolean;
    lastHeartbeatAt: number | null;
    version: string | null;
    tabs: {
      chatgpt: { open: boolean; url?: string };
      gemini:  { open: boolean; url?: string };
      kimi:    { open: boolean; url?: string };
      google:  { open: boolean; url?: string };
    };
    logs: Array<{ ts: number; level: string; msg: string }>;
  } | null>(null);
  const [showExtLogs, setShowExtLogs] = useState(false);
  const [lmStudioStatus, setLMStudioStatus] = useState<{
    available: boolean;
    models: string[];
    checking: boolean;
  }>({ available: false, models: [], checking: false });
  const [openHandsStatus, setOpenHandsStatus] = useState<{
    available: boolean;
    checking: boolean;
  }>({ available: false, checking: false });
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Test connection state
  const [testingProvider, setTestingProvider] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; timestamp: number } | null>>({
    chatgpt: null,
    gemini: null,
    kimi: null,
  });

  async function checkOpenHands(targetUrl?: string) {
    const urlToCheck = targetUrl !== undefined ? targetUrl : formData.OPENHANDS_API_URL;
    if (!urlToCheck) {
      setOpenHandsStatus({ available: false, checking: false });
      return;
    }
    setOpenHandsStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch(`/api/openhands/status?url=${encodeURIComponent(urlToCheck)}`);
      if (res.ok) {
        const data = await res.json();
        setOpenHandsStatus({
          available: data.available,
          checking: false,
        });
      } else {
        setOpenHandsStatus({ available: false, checking: false });
      }
    } catch {
      setOpenHandsStatus({ available: false, checking: false });
    }
  }
  
  // MCP Integration state
  const [mcpConfig, setMcpConfig] = useState<string>('');
  const [mcpLoading, setMcpLoading] = useState(false);
  const [mcpWriting, setMcpWriting] = useState(false);
  const [mcpMessage, setMcpMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [targetProjectPath, setTargetProjectPath] = useState('');
  const [claudeMdGenerating, setClaudeMdGenerating] = useState(false);


  // Toggle visibility of keys
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({
    openai: false,
    anthropic: false,
    google: false,
    deepseek: false,
    custom_openai: false,
    github: false,
    chatgpt: false,
    gemini: false,
    kimi: false,
  });

  const toggleVisibility = (key: string) => {
    setShowKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  async function loadSettings() {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        setFormData({
          openai_api_key: data.openai_api_key || '',
          anthropic_api_key: data.anthropic_api_key || '',
          google_api_key: data.google_api_key || '',
          deepseek_api_key: data.deepseek_api_key || '',
          custom_openai_base_url: data.custom_openai_base_url || '',
          custom_openai_api_key: data.custom_openai_api_key || '',
          custom_openai_model: data.custom_openai_model || '',
          github_token: data.github_token || '',
          chatgpt_cookies: data.chatgpt_cookies || '',
          gemini_cookies: data.gemini_cookies || '',
          kimi_cookies: data.kimi_cookies || '',
          use_lmstudio: data.use_lmstudio || 'false',
          OPENHANDS_API_URL: data.OPENHANDS_API_URL || '',
          enable_context_compression: data.enable_context_compression || 'false',
          context_compression_threshold: data.context_compression_threshold || '8000',
          model_ProtoBuilder: data.model_ProtoBuilder || 'default',
          model_ReviewBot: data.model_ReviewBot || 'default',
          model_SignalCollector: data.model_SignalCollector || 'default',
          model_ReportGenerator: data.model_ReportGenerator || 'default',
          model_task_reasoning: data.model_task_reasoning || 'default',
          model_task_coding: data.model_task_coding || 'default',
          model_task_retrieval: data.model_task_retrieval || 'default',
          model_task_planning: data.model_task_planning || 'default',
          model_task_refactor: data.model_task_refactor || 'default',
        });
        // Load captured headers
        setCapturedHeaders({
          chatgpt: data.chatgpt_headers || null,
          gemini: data.gemini_headers || null,
          kimi: data.kimi_headers || null,
        });
        return data;
      }
    } catch (err) {
      console.error('Failed to load settings', err);
    } finally {
      setLoading(false);
    }
  }

  async function checkLMStudio() {
    setLMStudioStatus(prev => ({ ...prev, checking: true }));
    try {
      const res = await fetch('/api/lmstudio');
      if (res.ok) {
        const data = await res.json();
        setLMStudioStatus({
          available: data.available,
          models: data.models || [],
          checking: false,
        });
      } else {
        setLMStudioStatus({ available: false, models: [], checking: false });
      }
    } catch (err) {
      setLMStudioStatus({ available: false, models: [], checking: false });
    }
  }

  const [configPaths, setConfigPaths] = useState<Array<{ label: string; path: string }>>([]);
  const [configJson, setConfigJson] = useState<string>('');

  async function loadMcpConfig() {
    setMcpLoading(true);
    try {
      const res = await fetch('/api/mcp/config');
      if (res.ok) {
        const data = await res.json();
        setConfigJson(data.configJson || '');
        setConfigPaths(data.configPaths || []);
        if (data.aposDir) {
          setTargetProjectPath(data.aposDir);
        }
      }
    } catch (err) {
      console.error('Failed to load MCP config', err);
    } finally {
      setMcpLoading(false);
    }
  }

  const handleWriteMcpConfig = async () => {
    setMcpWriting(true);
    setMcpMessage(null);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'write_claude_config' }),
      });
      const data = await res.json();
      if (data.success) {
        setMcpMessage({ type: 'success', text: `配置已自动写入成功！路径: ${data.configPath}` });
        addToast({
          type: 'success',
          title: '配置写入成功',
          description: 'Claude Code 配置文件已自动更新。',
        });
      } else {
        setMcpMessage({ type: 'error', text: `配置写入失败: ${data.message}` });
      }
    } catch (err: any) {
      setMcpMessage({ type: 'error', text: `请求异常: ${err.message}` });
    } finally {
      setMcpWriting(false);
    }
  };

  const [mcpCleaning, setMcpCleaning] = useState(false);
  const [claudeMdDeleting, setClaudeMdDeleting] = useState(false);

  const handleCleanMcpConfig = async () => {
    if (!confirm('确定要从 Claude 全局配置中移除 APOS 联动吗？(这只删除 APOS，不会影响其他工具配置)')) return;
    setMcpCleaning(true);
    setMcpMessage(null);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clean_claude_config' }),
      });
      const data = await res.json();
      if (data.success) {
        setMcpMessage({ type: 'success', text: data.message });
        addToast({
          type: 'success',
          title: '配置清理成功',
          description: 'APOS 配置已从 Claude Code 配置文件中擦除。',
        });
      } else {
        setMcpMessage({ type: 'error', text: `清理失败: ${data.message}` });
      }
    } catch (err: any) {
      setMcpMessage({ type: 'error', text: `请求异常: ${err.message}` });
    } finally {
      setMcpCleaning(false);
    }
  };

  const handleDeleteClaudeMd = async () => {
    if (!confirm('确定要从该项目路径中彻底删除 CLAUDE.md 文件吗？')) return;
    setClaudeMdDeleting(true);
    setMcpMessage(null);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_claude_md',
          targetPath: targetProjectPath,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMcpMessage({ type: 'success', text: data.message });
        addToast({
          type: 'success',
          title: '文件删除成功',
          description: '项目中的 CLAUDE.md 文件已彻底清除。',
        });
      } else {
        setMcpMessage({ type: 'error', text: `删除失败: ${data.message}` });
      }
    } catch (err: any) {
      setMcpMessage({ type: 'error', text: `请求异常: ${err.message}` });
    } finally {
      setClaudeMdDeleting(false);
    }
  };

  const handleGenerateClaudeMd = async () => {
    setClaudeMdGenerating(true);
    setMcpMessage(null);
    try {
      const res = await fetch('/api/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_claude_md',
          targetPath: targetProjectPath,
          overwrite: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMcpMessage({ type: 'success', text: `CLAUDE.md 已成功生成！路径: ${data.path}` });
        addToast({
          type: 'success',
          title: '生成成功',
          description: 'CLAUDE.md 项目上下文已成功生成。',
        });
      } else {
        setMcpMessage({ type: 'error', text: `生成失败: ${data.message}` });
      }
    } catch (err: any) {
      setMcpMessage({ type: 'error', text: `请求异常: ${err.message}` });
    } finally {
      setClaudeMdGenerating(false);
    }
  };

  useEffect(() => {
    loadSettings().then((data) => {
      if (data && data.OPENHANDS_API_URL) {
        checkOpenHands(data.OPENHANDS_API_URL);
      } else {
        checkOpenHands(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000');
      }
    });
    checkLMStudio();
    loadMcpConfig();

    // Poll extension status every 3 seconds
    const fetchExtStatus = async () => {
      try {
        const res = await fetch('/api/ext/status');
        if (res.ok) setExtStatus(await res.json());
      } catch { /* ignore */ }
    };
    fetchExtStatus();
    const extStatusTimer = setInterval(fetchExtStatus, 3000);

    // Detect browser companion extension
    if (typeof document !== 'undefined') {
      const checkInstalled = () => {
        const isInstalled = document.documentElement.getAttribute('data-apos-extension-installed') === 'true';
        if (isInstalled) setExtensionInstalled(true);
        return isInstalled;
      };

      checkInstalled();

      const handleInstalled = () => setExtensionInstalled(true);
      window.addEventListener('apos-extension-installed', handleInstalled);

      const pollTimer = setInterval(() => {
        if (checkInstalled()) clearInterval(pollTimer);
      }, 300);
      setTimeout(() => clearInterval(pollTimer), 5000);

      const handleSyncResponse = (e: Event & { detail?: { success: boolean; error?: string } }) => {
        const detail = e.detail;
        if (detail) {
          if (detail.success) {
            setMessage({ type: 'success', text: '网页版 Cookies 和请求头已成功同步！' });
            loadSettings();
          } else {
            setMessage({ type: 'error', text: `同步失败: ${detail.error || '未知错误'}` });
          }
        }
        setSyncingCookies(false);
      };
      window.addEventListener('apos-sync-cookies-response', handleSyncResponse as EventListener);

      const handleAutoSynced = () => {
        loadSettings();
        addToast({
          type: 'success',
          title: '自动同步完成',
          description: '插件已检测到变化并自动同步最新数据。',
        });
      };
      window.addEventListener('apos-auto-synced', handleAutoSynced);

      return () => {
        clearInterval(extStatusTimer);
        clearInterval(pollTimer);
        window.removeEventListener('apos-extension-installed', handleInstalled);
        window.removeEventListener('apos-sync-cookies-response', handleSyncResponse as EventListener);
        window.removeEventListener('apos-auto-synced', handleAutoSynced);
      };
    }

    return () => clearInterval(extStatusTimer);
  }, []);

  const handleInputChange = (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const saveSingleSetting = async (key: string, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));

    const settingNames: Record<string, string> = {
      use_lmstudio: 'Ollama 优先模式',
      model_ProtoBuilder: '原型开发大模型路由',
      model_ReviewBot: '代码评审大模型路由',
      model_SignalCollector: '信号捕获大模型路由',
      model_ReportGenerator: '洞察周报大模型路由',
      model_task_reasoning: '命令行工具 - 思考与推理路由',
      model_task_coding: '命令行工具 - 代码编写路由',
      model_task_retrieval: '命令行工具 - 查找与总结路由',
      model_task_planning: '命令行工具 - 计划与任务路由',
      model_task_refactor: '命令行工具 - 重构与评审路由',
      deepseek_api_key: 'DeepSeek API Key',
      custom_openai_base_url: '自定义 OpenAI Base URL',
      custom_openai_api_key: '自定义 OpenAI API Key',
      custom_openai_model: '自定义 OpenAI 模型',
      kimi_cookies: 'Kimi Web Cookie',
      OPENHANDS_API_URL: 'OpenHands API URL 地址',
      enable_context_compression: '上下文压缩',
      context_compression_threshold: '上下文压缩阈值',
    };
    const displayName = settingNames[key] || '配置项';

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [key]: value }),
      });

      if (res.ok) {
        const actionStr = value === 'true' ? '开启' : value === 'false' ? '关闭' : `设为 "${value}"`;
        addToast({
          type: 'success',
          title: '配置已同步',
          description: `${displayName} 已成功${actionStr}并持久化。`,
        });
      } else {
        const errData = await res.json();
        addToast({
          type: 'error',
          title: '同步失败',
          description: errData.error || '无法保存设置',
        });
        loadSettings();
      }
    } catch (err: any) {
      addToast({
        type: 'error',
        title: '同步异常',
        description: err.message || '网络连接超时',
      });
      loadSettings();
    }
  };

  const handleSyncCookies = () => {
    setSyncingCookies(true);
    setMessage(null);
    window.dispatchEvent(new CustomEvent('apos-sync-cookies-request'));
  };

  const handleTestConnection = async (provider: 'chatgpt' | 'gemini' | 'kimi') => {
    setTestingProvider(provider);
    setTestResults(prev => ({ ...prev, [provider]: null }));
    
    try {
      // Create a test task
      const testPrompt = '你好，请回复"测试成功"';
      const res = await fetch('/api/ext/llm-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          prompt: testPrompt,
        }),
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        setTestResults(prev => ({
          ...prev,
          [provider]: {
            success: false,
            message: errorData.error || '测试失败',
            timestamp: Date.now(),
          },
        }));
        addToast({
          type: 'error',
          title: `${provider.toUpperCase()} 测试失败`,
          description: errorData.error || '无法创建测试任务',
        });
        return;
      }
      
      const data = await res.json();
      const taskId = data.taskId;
      
      // Poll for result (max 30 seconds)
      let attempts = 0;
      const maxAttempts = 60; // 30 seconds with 500ms interval
      
      const checkResult = async (): Promise<boolean> => {
        attempts++;
        if (attempts > maxAttempts) {
          setTestResults(prev => ({
            ...prev,
            [provider]: {
              success: false,
              message: '测试超时（30秒）',
              timestamp: Date.now(),
            },
          }));
          addToast({
            type: 'error',
            title: `${provider.toUpperCase()} 测试超时`,
            description: '任务执行时间超过 30 秒',
          });
          return false;
        }
        
        try {
          const resultRes = await fetch(`/api/ext/llm-result?taskId=${taskId}`);
          if (resultRes.ok) {
            const resultData = await resultRes.json();
            
            if (resultData.status === 'completed' && resultData.result) {
              setTestResults(prev => ({
                ...prev,
                [provider]: {
                  success: true,
                  message: `测试成功！响应: ${resultData.result.slice(0, 50)}...`,
                  timestamp: Date.now(),
                },
              }));
              addToast({
                type: 'success',
                title: `${provider.toUpperCase()} 测试成功`,
                description: '连接正常，可以正常使用',
              });
              return true;
            } else if (resultData.status === 'failed') {
              setTestResults(prev => ({
                ...prev,
                [provider]: {
                  success: false,
                  message: `测试失败: ${resultData.error || '未知错误'}`,
                  timestamp: Date.now(),
                },
              }));
              addToast({
                type: 'error',
                title: `${provider.toUpperCase()} 测试失败`,
                description: resultData.error || '任务执行失败',
              });
              return false;
            }
          }
        } catch (err) {
          console.error('Error checking result:', err);
        }
        
        // Continue polling
        await new Promise(resolve => setTimeout(resolve, 500));
        return checkResult();
      };
      
      await checkResult();
      
    } catch (err: any) {
      setTestResults(prev => ({
        ...prev,
        [provider]: {
          success: false,
          message: `测试异常: ${err.message}`,
          timestamp: Date.now(),
        },
      }));
      addToast({
        type: 'error',
        title: `${provider.toUpperCase()} 测试异常`,
        description: err.message || '网络连接失败',
      });
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: '设置已成功保存到本地 SQLite 数据库！' });
        await loadSettings();
      } else {
        const errData = await res.json();
        setMessage({ type: 'error', text: `保存失败: ${errData.error || '未知错误'}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `保存失败: ${err.message}` });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm text-slate-100">
            所有密钥配置均存储在您本地的 SQLite 数据库文件 (`data/apos.db`) 中，绝不会上传至第三方服务器。
          </p>
        </div>
        <Link 
          href="/settings/usage"
          className={cn(
            buttonVariants({ variant: 'outline' }),
            "border-slate-700/80 bg-slate-900/50 hover:bg-slate-800 text-slate-200 rounded-xl text-xs shrink-0"
          )}
        >
          <Activity className="h-4 w-4 mr-1.5 text-cyan-400 animate-pulse" />
          查看运行历史与 Token 消耗
        </Link>
      </div>

      {message && (
        <div className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6">
        {/* LLM Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <Key className="h-4.5 w-4.5 text-cyan-400" />
              大语言模型 (LLM) API 配置
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              配置系统在自动编写代码、分析数据、生成报告时使用的大模型服务密钥。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* OpenAI */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="openai_api_key" className="text-slate-200 font-medium text-sm">OpenAI API Key</Label>
                <button
                  type="button"
                  onClick={() => toggleVisibility('openai')}
                  className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                >
                  {showKeys.openai ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys.openai ? '隐藏' : '显示'}
                </button>
              </div>
              <Input
                id="openai_api_key"
                type={showKeys.openai ? 'text' : 'password'}
                placeholder="sk-proj-..."
                value={formData.openai_api_key}
                onChange={(e) => handleInputChange('openai_api_key', e.target.value)}
                className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500"
              />
            </div>

            {/* Anthropic */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="anthropic_api_key" className="text-slate-200 font-medium text-sm">Anthropic API Key</Label>
                <button
                  type="button"
                  onClick={() => toggleVisibility('anthropic')}
                  className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                >
                  {showKeys.anthropic ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys.anthropic ? '隐藏' : '显示'}
                </button>
              </div>
              <Input
                id="anthropic_api_key"
                type={showKeys.anthropic ? 'text' : 'password'}
                placeholder="sk-ant-..."
                value={formData.anthropic_api_key}
                onChange={(e) => handleInputChange('anthropic_api_key', e.target.value)}
                className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500"
              />
            </div>

            {/* Gemini/Google */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="google_api_key" className="text-slate-200 font-medium text-sm">Google Gemini API Key</Label>
                <button
                  type="button"
                  onClick={() => toggleVisibility('google')}
                  className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                >
                  {showKeys.google ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys.google ? '隐藏' : '显示'}
                </button>
              </div>
              <Input
                id="google_api_key"
                type={showKeys.google ? 'text' : 'password'}
                placeholder="AIzaSy..."
                value={formData.google_api_key}
                onChange={(e) => handleInputChange('google_api_key', e.target.value)}
                className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500"
              />
            </div>

            {/* DeepSeek */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="deepseek_api_key" className="text-slate-200 font-medium text-sm">DeepSeek API Key</Label>
                <button
                  type="button"
                  onClick={() => toggleVisibility('deepseek')}
                  className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                >
                  {showKeys.deepseek ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys.deepseek ? '隐藏' : '显示'}
                </button>
              </div>
              <Input
                id="deepseek_api_key"
                type={showKeys.deepseek ? 'text' : 'password'}
                placeholder="sk-..."
                value={formData.deepseek_api_key}
                onChange={(e) => handleInputChange('deepseek_api_key', e.target.value)}
                className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500"
              />
            </div>

            {/* Custom OpenAI */}
            <div className="pt-4 border-t border-slate-700/80/40 space-y-4">
              <h4 className="text-xs font-semibold text-slate-100">自定义 OpenAI 兼容 API（支持国内通义千问、Kimi、智谱等）</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="custom_openai_base_url" className="text-slate-200 font-medium text-xs">API Base URL (终结点)</Label>
                  <Input
                    id="custom_openai_base_url"
                    type="text"
                    placeholder="https://api.moonshot.cn/v1"
                    value={formData.custom_openai_base_url}
                    onChange={(e) => handleInputChange('custom_openai_base_url', e.target.value)}
                    className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500 text-xs"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="custom_openai_model" className="text-slate-200 font-medium text-xs">Model ID (模型标识符)</Label>
                  <Input
                    id="custom_openai_model"
                    type="text"
                    placeholder="moonshot-v1-8k"
                    value={formData.custom_openai_model}
                    onChange={(e) => handleInputChange('custom_openai_model', e.target.value)}
                    className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500 text-xs"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label htmlFor="custom_openai_api_key" className="text-slate-200 font-medium text-xs">API Key (密钥)</Label>
                  <button
                    type="button"
                    onClick={() => toggleVisibility('custom_openai')}
                    className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                  >
                    {showKeys.custom_openai ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                    {showKeys.custom_openai ? '隐藏' : '显示'}
                  </button>
                </div>
                <Input
                  id="custom_openai_api_key"
                  type={showKeys.custom_openai ? 'text' : 'password'}
                  placeholder="sk-..."
                  value={formData.custom_openai_api_key}
                  onChange={(e) => handleInputChange('custom_openai_api_key', e.target.value)}
                  className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500 text-xs"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Ollama Local Model Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <Cpu className="h-4.5 w-4.5 text-emerald-400" />
              Ollama 本地模型 (免费无限制)
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              使用本地运行的 Ollama 模型，完全免费且无 API 调用限制。适合代码重构、总结等低成本任务。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 rounded-xl border border-slate-700/80 bg-slate-950/40">
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <div className={`h-2 w-2 rounded-full ${lmStudioStatus.available ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-sm font-medium text-slate-200">
                    {lmStudioStatus.checking ? '检测中...' : lmStudioStatus.available ? 'Ollama 运行中' : 'Ollama 未运行'}
                  </span>
                </div>
                
                {lmStudioStatus.available && lmStudioStatus.models.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-slate-100">已加载模型:</p>
                    {lmStudioStatus.models.map((model, idx) => (
                      <div key={idx} className="text-xs font-mono text-emerald-400 bg-emerald-500/5 px-2 py-1 rounded border border-emerald-500/20 inline-block mr-2">
                        {model}
                      </div>
                    ))}
                  </div>
                )}
                
                {!lmStudioStatus.available && (
                  <p className="text-xs text-slate-350">
                    请确保 Ollama 正在运行 (http://localhost:11434)，并已拉取模型（如 <code className="text-emerald-400">ollama pull qwen2.5-coder:7b</code>）
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <Button
                  type="button"
                  onClick={checkLMStudio}
                  disabled={lmStudioStatus.checking}
                  variant="outline"
                  className="border-slate-700/80 bg-slate-900/50 hover:bg-slate-800 text-slate-200 rounded-xl text-xs h-8 px-3"
                >
                  {lmStudioStatus.checking ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      检测中
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      重新检测
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Enable Ollama toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">启用 Ollama 优先</Label>
                <p className="text-xs text-slate-350">
                  开启后，系统将优先使用本地 Ollama 模型处理任务，降低 API 成本
                </p>
              </div>
              <button
                type="button"
                onClick={() => saveSingleSetting('use_lmstudio', formData.use_lmstudio === 'true' ? 'false' : 'true')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.use_lmstudio === 'true' ? 'bg-emerald-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.use_lmstudio === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </CardContent>
        </Card>

        {/* Context Compression Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <FileCode className="h-4.5 w-4.5 text-amber-400" />
              上下文压缩 (Context Compression)
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              当 Claude CLI 发送大量代码文件时，系统自动调用本地 Ollama 模型进行结构化压缩，仅保留 API 签名、类型和架构摘要后再转发给云端模型，可降低 70%+ Token 消耗。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Enable toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">启用上下文压缩</Label>
                <p className="text-xs text-slate-350">
                  开启后，超过阈值的代码块将由本地模型压缩后再转发给云端，需要 Ollama 在线
                </p>
              </div>
              <button
                type="button"
                onClick={() => saveSingleSetting('enable_context_compression', formData.enable_context_compression === 'true' ? 'false' : 'true')}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  formData.enable_context_compression === 'true' ? 'bg-amber-600' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    formData.enable_context_compression === 'true' ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Threshold slider */}
            <div className="p-3 rounded-xl border border-slate-700/80 bg-slate-950/20 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-slate-200 font-medium text-sm">压缩触发阈值 (字符数)</Label>
                <span className="text-xs font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded">
                  {parseInt(formData.context_compression_threshold).toLocaleString()} 字符
                </span>
              </div>
              <input
                type="range"
                min="2000"
                max="30000"
                step="1000"
                value={formData.context_compression_threshold}
                onChange={(e) => handleInputChange('context_compression_threshold', e.target.value)}
                onMouseUp={(e) => saveSingleSetting('context_compression_threshold', (e.target as HTMLInputElement).value)}
                onTouchEnd={(e) => saveSingleSetting('context_compression_threshold', (e.target as HTMLInputElement).value)}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
              <div className="flex justify-between text-[10px] text-slate-100">
                <span>2,000</span>
                <span>8,000</span>
                <span>15,000</span>
                <span>30,000</span>
              </div>
              <p className="text-xs text-slate-350">
                只有字符数超过此阈值的代码块才会被压缩。值越小压缩越积极（省 Token），值越大压缩越保守（保留细节）。
              </p>
            </div>

            {/* Status info */}
            <div className="flex items-center gap-2 text-xs text-slate-350 px-1">
              <div className={`h-1.5 w-1.5 rounded-full ${
                lmStudioStatus.available
                  ? formData.enable_context_compression === 'true' ? 'bg-amber-400 animate-pulse' : 'bg-emerald-400'
                  : 'bg-slate-600'
              }`} />
              {lmStudioStatus.available
                ? formData.enable_context_compression === 'true'
                  ? '压缩引擎就绪：Ollama 在线，大代码块将自动压缩后转发'
                  : '压缩引擎待命：Ollama 在线，但压缩功能未开启'
                : '压缩引擎离线：Ollama 未运行，压缩功能将自动退避'
              }
            </div>
          </CardContent>
        </Card>

        {/* OpenHands Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <Activity className="h-4.5 w-4.5 text-cyan-400" />
              OpenHands 运行时 (Sandbox 隔离沙箱)
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              配置 OpenHands 智能体运行时服务地址。若在线，任务将分发至隔离沙箱运行以提升安全性；若离线，将以本地 Shell 代理执行。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 rounded-xl border border-slate-700/80 bg-slate-950/40">
              <div className="space-y-2 flex-1 w-full">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`h-2 w-2 rounded-full ${openHandsStatus.available ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  <span className="text-sm font-medium text-slate-200">
                    {openHandsStatus.checking ? '探测中...' : openHandsStatus.available ? 'OpenHands 在线 (已连接)' : 'OpenHands 离线 (使用本地 Shell 代理)'}
                  </span>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="openhands_api_url" className="text-slate-200 font-medium text-xs">API 服务地址</Label>
                  <Input
                    id="openhands_api_url"
                    type="text"
                    placeholder="http://localhost:8080"
                    value={formData.OPENHANDS_API_URL}
                    onChange={(e) => {
                      handleInputChange('OPENHANDS_API_URL', e.target.value);
                    }}
                    onBlur={(e) => {
                      saveSingleSetting('OPENHANDS_API_URL', e.target.value);
                    }}
                    className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500 text-xs"
                  />
                </div>
              </div>

              <div className="flex gap-2 shrink-0 self-end sm:self-center">
                <Button
                  type="button"
                  onClick={() => checkOpenHands()}
                  disabled={openHandsStatus.checking}
                  variant="outline"
                  className="border-slate-700/80 bg-slate-900/50 hover:bg-slate-800 text-slate-200 rounded-xl text-xs h-8 px-3"
                >
                  {openHandsStatus.checking ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      探测中
                    </>
                  ) : (
                    <>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                      测试连接
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Web LLM Cookie Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <Globe className="h-4.5 w-4.5 text-cyan-400" />
              网页版大模型 (免 API Key · 完整请求头同步)
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              浏览器插件自动捕获 ChatGPT、Gemini 和 Kimi 的完整请求头（含 User-Agent、Authorization、cf-clearance 等），比单纯 Cookie 更稳定，可有效避免 403 拦截。插件检测到变化后会实时自动同步，无需手动操作。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Extension status + sync button */}
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between p-4 rounded-xl border border-slate-700/80 bg-slate-950/40">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${extensionInstalled ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
                <span className="text-sm font-medium text-slate-200">
                  {extensionInstalled ? '✅ 插件已连接 · 实时自动同步中' : '⚠️ 未检测到插件'}
                </span>
              </div>

              {extensionInstalled ? (
                <Button
                  type="button"
                  onClick={handleSyncCookies}
                  disabled={syncingCookies}
                  className="bg-cyan-600/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-600/20 text-xs rounded-xl h-8 px-3.5 shrink-0"
                >
                  {syncingCookies ? (
                    <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />同步中...</>
                  ) : (
                    <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />手动立即同步</>
                  )}
                </Button>
              ) : (
                <div className="text-xs text-amber-400/90 bg-amber-500/5 border border-amber-500/10 px-3 py-2 rounded-xl max-w-md leading-normal font-sans">
                  请在 Chrome 中以开发者模式加载 <code>apos-extension/</code> 目录，然后访问 chatgpt.com 等网站触发自动捕获。
                </div>
              )}
            </div>

            {/* Real-time extension status panel */}
            {extStatus && (
              <div className="rounded-xl border border-slate-700/50 bg-slate-950/30 overflow-hidden">
                {/* Header row */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700/40 bg-slate-900/40">
                  <div className="flex items-center gap-3">
                    <div className={`h-2 w-2 rounded-full ${extStatus.online ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'}`} />
                    <span className="text-xs font-semibold text-slate-200">
                      插件状态 {extStatus.online ? '· 在线' : '· 离线'}
                      {extStatus.version && <span className="text-slate-100 font-normal ml-1">v{extStatus.version}</span>}
                    </span>
                    {extStatus.lastHeartbeatAt && (
                      <span className="text-[10px] text-slate-100">
                        最后心跳: {new Date(extStatus.lastHeartbeatAt).toLocaleTimeString('zh-CN')}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowExtLogs(v => !v)}
                      className="text-[10px] text-slate-100 hover:text-slate-200 transition-colors px-2 py-0.5 rounded border border-slate-700/50 hover:border-slate-600"
                    >
                      {showExtLogs ? '收起日志' : `查看日志 (${extStatus.logs.length})`}
                    </button>
                    <button
                      type="button"
                      onClick={async () => { await fetch('/api/ext/status', { method: 'DELETE' }); }}
                      className="text-[10px] text-slate-100 hover:text-rose-400 transition-colors"
                      title="清空日志"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>

                {/* Tab status row */}
                <div className="flex gap-4 px-3 py-2 border-b border-slate-700/30">
                  {(['chatgpt', 'gemini', 'kimi', 'google'] as const).map(p => {
                    const tabInfo = extStatus.tabs[p];
                    const labels: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', kimi: 'Kimi', google: 'Google' };
                    const sites: Record<string, string> = { chatgpt: 'chatgpt.com', gemini: 'gemini.google.com', kimi: 'kimi.moonshot.cn', google: 'google.com' };
                    return (
                      <div key={p} className="flex items-center gap-1.5 text-xs">
                        <div className={`h-1.5 w-1.5 rounded-full ${tabInfo?.open ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                        <span className={tabInfo?.open ? 'text-emerald-400' : 'text-slate-100'}>
                          {labels[p]}
                        </span>
                        {!tabInfo?.open && (
                          <span className="text-slate-100 text-[10px]">
                            (需打开 {sites[p]})
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Log entries */}
                {showExtLogs && (
                  <div className="max-h-52 overflow-y-auto p-2 space-y-0.5 font-mono">
                    {extStatus.logs.length === 0 ? (
                      <p className="text-xs text-slate-100 text-center py-3">暂无日志</p>
                    ) : (
                      [...extStatus.logs].reverse().map((entry, i) => {
                        const colors: Record<string, string> = {
                          info:    'text-slate-300',
                          success: 'text-emerald-400',
                          warn:    'text-amber-400',
                          error:   'text-rose-400',
                        };
                        return (
                          <div key={i} className={`flex gap-2 text-[11px] leading-relaxed ${colors[entry.level] || 'text-slate-300'}`}>
                            <span className="text-slate-100 shrink-0 tabular-nums">
                              {new Date(entry.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                            <span className="break-all">{entry.msg}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Per-provider status with header details */}
            {(['chatgpt', 'gemini', 'kimi'] as const).map((provider) => {
              const labels: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', kimi: 'Kimi' };
              const cookieKey = `${provider}_cookies` as keyof typeof formData;
              const hasCookie = !!formData[cookieKey];
              const headers = capturedHeaders[provider];
              const headerCount = headers ? Object.keys(headers).length : 0;
              const isExpanded = showHeaderDetails[provider];
              const testResult = testResults[provider];
              const isTesting = testingProvider === provider;
              const tabInfo = extStatus?.tabs[provider];

              return (
                <div key={provider} className="rounded-xl border border-slate-700/80 bg-slate-950/20 overflow-hidden">
                  <div className="flex items-center justify-between p-3">
                    <div className="flex items-center gap-3">
                      <div className={`h-2 w-2 rounded-full ${hasCookie ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      <span className="text-sm font-medium text-slate-200">{labels[provider]}</span>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap justify-end">
                      <div className="text-xs text-slate-100 font-mono flex items-center gap-1">
                        Cookie:
                        {hasCookie ? (
                          <span className="text-emerald-400 flex items-center gap-0.5 ml-1">
                            <ShieldCheck className="h-3 w-3" /> 已同步
                          </span>
                        ) : (
                          <span className="text-slate-100 ml-1">未同步</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-100 font-mono flex items-center gap-1">
                        请求头:
                        {headers ? (
                          <span className="text-cyan-400 ml-1">{headerCount} 个</span>
                        ) : (
                          <span className="text-slate-100 ml-1">未捕获</span>
                        )}
                      </div>
                      {headers && (
                        <button
                          type="button"
                          onClick={() => setShowHeaderDetails(prev => ({ ...prev, [provider]: !prev[provider] }))}
                          className="text-xs text-slate-100 hover:text-slate-200 flex items-center gap-1 transition-colors"
                        >
                          {isExpanded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                          {isExpanded ? '收起' : '查看详情'}
                        </button>
                      )}
                      {/* Test Connection Button */}
                      <Button
                        type="button"
                        onClick={() => handleTestConnection(provider)}
                        disabled={isTesting || !hasCookie || !tabInfo?.open}
                        variant="outline"
                        className="border-cyan-500/30 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 rounded-lg text-xs h-7 px-3"
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                            测试中...
                          </>
                        ) : (
                          <>
                            <Activity className="mr-1 h-3 w-3" />
                            测试连接
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Test Result Display */}
                  {testResult && (
                    <div className={`px-3 py-2 border-t border-slate-700/40 flex items-start gap-2 text-xs ${
                      testResult.success 
                        ? 'bg-emerald-500/5 text-emerald-400' 
                        : 'bg-rose-500/5 text-rose-400'
                    }`}>
                      {testResult.success ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">{testResult.message}</p>
                        <p className="text-[10px] text-slate-100 mt-0.5">
                          {new Date(testResult.timestamp).toLocaleString('zh-CN')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Expanded header details */}
                  {isExpanded && headers && (
                    <div className="border-t border-slate-700/40 p-3 bg-slate-950/40">
                      <p className="text-xs text-slate-100 mb-2 font-semibold">已捕获的请求头（共 {headerCount} 个）：</p>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {Object.entries(headers).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-xs font-mono">
                            <span className="text-cyan-400 shrink-0 w-44 truncate">{key}</span>
                            <span className="text-slate-100 truncate flex-1">
                              {key === 'cookie'
                                ? `${String(value).slice(0, 40)}... (${String(value).split(';').length} 个 cookie)`
                                : key === 'authorization'
                                ? `${String(value).slice(0, 20)}••••`
                                : String(value).slice(0, 80)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Clear button */}
            {(formData.chatgpt_cookies || formData.gemini_cookies || formData.kimi_cookies) && (
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    handleInputChange('chatgpt_cookies', '');
                    handleInputChange('gemini_cookies', '');
                    handleInputChange('kimi_cookies', '');
                    setCapturedHeaders({ chatgpt: null, gemini: null, kimi: null });
                    setMessage({ type: 'success', text: '已清除本地 Cookie 和请求头配置，保存后生效。' });
                  }}
                  className="text-slate-350 hover:text-rose-400 text-xs transition-colors flex items-center gap-1"
                >
                  <Trash2 className="h-3 w-3" />
                  清除已同步的 Cookies 和请求头
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Task Model Routing Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <Cpu className="h-4.5 w-4.5 text-cyan-400" />
              智能任务大模型路由
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              为不同的 Agent 任务分配最合适的大模型，支持混用免 Key 网页版与付费 API 模型。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Task 1: ProtoBuilder */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">原型开发 (ProtoBuilder)</Label>
                <p className="text-xs text-slate-350">负责理解需求方案、进行可行性评估并编写原型代码。</p>
              </div>
              <select
                value={formData.model_ProtoBuilder}
                onChange={(e) => saveSingleSetting('model_ProtoBuilder', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task 2: ReviewBot */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">代码评审 (ReviewBot)</Label>
                <p className="text-xs text-slate-350">审查生成的 PR 代码，进行安全审计和架构规范评估。</p>
              </div>
              <select
                value={formData.model_ReviewBot}
                onChange={(e) => saveSingleSetting('model_ReviewBot', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task 3: SignalCollector */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">信号捕获 (SignalCollector)</Label>
                <p className="text-xs text-slate-350">监控竞品和用户工单，抓取最新的异常埋点和竞品版本动态。</p>
              </div>
              <select
                value={formData.model_SignalCollector}
                onChange={(e) => saveSingleSetting('model_SignalCollector', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task 4: ReportGenerator */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">洞察周报 (ReportGenerator)</Label>
                <p className="text-xs text-slate-350">每周聚合并分析采集到的产品信号，自动生成洞察分析周报。</p>
              </div>
              <select
                value={formData.model_ReportGenerator}
                onChange={(e) => saveSingleSetting('model_ReportGenerator', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* Claude Code Routing Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <Terminal className="h-4.5 w-4.5 text-cyan-400" />
              Claude Code / 命令行工具任务路由 (MCP)
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              配置在 Claude Code 中通过 MCP 联动时，各种日常开发任务所路由的大模型。您可以为不同粒度的任务混合搭配底层大语言模型。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Task: Reasoning */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">思考与推理 (Reasoning)</Label>
                <p className="text-xs text-slate-350">用于复杂问题思考、逻辑推理与原理解释等高认知任务。</p>
              </div>
              <select
                value={formData.model_task_reasoning}
                onChange={(e) => saveSingleSetting('model_task_reasoning', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task: Coding */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">代码编写 (Coding)</Label>
                <p className="text-xs text-slate-350">负责改写代码、实现新功能及编写单元测试。</p>
              </div>
              <select
                value={formData.model_task_coding}
                onChange={(e) => saveSingleSetting('model_task_coding', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task: Retrieval */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">查找文件与总结 (Retrieval & Summarize)</Label>
                <p className="text-xs text-slate-350">用于扫描文件内容、提取代码片段和生成总结报告等（推荐本地模型以节省成本）。</p>
              </div>
              <select
                value={formData.model_task_retrieval}
                onChange={(e) => saveSingleSetting('model_task_retrieval', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task: Planning */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">计划与流程编排 (Planning)</Label>
                <p className="text-xs text-slate-350">用于做开发设计计划、流程编排、分步骤拆解任务。</p>
              </div>
              <select
                value={formData.model_task_planning}
                onChange={(e) => saveSingleSetting('model_task_planning', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>

            {/* Task: Refactor & Review */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-3 rounded-xl border border-slate-700/80 bg-slate-950/20">
              <div className="space-y-1">
                <Label className="text-slate-200 font-medium text-sm">重构与评审 (Refactor & Review)</Label>
                <p className="text-xs text-slate-350">用于评估代码库质量、发现坏味道和提出重构方案建议。</p>
              </div>
              <select
                value={formData.model_task_refactor}
                onChange={(e) => saveSingleSetting('model_task_refactor', e.target.value)}
                className="bg-slate-950 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 w-full sm:w-56"
              >
                <option value="default">智能默认优先</option>
                <option value="ollama">Ollama 本地模型 (免费)</option>
                <option value="chatgpt_web">ChatGPT 网页版 (免 Key)</option>
                <option value="gemini_web">Gemini 网页版 (免 Key)</option>
                <option value="anthropic_api">Claude 3.5 Sonnet (API Key)</option>
                <option value="openai_api">OpenAI GPT-4o (API Key)</option>
                <option value="google_api">Gemini 1.5 Pro (API Key)</option>
                <option value="deepseek_api">DeepSeek API (云端 Key)</option>
                <option value="custom_openai_api">自定义 OpenAI 兼容 API</option>
                <option value="kimi_web">Kimi 网页版 (免 Key)</option>
              </select>
            </div>
          </CardContent>
        </Card>

        {/* GitHub App Section */}
        <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
              <GithubIcon className="h-4.5 w-4.5 text-cyan-400" />
              GitHub 本地操作配置
            </CardTitle>
            <CardDescription className="text-slate-350 text-xs">
              配置系统在推送分支和提交 PR 时所使用的个人访问令牌 (PAT)。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* GitHub Token */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="github_token" className="text-slate-200 font-medium text-sm">GitHub Personal Access Token (classic 或 fine-grained)</Label>
                <button
                  type="button"
                  onClick={() => toggleVisibility('github')}
                  className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                >
                  {showKeys.github ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                  {showKeys.github ? '隐藏' : '显示'}
                </button>
              </div>
              <Input
                id="github_token"
                type={showKeys.github ? 'text' : 'password'}
                placeholder="ghp_... 或 github_pat_..."
                value={formData.github_token}
                onChange={(e) => handleInputChange('github_token', e.target.value)}
                className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500"
              />
              <p className="text-[11px] text-slate-350 leading-normal">
                提示：您的 Token 必须具有 `repo` 权限，以支持创建分支和提报 Pull Request。
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-end border-t border-slate-700/80/40 p-4">
            <Button
              type="submit"
              disabled={saving}
              className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-xl"
            >
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  正在保存...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  保存本地设置
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      </form>

      {/* Claude CLI Proxy Configuration Card */}
      <Card className="border-emerald-700/80 bg-emerald-900/10 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
            <Terminal className="h-4.5 w-4.5 text-emerald-400" />
            Claude CLI 代理配置 ⭐ 推荐
          </CardTitle>
          <CardDescription className="text-slate-350 text-xs">
            让 Claude CLI 的所有请求自动通过 APOS 路由，使用本地模型（免费）+ 自动上下文压缩（节省 70% Token）。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Benefits */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
              <div className="text-emerald-400 font-semibold text-sm mb-1">✅ 完全免费</div>
              <div className="text-xs text-slate-350">使用本地 LM Studio 模型，零 API 成本</div>
            </div>
            <div className="p-3 rounded-xl border border-cyan-500/20 bg-cyan-500/5">
              <div className="text-cyan-400 font-semibold text-sm mb-1">⚡ 自动压缩</div>
              <div className="text-xs text-slate-350">大上下文自动压缩，节省 70% Token</div>
            </div>
            <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
              <div className="text-amber-400 font-semibold text-sm mb-1">🎯 智能路由</div>
              <div className="text-xs text-slate-350">根据任务类型自动选择最优模型</div>
            </div>
          </div>

          {/* Configuration Steps */}
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">步骤 1: 设置环境变量</h4>
              <p className="text-xs text-slate-350">
                将以下命令添加到你的 shell 配置文件（~/.zshrc 或 ~/.bashrc）：
              </p>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-700/80 rounded-xl p-4 text-xs font-mono text-slate-100 overflow-x-auto">
{`# APOS 代理配置
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=${formData.anthropic_api_key || 'your_anthropic_api_key_here'}`}</pre>
                <button
                  type="button"
                  onClick={() => {
                    const text = `# APOS 代理配置\nexport ANTHROPIC_BASE_URL=http://localhost:3000/api/v1\nexport ANTHROPIC_API_KEY=${formData.anthropic_api_key || 'your_anthropic_api_key_here'}`;
                    navigator.clipboard.writeText(text);
                    addToast({
                      type: 'success',
                      title: '已复制',
                      description: '配置命令已复制到剪贴板',
                    });
                  }}
                  className="absolute top-2 right-2 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">步骤 2: 应用配置</h4>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-700/80 rounded-xl p-4 text-xs font-mono text-slate-100 overflow-x-auto">
{`# 重新加载 shell 配置
source ~/.zshrc  # 或 source ~/.bashrc`}</pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('source ~/.zshrc');
                    addToast({
                      type: 'success',
                      title: '已复制',
                      description: '命令已复制到剪贴板',
                    });
                  }}
                  className="absolute top-2 right-2 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-slate-200">步骤 3: 使用 Claude CLI</h4>
              <p className="text-xs text-slate-350">
                现在所有 Claude CLI 请求都会自动通过 APOS 路由：
              </p>
              <div className="relative">
                <pre className="bg-slate-950 border border-slate-700/80 rounded-xl p-4 text-xs font-mono text-slate-100 overflow-x-auto">
{`# 简单问题
claude "1+1等于几？"

# 代码生成（自动使用本地模型）
claude "写一个 TypeScript 函数计算斐波那契数列"

# 代码审查
claude "审查 src/components/Button.tsx 的代码"`}</pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('claude "写一个 TypeScript 函数计算斐波那契数列"');
                    addToast({
                      type: 'success',
                      title: '已复制',
                      description: '示例命令已复制到剪贴板',
                    });
                  }}
                  className="absolute top-2 right-2 p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-slate-100 transition-colors"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Status Check */}
          <div className="p-4 rounded-xl border border-slate-700/80 bg-slate-950/40">
            <div className="flex items-start gap-3">
              <div className="flex-1 space-y-2">
                <div className="text-sm font-semibold text-slate-200">配置检查</div>
                <div className="space-y-1 text-xs">
                  <div className="flex items-center gap-2">
                    {formData.anthropic_api_key ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-slate-300">Anthropic API Key 已配置</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <span className="text-slate-300">需要配置 Anthropic API Key</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {lmStudioStatus.available ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-slate-300">LM Studio 正在运行（将使用本地模型）</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <span className="text-slate-300">LM Studio 未运行（将使用云端 API）</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {formData.enable_context_compression === 'true' ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        <span className="text-slate-300">上下文压缩已启用（节省 70% Token）</span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="h-4 w-4 text-amber-400" />
                        <span className="text-slate-300">上下文压缩未启用</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Warning */}
          <div className="p-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
              <div className="text-xs text-slate-300 leading-relaxed">
                <strong className="text-amber-400">注意：</strong> 
                确保 APOS 开发服务器正在运行（<code className="text-amber-300">npm run dev</code>），
                否则 Claude CLI 将无法连接到代理。
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* MCP Integration Card */}
      <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
            <Plug className="h-4.5 w-4.5 text-cyan-400" />
            Claude Desktop MCP 工具集成
          </CardTitle>
          <CardDescription className="text-slate-350 text-xs">
            在 Claude Desktop 对话中手动调用 APOS 工具（如代码搜索、原型生成等）。与 Claude CLI 代理不同，这种方式需要明确告诉 Claude 使用 APOS 工具。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {mcpMessage && (
            <div className={`flex items-center gap-3 rounded-xl border p-4 text-sm ${
              mcpMessage.type === 'success' 
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
                : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
            }`}>
              {mcpMessage.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <AlertCircle className="h-5 w-5 shrink-0" />}
              <span>{mcpMessage.text}</span>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: CLI Integration */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <Terminal className="h-4 w-4 text-cyan-400" />
                  第一步：接入 Claude Code / Codex
                </h4>
                <p className="text-xs text-slate-350 leading-normal">
                  APOS 提供了一个本地 MCP Server。开启后，您的 CLI 开发工具可以直接访问 APOS 的代码索引和用户反馈，实现半自动化的项目迭代。
                </p>
              </div>

              <div className="space-y-3 p-4 rounded-xl border border-slate-700/80 bg-slate-950/40">
                <div className="text-xs font-semibold text-slate-100">预期的配置文件路径：</div>
                <ul className="space-y-1 text-xs text-slate-350">
                  {configPaths.map((p, idx) => (
                    <li key={idx} className="truncate">
                      📁 <span className="font-mono text-[11px] select-all">{p.path}</span>
                    </li>
                  ))}
                </ul>

                <div className="flex gap-2 pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mcpWriting || mcpLoading || mcpCleaning}
                    onClick={handleWriteMcpConfig}
                    className="border-cyan-500/30 hover:border-cyan-500/60 bg-cyan-500/5 hover:bg-cyan-500/10 text-cyan-400 rounded-xl text-xs flex-1 h-9"
                  >
                    {mcpWriting ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        正在写入...
                      </>
                    ) : (
                      <>
                        <Plug className="mr-1.5 h-3.5 w-3.5" />
                        一键自动写入
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={mcpWriting || mcpLoading || mcpCleaning}
                    onClick={handleCleanMcpConfig}
                    className="border-rose-500/30 hover:border-rose-500/60 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 rounded-xl text-xs flex-1 h-9"
                  >
                    {mcpCleaning ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        正在清除...
                      </>
                    ) : (
                      <>
                        <X className="mr-1.5 h-3.5 w-3.5" />
                        一键清除配置
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-[11px] font-semibold text-slate-100">手动配置 (JSON 内容)</span>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(configJson);
                      addToast({ type: 'success', title: '已复制', description: '配置 JSON 已成功复制到剪贴板。' });
                    }}
                    className="text-slate-350 hover:text-slate-200 text-xs flex items-center gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    复制
                  </button>
                </div>
                <pre className="p-3 bg-slate-950 border border-slate-850 rounded-xl text-[10px] font-mono text-slate-200 overflow-x-auto max-h-48 leading-relaxed">
                  {configJson || '正在加载 MCP 配置...'}
                </pre>
              </div>
            </div>

            {/* Right Column: Project Context (CLAUDE.md) */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-sm font-semibold text-slate-200 flex items-center gap-1.5">
                  <FileCode className="h-4 w-4 text-blue-400" />
                  第二步：生成项目上下文 (CLAUDE.md)
                </h4>
                <p className="text-xs text-slate-350 leading-normal">
                  CLAUDE.md 是 Claude Code 推荐的项目规则与运行指南。APOS 会自动分析您的技术栈、近期用户反馈、开发规范和 MCP 工具指令，并在目标项目中生成完整的 CLAUDE.md，供 Claude 首次载入时直接阅读。
                </p>
              </div>

              <div className="space-y-4 p-4 rounded-xl border border-slate-700/80 bg-slate-950/40">
                <div className="space-y-2">
                  <Label htmlFor="target_project_path" className="text-xs font-semibold text-slate-100">目标项目绝对路径</Label>
                  <Input
                    id="target_project_path"
                    type="text"
                    placeholder="/Users/username/my-project"
                    value={targetProjectPath}
                    onChange={(e) => setTargetProjectPath(e.target.value)}
                    className="bg-slate-950 border-slate-700/80 text-slate-100 text-xs placeholder:text-slate-100 focus-visible:ring-cyan-500"
                  />
                </div>

                <div className="flex gap-2 w-full">
                  <Button
                    type="button"
                    disabled={claudeMdGenerating || !targetProjectPath || claudeMdDeleting}
                    onClick={handleGenerateClaudeMd}
                    className="bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white rounded-xl text-xs flex-1 h-9"
                  >
                    {claudeMdGenerating ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        正在注入...
                      </>
                    ) : (
                      <>
                        <FileCode className="mr-1.5 h-3.5 w-3.5" />
                        生成并注入 CLAUDE.md
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    disabled={claudeMdGenerating || !targetProjectPath || claudeMdDeleting}
                    onClick={handleDeleteClaudeMd}
                    className="border border-rose-500/30 hover:border-rose-500/60 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 rounded-xl text-xs flex-1 h-9"
                  >
                    {claudeMdDeleting ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        正在删除...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        清理 CLAUDE.md
                      </>
                    )}
                  </Button>
                </div>
              </div>

              <div className="p-3 bg-cyan-950/20 border border-cyan-900/30 rounded-xl space-y-1.5">
                <h5 className="text-xs font-semibold text-cyan-400 flex items-center gap-1">
                  💡 APOS 联动工作流提示
                </h5>
                <p className="text-[11px] text-slate-100 leading-relaxed">
                  在您的项目目录下，直接运行 <code className="font-mono text-blue-300">claude</code>，它会自动载入项目上下文与 APOS MCP 工具，实现从“捕获用户反馈”到“AI 自动定位并改写代码”的全自动开发环路。
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
