'use client';

import { useState, useEffect, useRef } from 'react';
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
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { 
  Terminal, 
  Plus, 
  Play, 
  Search, 
  FileText, 
  GitPullRequest, 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Clock,
  ExternalLink,
  Code,
  Copy,
  RefreshCw,
  Smartphone,
  Tablet,
  Monitor,
  Sparkles,
  Check
} from 'lucide-react';
import { translatePrototypeStatus } from '@/lib/utils';
import { MarkdownViewer } from '@/components/ui/markdown-viewer';

interface Prototype {
  id: number;
  name: string;
  description: string;
  branchName: string;
  status: string;
  codePath: string | null;
  previewUrl: string | null;
  commitHash: string | null;
  prNumber: number | null;
  prUrl: string | null;
  feasibilityReport: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TraceLog {
  id: number;
  agentName: string;
  runId: string;
  step: string;
  status: string;
  message: string;
  details: string | null;
  createdAt: string;
}

export default function PrototypesPage() {
  const { addToast } = useToast();
  const [prototypesList, setPrototypesList] = useState<Prototype[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<number | null>(null);
  const [runningAction, setRunningAction] = useState<'assess' | 'generate' | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [traces, setTraces] = useState<TraceLog[]>([]);
  const [showConsole, setShowConsole] = useState(false);
  
  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<string | null>(null);
  
  // UI Expand States
  const [expandedProtoId, setExpandedProtoId] = useState<number | null>(null);

  // Playground State
  const [playgroundOpen, setPlaygroundOpen] = useState(false);
  const [selectedPlaygroundProto, setSelectedPlaygroundProto] = useState<Prototype | null>(null);
  const [playgroundTab, setPlaygroundTab] = useState<'preview' | 'code' | 'stackblitz' | 'figma'>('preview');
  const [codeFiles, setCodeFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [loadingCodeFiles, setLoadingCodeFiles] = useState(false);
  const [selectedCodeFile, setSelectedCodeFile] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [iframeKey, setIframeKey] = useState(0);
  const [copiedFile, setCopiedFile] = useState(false);
  const [copiedFigmaHtml, setCopiedFigmaHtml] = useState<'full' | 'body' | null>(null);

  const consoleEndRef = useRef<HTMLDivElement>(null);
  const consoleContainerRef = useRef<HTMLDivElement>(null);

  // Load and open playground
  const openPlayground = async (proto: Prototype) => {
    setSelectedPlaygroundProto(proto);
    setPlaygroundOpen(true);
    setPlaygroundTab('preview');
    setLoadingCodeFiles(true);
    setSelectedCodeFile(null);
    setCodeFiles([]);

    try {
      const res = await fetch(`/api/prototypes/${proto.id}/code`);
      if (res.ok) {
        const data = await res.json();
        setCodeFiles(data);
        if (data.length > 0) {
          // Set first page.tsx/js as default selected file
          const pageFile = data.find((f: any) => f.path.startsWith('src/app/') && (f.path.endsWith('/page.tsx') || f.path.endsWith('/page.js')));
          setSelectedCodeFile(pageFile ? pageFile.path : data[0].path);
        }
      } else {
        addToast({
          type: 'error',
          title: '获取源码失败',
          description: '无法读取该原型的生成源码',
        });
      }
    } catch (err) {
      console.error('Failed to load code files', err);
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接服务器以获取源码',
      });
    } finally {
      setLoadingCodeFiles(false);
    }
  };

  // Export to StackBlitz
  const handleExportToStackBlitz = () => {
    if (!selectedPlaygroundProto) return;

    const form = document.createElement('form');
    form.method = 'POST';
    form.action = 'https://stackblitz.com/run';
    form.target = '_blank';

    const addInput = (name: string, value: string) => {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    };

    addInput('project[title]', selectedPlaygroundProto.name);
    addInput('project[description]', selectedPlaygroundProto.description);
    addInput('project[template]', 'node');

    // package.json configuration suitable for running Next.js in WebContainers
    addInput('project[files][package.json]', JSON.stringify({
      name: `apos-prototype-${selectedPlaygroundProto.id}`,
      version: "1.0.0",
      private: true,
      scripts: {
        dev: "next dev",
        build: "next build",
        start: "next start"
      },
      dependencies: {
        next: "15.0.0",
        react: "19.0.0-rc-65a56d0e-20241020",
        "react-dom": "19.0.0-rc-65a56d0e-20241020",
        "lucide-react": "^0.450.0",
        clsx: "^2.1.1",
        "tailwind-merge": "^2.5.2",
        "class-variance-authority": "^0.7.0"
      },
      devDependencies: {
        typescript: "^5",
        "@types/node": "^20",
        "@types/react": "^18",
        "@types/react-dom": "^18",
        postcss: "^8",
        tailwindcss: "^3"
      }
    }, null, 2));

    // tailwind config v3 compatible with templates
    addInput('project[files][tailwind.config.js]', `
module.exports = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
    `);

    addInput('project[files][postcss.config.js]', `
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
    `);

    addInput('project[files][tsconfig.json]', `
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "node",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [
      {
        "name": "next"
      }
    ],
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
    `);

    addInput('project[files][src/app/globals.css]', `
@tailwind base;
@tailwind components;
@tailwind utilities;

body {
  background-color: #020617;
  color: #f8fafc;
}
    `);

    addInput('project[files][src/app/layout.tsx]', `
import './globals.css';
import { Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'] });

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>{children}</body>
    </html>
  );
}
    `);

    // Inject generated prototype files
    codeFiles.forEach(file => {
      // Map the main page route file to the index page in StackBlitz
      let destPath = file.path;
      if (file.path.startsWith('src/app/') && (file.path.endsWith('/page.tsx') || file.path.endsWith('/page.js'))) {
        destPath = 'src/app/page.tsx';
      }
      addInput(`project[files][${destPath}]`, file.content);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
    
    addToast({
      type: 'success',
      title: '正在导出 StackBlitz',
      description: '新标签页已打开云沙盒环境。首次启动会安装依赖，请稍等。',
    });
  };

  // Copy HTML for Figma
  const handleCopyForFigma = (mode: 'full' | 'body') => {
    const iframe = document.getElementById('playground-iframe') as HTMLIFrameElement;
    const iframeDoc = iframe?.contentDocument || iframe?.contentWindow?.document;
    
    if (!iframeDoc) {
      addToast({
        type: 'error',
        title: '拷贝失败',
        description: '未能捕获 iframe 渲染环境中的 HTML',
      });
      return;
    }

    let textToCopy = '';
    if (mode === 'full') {
      textToCopy = iframeDoc.documentElement.outerHTML;
    } else {
      textToCopy = iframeDoc.body.innerHTML;
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedFigmaHtml(mode);
      setTimeout(() => setCopiedFigmaHtml(null), 2000);
      addToast({
        type: 'success',
        title: '已复制到剪贴板',
        description: `已复制 ${mode === 'full' ? '完整页面 HTML' : 'Body HTML'}。可在 Figma html.to.design 插件中直接粘贴导入！`,
      });
    }).catch(err => {
      console.error('Failed to copy text', err);
      addToast({
        type: 'error',
        title: '复制失败',
        description: '请检查您的浏览器剪贴板权限',
      });
    });
  };

  const handleCopyCode = (content: string) => {
    navigator.clipboard.writeText(content).then(() => {
      setCopiedFile(true);
      setTimeout(() => setCopiedFile(false), 2000);
      addToast({
        type: 'success',
        title: '代码已复制',
        description: '源文件代码已成功拷贝到剪贴板',
      });
    });
  };

  // Load Prototypes
  async function loadPrototypes() {
    try {
      const res = await fetch('/api/prototypes');
      if (res.ok) {
        const data = await res.json();
        setPrototypesList(data);
      } else {
        const error = await res.json();
        addToast({
          type: 'error',
          title: '加载失败',
          description: error.error || '无法加载原型列表',
        });
      }
    } catch (err) {
      console.error('Failed to load prototypes', err);
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接到服务器，请检查网络连接',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPrototypes();
    
    // Prefill form if query parameters are passed (Task 18 closing loop)
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const prefillName = params.get('name');
      const prefillDesc = params.get('desc');
      if (prefillName) setName(prefillName);
      if (prefillDesc) setDescription(prefillDesc);
    }
  }, []);

  // Polling for Agent Traces when a run is active
  useEffect(() => {
    if (!activeRunId) return;

    async function fetchTraces() {
      try {
        const res = await fetch(`/api/traces?runId=${activeRunId}`);
        if (res.ok) {
          const data = await res.json();
          setTraces(data);
          
          // If the last trace status is success or error, stop polling and refresh lists
          if (data.length > 0) {
            const lastTrace = data[data.length - 1];
            if (
              (lastTrace.step === 'Success' && lastTrace.status === 'success') || 
              (lastTrace.step === 'Failed' && lastTrace.status === 'error')
            ) {
              setRunningId(null);
              setRunningAction(null);
              setActiveRunId(null);
              loadPrototypes();
              
              // Show completion toast
              if (lastTrace.status === 'success') {
                addToast({
                  type: 'success',
                  title: 'Agent 执行完成',
                  description: lastTrace.message,
                  duration: 7000,
                });
              } else if (lastTrace.status === 'error') {
                addToast({
                  type: 'error',
                  title: 'Agent 执行失败',
                  description: lastTrace.message,
                  duration: 10000,
                });
              }
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch traces', err);
      }
    }

    fetchTraces();
    const interval = setInterval(fetchTraces, 2000);
    return () => clearInterval(interval);
  }, [activeRunId, addToast]);

  // Scroll to bottom of agent console log (scroll the container, not the page)
  useEffect(() => {
    if (showConsole && consoleContainerRef.current) {
      consoleContainerRef.current.scrollTop = consoleContainerRef.current.scrollHeight;
    }
  }, [traces, showConsole]);

  // Image Upload -> base64
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageFile(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Submit form to create Prototype Draft
  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !description) return;
    setCreating(true);

    try {
      const res = await fetch('/api/prototypes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });

      if (res.ok) {
        setName('');
        setDescription('');
        setImageFile(null);
        // Reset file input
        const fileInput = document.getElementById('image-upload') as HTMLInputElement;
        if (fileInput) fileInput.value = '';

        await loadPrototypes();
        
        addToast({
          type: 'success',
          title: '创建成功',
          description: `原型 "${name}" 已保存为草稿`,
        });
      } else {
        const error = await res.json();
        addToast({
          type: 'error',
          title: '创建失败',
          description: error.error || '无法创建原型',
        });
      }
    } catch (err) {
      console.error('Failed to create prototype', err);
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接到服务器，请检查网络连接',
      });
    } finally {
      setCreating(false);
    }
  };

  // Trigger Agent Run
  const handleRunAgent = async (protoId: number, assessOnly = false) => {
    setRunningId(protoId);
    setRunningAction(assessOnly ? 'assess' : 'generate');
    setTraces([]);
    setShowConsole(true);

    try {
      const res = await fetch('/api/prototypes/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          prototypeId: protoId, 
          assessOnly, 
          image: imageFile || undefined 
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveRunId(data.runId);
        
        addToast({
          type: 'info',
          title: 'Agent 已启动',
          description: data.message || `${assessOnly ? '可行性评估' : '原型生成'} 正在进行中...`,
        });
      } else {
        const error = await res.json();
        setRunningId(null);
        setRunningAction(null);
        
        addToast({
          type: 'error',
          title: 'Agent 启动失败',
          description: error.error || '无法启动 Agent',
        });
      }
    } catch (err) {
      console.error('Failed to run agent', err);
      setRunningId(null);
      setRunningAction(null);
      
      addToast({
        type: 'error',
        title: '网络错误',
        description: '无法连接到服务器，请检查网络连接',
      });
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedProtoId(prev => (prev === id ? null : id));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <p className="text-sm text-slate-100">
            描述您的页面功能或上传草图，AI 即可在本地仓库拉取分支并生成完整的 React 页面代码。
          </p>
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-3 items-start">
        {/* Left Column: Create Form */}
        <div className="lg:col-span-1 space-y-6">
          <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm sticky top-6">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                <Plus className="h-5 w-5 text-cyan-400" />
                新建原型项目
              </CardTitle>
              <CardDescription className="text-slate-200 text-xs">
                在此添加原型构想。可选择“评估可行性”或“直接生成代码”。
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleCreateDraft}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="proto-name" className="text-slate-200 font-medium text-xs">原型名称 (例如: 用户列表卡片)</Label>
                  <Input 
                    id="proto-name"
                    placeholder="请输入简洁的名称"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 focus-visible:ring-cyan-500"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="proto-desc" className="text-slate-200 font-medium text-xs">原型功能描述与需求细则</Label>
                  <textarea
                    id="proto-desc"
                    placeholder="请详细描述页面的模块布局、UI 风格和逻辑交互..."
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    className="flex min-h-[120px] w-full rounded-md border border-slate-700/80 bg-slate-950 px-3 py-2 text-sm text-slate-100 shadow-sm transition-colors placeholder:text-slate-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image-upload" className="text-slate-200 font-medium text-xs flex items-center gap-1">
                    <ImageIcon className="h-3.5 w-3.5 text-slate-100" />
                    上传设计草图 (可选/支持线框图)
                  </Label>
                  <Input 
                    id="image-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="bg-slate-950 border-slate-700/80 text-slate-100 placeholder:text-slate-100 file:mr-4 file:py-1 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-slate-100 hover:file:bg-slate-700 cursor-pointer"
                  />
                  {imageFile && (
                    <div className="relative mt-2 aspect-video w-full overflow-hidden rounded-lg border border-slate-700/80">
                      <img src={imageFile} alt="Sketch preview" className="object-cover w-full h-full" />
                      <button 
                        type="button" 
                        onClick={() => setImageFile(null)}
                        className="absolute right-2 top-2 rounded-full bg-slate-950/80 p-1.5 text-slate-100 hover:text-slate-100"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end border-t border-slate-700/80/40 p-4">
                <Button 
                  type="submit" 
                  disabled={creating || !name || !description}
                  className="w-full bg-slate-900 border border-slate-700/80 hover:bg-slate-800 text-slate-100 rounded-xl text-xs font-semibold"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : '保存至草案'}
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>

        {/* Right Column: List & Console */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Console Panel */}
          {showConsole && (
            <Card className="border-slate-700/80 bg-slate-950 text-slate-100 overflow-hidden shadow-2xl">
              <div className="flex h-10 items-center justify-between border-b border-slate-700/80 px-4 bg-slate-950/90">
                <div className="flex items-center gap-2">
                  <Terminal className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold font-mono">Agent 执行控制台</span>
                </div>
                <button 
                  onClick={() => setShowConsole(false)}
                  className="text-slate-100 hover:text-slate-100 text-xs"
                >
                  隐藏
                </button>
              </div>
              <div ref={consoleContainerRef} className="max-h-60 overflow-y-auto p-4 font-mono text-xs space-y-2 bg-slate-950">
                {traces.length > 0 ? (
                  traces.map((trace) => (
                    <div key={trace.id} className="flex items-start gap-2.5">
                      <span className="text-slate-100">[{new Date(trace.createdAt).toLocaleTimeString()}]</span>
                      <span className={
                        trace.status === 'success' 
                          ? 'text-emerald-400 font-bold' 
                          : trace.status === 'error'
                          ? 'text-rose-400 font-bold'
                          : trace.status === 'warning'
                          ? 'text-amber-400'
                          : 'text-sky-400'
                      }>
                        {trace.step}
                      </span>
                      <span className="text-slate-200">{trace.message}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-slate-100 text-center py-4 italic animate-pulse">
                    正在发送指令，初始化 Agent 运行时环境...
                  </div>
                )}
                <div ref={consoleEndRef} />
              </div>
            </Card>
          )}

          {/* Prototype List */}
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-400" />
              原型分支管理列表
            </h3>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 text-cyan-500 animate-spin" />
              </div>
            ) : prototypesList.length > 0 ? (
              prototypesList.map((proto) => {
                const isExpanded = expandedProtoId === proto.id;
                const isRunning = runningId === proto.id;
                const isAssessing = isRunning && runningAction === 'assess';
                const isGenerating = isRunning && runningAction === 'generate';
                
                return (
                  <Card key={proto.id} className="border-slate-700/80 bg-slate-900/10 backdrop-blur-sm overflow-hidden hover:border-slate-700/50 transition-colors">
                    <div className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                      {/* Name & Branch Info */}
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h4 className="font-semibold text-slate-100 text-base">{proto.name}</h4>
                          <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium border ${
                            proto.status === 'merged' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : proto.status === 'failed'
                              ? 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                              : proto.status === 'pr_created'
                              ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                              : proto.status === 'assessing' || proto.status === 'generating'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse'
                              : 'bg-slate-800 text-slate-100 border-slate-700/50'
                          }`}>
                            {translatePrototypeStatus(proto.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-200 font-mono">分支: {proto.branchName}</p>
                      </div>

                      {/* Operations */}
                      <div className="flex items-center gap-2 shrink-0">
                        {/* Assess Feasibility */}
                        {proto.status === 'draft' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={isRunning}
                            onClick={() => handleRunAgent(proto.id, true)}
                            className="text-xs text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 p-2.5 rounded-lg"
                          >
                            {isAssessing ? (
                              <>
                                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                评估中...
                              </>
                            ) : (
                              '评估方案'
                            )}
                          </Button>
                        )}

                        {/* Generate Code */}
                        {(proto.status === 'draft' || proto.status === 'failed') && (
                          <Button
                            size="sm"
                            disabled={isRunning}
                            onClick={() => handleRunAgent(proto.id, false)}
                            className="bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs"
                          >
                            {isGenerating ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Play className="h-3 w-3 mr-1" />}
                            生成原型
                          </Button>
                        )}

                        {/* Interactive Playground */}
                        {(proto.status === 'generated' || proto.status === 'pr_created' || proto.status === 'merged') && (
                          <Button
                            size="sm"
                            onClick={() => openPlayground(proto)}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs flex items-center gap-1 cursor-pointer"
                          >
                            <Sparkles className="h-3 w-3 animate-pulse" />
                            进入交互沙盒
                          </Button>
                        )}

                        {/* View Pull Request */}
                        {proto.prUrl && (
                          <a
                            href={proto.prUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-3 py-1.5 text-xs text-slate-200 bg-slate-950 hover:bg-slate-900"
                          >
                            查看 PR
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}

                        {/* Expand/Collapse */}
                        <button
                          onClick={() => toggleExpand(proto.id)}
                          className="p-1.5 rounded-lg border border-slate-700/80 hover:bg-slate-800 text-slate-100 hover:text-slate-100"
                        >
                          {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    {/* Expanded Detail Panel */}
                    {isExpanded && (
                      <div className="border-t border-slate-700/80/40 p-5 bg-slate-950/40 space-y-4 text-sm">
                        <div className="space-y-1">
                          <span className="text-xs font-semibold text-slate-200 block uppercase">原型需求描述:</span>
                          <p className="text-slate-200 leading-relaxed font-sans">{proto.description}</p>
                        </div>
                        
                        {/* Render feasibility report if exists */}
                        {proto.feasibilityReport && (
                          <div className="space-y-2 border-t border-slate-700/80/40 pt-4">
                            <span className="text-xs font-semibold text-slate-200 block uppercase">架构师可行性报告:</span>
                            <MarkdownViewer content={proto.feasibilityReport} />
                          </div>
                        )}

                        {proto.commitHash && (
                          <div className="flex gap-4 text-xs font-mono border-t border-slate-700/80/40 pt-4 text-slate-200">
                            <div>
                              <span>Commit: </span>
                              <span className="text-slate-200">{proto.commitHash.slice(0, 7)}</span>
                            </div>
                            <div>
                              <span>更新时间: </span>
                              <span className="text-slate-200">{new Date(proto.updatedAt).toLocaleString()}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </Card>
                );
              })
            ) : (
              <div className="text-center py-16 rounded-2xl border border-dashed border-slate-700/80 text-slate-200 flex flex-col items-center gap-3">
                <FileText className="h-10 w-10 text-slate-700" />
                <span>暂无原型开发记录。在左侧描述需求并创建您的第一个原型项目吧！</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Interactive Playground Modal */}
      {playgroundOpen && selectedPlaygroundProto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full h-[92vh] max-w-7xl flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-700/80 px-6 py-4 bg-slate-900/50">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-base font-bold text-slate-100">{selectedPlaygroundProto.name}</h3>
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    沙盒预览就绪
                  </span>
                </div>
                <p className="text-[11px] text-slate-200 font-mono mt-0.5">本地分支: {selectedPlaygroundProto.branchName}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  onClick={() => setPlaygroundOpen(false)}
                  className="text-slate-100 hover:text-slate-100 p-1.5 rounded-lg hover:bg-slate-800/50 cursor-pointer"
                >
                  <XCircle className="h-6 w-6" />
                </Button>
              </div>
            </div>

            {/* Modal Body: Split View */}
            <div className="flex flex-1 overflow-hidden">
              {/* Left Column: Sandbox Iframe Preview */}
              <div className="flex-[6] flex flex-col bg-slate-950 border-r border-slate-700/80 overflow-hidden">
                {/* Preview Toolbar */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-slate-700/80/80 bg-slate-900/30">
                  <div className="flex items-center gap-1.5">
                    {/* Viewport size selectors */}
                    <button
                      onClick={() => setPreviewDevice('desktop')}
                      className={`p-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                        previewDevice === 'desktop' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-100 hover:text-slate-100 border border-transparent'
                      }`}
                      title="桌面端"
                    >
                      <Monitor className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-[10px]">桌面</span>
                    </button>
                    <button
                      onClick={() => setPreviewDevice('tablet')}
                      className={`p-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                        previewDevice === 'tablet' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-100 hover:text-slate-100 border border-transparent'
                      }`}
                      title="平板端"
                    >
                      <Tablet className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-[10px]">平板</span>
                    </button>
                    <button
                      onClick={() => setPreviewDevice('mobile')}
                      className={`p-1.5 rounded-md text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer ${
                        previewDevice === 'mobile' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'text-slate-100 hover:text-slate-100 border border-transparent'
                      }`}
                      title="手机端"
                    >
                      <Smartphone className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline text-[10px]">手机</span>
                    </button>
                  </div>

                  {/* Path & Refresh */}
                  <div className="flex items-center gap-2 max-w-md w-full px-2">
                    <div className="flex-1 flex items-center gap-1.5 bg-slate-900 border border-slate-700/80 rounded-md px-2.5 py-1 text-[11px] font-mono text-slate-100 overflow-hidden select-all">
                      <span className="text-slate-100">/</span>
                      <span className="truncate text-slate-200">{selectedPlaygroundProto.previewUrl || ''}</span>
                    </div>
                    <button
                      onClick={() => setIframeKey(k => k + 1)}
                      className="p-1.5 rounded-md border border-slate-700/80 bg-slate-900 text-slate-100 hover:text-slate-100 hover:bg-slate-800 transition-colors cursor-pointer"
                      title="刷新预览"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Iframe Viewport Container */}
                <div className="flex-1 bg-slate-950 flex items-center justify-center p-6 overflow-hidden relative">
                  {selectedPlaygroundProto.previewUrl ? (
                    <div
                      className={`h-full transition-all duration-300 bg-slate-900 shadow-2xl rounded-lg overflow-hidden border border-slate-700/80/80 ${
                        previewDevice === 'desktop' ? 'w-full' : previewDevice === 'tablet' ? 'w-[768px]' : 'w-[375px]'
                      }`}
                    >
                      <iframe
                        id="playground-iframe"
                        key={iframeKey}
                        src={selectedPlaygroundProto.previewUrl}
                        className="w-full h-full border-0 bg-slate-950"
                        title="Prototype Live Sandbox"
                      />
                    </div>
                  ) : (
                    <div className="text-slate-200 text-xs text-center space-y-2">
                      <AlertCircle className="h-8 w-8 text-slate-700 mx-auto" />
                      <p>未配置预览 URL，请确保该原型已成功生成页面路由。</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Sidebar Options & Code Viewer */}
              <div className="flex-[4] flex flex-col bg-slate-900 overflow-hidden">
                {/* Tab Selector */}
                <div className="grid grid-cols-4 border-b border-slate-700/80/80 bg-slate-900/80 shrink-0">
                  {(['preview', 'code', 'stackblitz', 'figma'] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setPlaygroundTab(tab)}
                      className={`py-3 text-[11px] font-semibold text-center border-b-2 transition-colors cursor-pointer capitalize ${
                        playgroundTab === tab
                          ? 'border-cyan-500 text-cyan-400 bg-cyan-500/5'
                          : 'border-transparent text-slate-100 hover:text-slate-100 hover:bg-slate-800/30'
                      }`}
                    >
                      {tab === 'preview' ? '使用说明' : tab === 'code' ? '源码视图' : tab === 'stackblitz' ? 'StackBlitz' : 'Figma 逆向'}
                    </button>
                  ))}
                </div>

                {/* Tab Content Panel */}
                <div className="flex-1 overflow-y-auto p-5 space-y-4 min-h-0">
                  {/* Tab 1: Instruction Guide */}
                  {playgroundTab === 'preview' && (
                    <div className="space-y-4 text-xs text-slate-200 leading-relaxed font-sans">
                      <div className="p-4 rounded-xl border border-cyan-500/20 bg-cyan-500/5 space-y-2">
                        <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-cyan-400 animate-pulse" />
                          欢迎进入交互式原型沙盒！
                        </h4>
                        <p className="text-slate-100 text-[11px]">
                          左侧的预览窗口正是使用 Next.js 在本地实时渲染的。您可以在此直接测试所有交互行为，包括按钮点击、页面微动画及表单流。
                        </p>
                      </div>

                      <div className="space-y-3 pt-2">
                        <h5 className="font-semibold text-slate-100 border-l-2 border-cyan-500 pl-2">沙盒主要功能</h5>
                        <ul className="list-disc pl-5 space-y-2 text-slate-100 text-[11px]">
                          <li>
                            <strong className="text-slate-200">多端响应式预览</strong>: 点击左上角切换桌面端、平板端或移动端以测试响应式排版样式。
                          </li>
                          <li>
                            <strong className="text-slate-200">在线沙盒导出</strong>: 切换至 <span className="text-cyan-400 font-medium">StackBlitz</span> 选项卡，可一键将该页面及依赖导出为独立云工程，支持在云端零阻碍分享和二次开发。
                          </li>
                          <li>
                            <strong className="text-slate-200">Figma 矢量图层逆向</strong>: 切换至 <span className="text-cyan-400 font-medium">Figma 逆向</span> 选项卡，可复制本页面的高保真 HTML 树，通过 Figma 插件无缝渲染还原为可编辑的矢量设计图层。
                          </li>
                          <li>
                            <strong className="text-slate-200">源码直读</strong>: 切换至 <span className="text-cyan-400 font-medium">源码视图</span> 选项卡，可以直接阅读、高亮显示并复制所有 AI 为该分支生成的文件。
                          </li>
                        </ul>
                      </div>
                    </div>
                  )}

                  {/* Tab 2: Code Viewer */}
                  {playgroundTab === 'code' && (
                    <div className="space-y-4 flex flex-col h-full overflow-hidden min-h-0">
                      {loadingCodeFiles ? (
                        <div className="flex flex-col items-center justify-center py-12 space-y-2 shrink-0">
                          <Loader2 className="h-6 w-6 text-cyan-500 animate-spin" />
                          <span className="text-xs text-slate-200">正在读取源文件...</span>
                        </div>
                      ) : codeFiles.length > 0 ? (
                        <div className="space-y-3 flex flex-col h-full min-h-0">
                          {/* File Selector */}
                          <div className="space-y-1 shrink-0">
                            <label className="text-[10px] font-semibold text-slate-200 uppercase">选择生成文件:</label>
                            <select
                              value={selectedCodeFile || ''}
                              onChange={e => setSelectedCodeFile(e.target.value)}
                              className="w-full bg-slate-950 border border-slate-700/80 rounded-lg text-xs text-slate-200 px-3 py-2 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                            >
                              {codeFiles.map(file => (
                                <option key={file.path} value={file.path}>
                                  {file.path.split('/').pop()} ({file.path})
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Code Display */}
                          {selectedCodeFile && (
                            <div className="flex-1 flex flex-col min-h-0 bg-slate-950 border border-slate-700/80 rounded-lg overflow-hidden relative">
                              {/* Filename & Copy button */}
                              <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700/80 bg-slate-950/80 shrink-0">
                                <span className="text-[10px] font-mono text-slate-100 truncate">{selectedCodeFile}</span>
                                <button
                                  onClick={() => handleCopyCode(codeFiles.find(f => f.path === selectedCodeFile)?.content || '')}
                                  className="text-[10px] text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-slate-900 transition-colors cursor-pointer"
                                >
                                  {copiedFile ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-400" />
                                      已复制
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      复制
                                    </>
                                  )}
                                </button>
                              </div>
                              {/* Source view */}
                              <pre className="flex-1 p-4 font-mono text-[10px] leading-relaxed text-slate-200 overflow-auto whitespace-pre select-text">
                                {codeFiles.find(f => f.path === selectedCodeFile)?.content || ''}
                              </pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-12 text-xs text-slate-200 shrink-0">
                          <AlertCircle className="h-6 w-6 text-slate-700 mx-auto mb-2" />
                          没有为当前原型找到生成的源文件。
                        </div>
                      )}
                    </div>
                  )}

                  {/* Tab 3: StackBlitz Export */}
                  {playgroundTab === 'stackblitz' && (
                    <div className="space-y-5 text-xs">
                      <div className="p-4 rounded-xl border border-sky-500/20 bg-sky-500/5 space-y-2">
                        <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <ExternalLink className="h-4 w-4 text-sky-400" />
                          云端 StackBlitz 沙盒部署
                        </h4>
                        <p className="text-slate-100 text-[11px] leading-relaxed">
                          一键将此原型的代码打包装入一个完整的在线运行 Next.js + Tailwind React 模版，并在 StackBlitz WebContainers 环境中安全运行，无需在本地配置任何环境。
                        </p>
                      </div>

                      <div className="bg-slate-950/50 border border-slate-700/80 rounded-xl p-4 space-y-3">
                        <h5 className="font-semibold text-slate-200 text-[11px]">我们将打包以下资源并发送给 StackBlitz:</h5>
                        <div className="max-h-40 overflow-y-auto">
                          <ul className="space-y-1.5 text-slate-100 text-[10px] font-mono">
                            <li className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              package.json (依赖包含 Next/React/Lucide 等)
                            </li>
                            <li className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              tailwind.config.js & postcss.config.js
                            </li>
                            <li className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                              tsconfig.json & src/app/layout.tsx
                            </li>
                            {codeFiles.map(file => (
                              <li key={file.path} className="flex items-center gap-1.5 truncate text-slate-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 shrink-0" />
                                {file.path === 'src/app/page.tsx' ? file.path : `${file.path} (自动注入)`}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <Button
                        onClick={handleExportToStackBlitz}
                        disabled={loadingCodeFiles || codeFiles.length === 0}
                        className="w-full bg-sky-600 hover:bg-sky-500 text-white font-bold py-3 px-4 rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors shadow-lg shadow-sky-600/10 cursor-pointer"
                      >
                        <ExternalLink className="h-4 w-4" />
                        一键部署至 StackBlitz (新窗口)
                      </Button>
                    </div>
                  )}

                  {/* Tab 4: Figma Layer Copier */}
                  {playgroundTab === 'figma' && (
                    <div className="space-y-5 text-xs text-slate-200">
                      <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
                        <h4 className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-amber-400" />
                          Figma 矢量图层逆向导入
                        </h4>
                        <p className="text-slate-100 text-[11px] leading-relaxed">
                          直接提取已渲染页面的完整 DOM HTML 及包含的 Tailwind/CSS 样式，允许你通过 Figma 社区内的免费插件一键将网页逆向导入还原为完全可修改的 Figma UI 矢量设计图层。
                        </p>
                      </div>

                      {/* Operation Buttons */}
                      <div className="space-y-2.5">
                        <Button
                          onClick={() => handleCopyForFigma('full')}
                          className="w-full bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 font-semibold py-2.5 rounded-lg text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedFigmaHtml === 'full' ? (
                            <>
                              <Check className="h-4 w-4 text-emerald-400" />
                              完整 HTML 已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-4 w-4 text-slate-100" />
                              复制网页完整 HTML (推荐)
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={() => handleCopyForFigma('body')}
                          variant="ghost"
                          className="w-full border border-dashed border-slate-700/80 text-slate-100 hover:text-slate-100 hover:bg-slate-800/40 font-medium py-2 rounded-lg text-[11px] flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          {copiedFigmaHtml === 'body' ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-400" />
                              Body HTML 已复制
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              仅复制 Body HTML 结构
                            </>
                          )}
                        </Button>
                      </div>

                      {/* Quick Guide */}
                      <div className="space-y-2.5 pt-2 border-t border-slate-700/80/60">
                        <h5 className="font-semibold text-slate-100 text-[11px]">💡 如何导入到 Figma 中？</h5>
                        <ol className="space-y-2 text-slate-100 text-[11px] list-decimal pl-4 leading-relaxed">
                          <li>
                            点击上方按钮 <strong className="text-slate-200">复制网页完整 HTML</strong> 将渲染内容存入剪贴板。
                          </li>
                          <li>
                            在 Figma 工作区中打开 <strong className="text-slate-200">Plugins (插件)</strong> 菜单，搜索并启动 <span className="text-amber-400 font-medium">html.to.design</span> 插件（完全免费使用）。
                          </li>
                          <li>
                            在插件中选择导入模式为 <strong className="text-slate-200">"Import via code" (代码粘贴导入)</strong>，并在输入框中直接粘贴 (<kbd className="bg-slate-800 text-[10px] px-1 py-0.5 rounded">Ctrl+V</kbd> 或 <kbd className="bg-slate-800 text-[10px] px-1 py-0.5 rounded">Cmd+V</kbd>) 刚才复制的 HTML。
                          </li>
                          <li>
                            点击 <strong className="text-slate-100 bg-cyan-600 px-1 py-0.5 rounded-sm">Import</strong> 按钮，插件将完全还原页面的文字、按钮、卡片、背景和布局为可自由拆解和编组的 Figma 矢量图层！
                          </li>
                        </ol>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
