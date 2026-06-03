'use client';

import { useState, useEffect } from 'react';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { 
  Play, 
  Square, 
  RefreshCw, 
  Loader2, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Zap,
  GitBranch,
  BarChart3,
  Edit,
  Trash2,
  Plus,
  X,
  AlertTriangle,
  Info,
  Activity
} from 'lucide-react';

const TASK_STATUS_MAP: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  completed: '已完成',
  failed: '失败',
  skipped: '已跳过',
};

function translateTaskStatus(status: string): string {
  return TASK_STATUS_MAP[status] ?? status;
}

interface Workflow {
  name: string;
  description: string;
  taskCount: number;
  isCustom: boolean;
  tasks: TaskForm[];
}

interface TaskForm {
  id: string;
  name: string;
  type: 'agent' | 'shell';
  agentName?: string;
  command?: string;
  dependencies: string[];
  input?: any; // JSON string or object
}

interface TaskStatus {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  duration: number | null;
  error?: string;
}

interface ExecutionResult {
  success: boolean;
  stats: {
    total: number;
    completed: number;
    failed: number;
    pending: number;
    running: number;
    skipped: number;
  };
  tasks: TaskStatus[];
  events: any[];
  visualization: string;
}

export default function WorkflowsPage() {
  const { addToast } = useToast();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState<string | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecutionResult | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Workflow Editor State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingOrigName, setEditingOrigName] = useState('');
  
  const [wfName, setWfName] = useState('');
  const [wfDescription, setWfDescription] = useState('');
  const [wfTasks, setWfTasks] = useState<TaskForm[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadWorkflows();
  }, []);

  async function loadWorkflows() {
    try {
      const res = await fetch('/api/orchestrator');
      if (res.ok) {
        const data = await res.json();
        setWorkflows(data.workflows || []);
      } else {
        setMessage({ type: 'error', text: '加载工作流失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: '网络错误' });
    } finally {
      setLoading(false);
    }
  }

  async function executeWorkflow(workflowName: string) {
    setExecuting(workflowName);
    setExecutionResult(null);
    setMessage(null);

    try {
      const res = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          workflowName,
          maxParallel: 3,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        setExecutionResult(result);
        
        if (result.success) {
          setMessage({ 
            type: 'success', 
            text: `工作流 "${workflowName}" 执行完成！完成 ${result.stats.completed}/${result.stats.total} 个任务` 
          });
        } else {
          setMessage({ 
            type: 'error', 
            text: `工作流执行失败：${result.stats.failed} 个任务失败` 
          });
        }
      } else {
        const errData = await res.json();
        setMessage({ type: 'error', text: `执行失败: ${errData.error}` });
      }
    } catch (err: any) {
      setMessage({ type: 'error', text: `执行失败: ${err.message}` });
    } finally {
      setExecuting(null);
    }
  }

  // Open editor for creating
  function openCreateModal() {
    setWfName('');
    setWfDescription('');
    setWfTasks([
      { id: 'task-1', name: '步骤 1', type: 'agent', agentName: 'SignalCollector', dependencies: [], input: {} }
    ]);
    setIsEditing(false);
    setEditingOrigName('');
    setIsEditorOpen(true);
  }

  // Open editor for editing
  function openEditModal(wf: Workflow) {
    setWfName(wf.name);
    setWfDescription(wf.description);
    
    // Map tasks to include proper string inputs for UI representation if needed
    const formattedTasks = wf.tasks.map(t => ({
      ...t,
      input: typeof t.input === 'object' ? JSON.stringify(t.input) : t.input || '{}'
    }));
    
    setWfTasks(formattedTasks);
    setIsEditing(true);
    setEditingOrigName(wf.name);
    setIsEditorOpen(true);
  }

  // Save workflow (create or update)
  async function handleSaveWorkflow(e: React.FormEvent) {
    e.preventDefault();
    if (!wfName || !wfDescription || wfTasks.length === 0) return;

    // Validate Task IDs uniqueness
    const ids = wfTasks.map(t => t.id.trim());
    const uniqueIds = new Set(ids);
    if (ids.length !== uniqueIds.size) {
      addToast({ type: 'error', title: '验证失败', description: '任务 ID 必须在工作流中唯一，请检查命名！' });
      return;
    }

    setSaving(true);
    try {
      // If we are editing and changed the name, delete the old one first to avoid duplicates
      if (isEditing && editingOrigName !== wfName) {
        await fetch('/api/orchestrator/manage', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: editingOrigName }),
        });
      }

      // Format tasks to convert input strings to objects
      const finalTasks = wfTasks.map(t => {
        let parsedInput = {};
        try {
          parsedInput = typeof t.input === 'string' ? JSON.parse(t.input) : t.input || {};
        } catch {
          parsedInput = {};
        }
        return {
          id: t.id,
          name: t.name,
          type: t.type,
          agentName: t.type === 'agent' ? t.agentName : undefined,
          command: t.type === 'shell' ? t.command : undefined,
          dependencies: t.dependencies,
          input: parsedInput,
        };
      });

      const res = await fetch('/api/orchestrator/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: wfName,
          description: wfDescription,
          tasks: finalTasks,
        }),
      });

      if (res.ok) {
        setIsEditorOpen(false);
        await loadWorkflows();
        setMessage({
          type: 'success',
          text: isEditing ? '工作流已更新。' : '新建工作流已保存。',
        });
      } else {
        const errData = await res.json();
        addToast({ type: 'error', title: '保存失败', description: errData.error });
      }
    } catch (err: any) {
      addToast({ type: 'error', title: '保存失败', description: err.message });
    } finally {
      setSaving(false);
    }
  }

  // Delete custom workflow
  async function handleDeleteWorkflow(name: string) {
    if (!confirm(`确定要删除自定义工作流 "${name}" 吗？此操作无法撤销。`)) return;

    try {
      const res = await fetch('/api/orchestrator/manage', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });

      if (res.ok) {
        await loadWorkflows();
        setMessage({ type: 'success', text: `工作流 "${name}" 已删除` });
      } else {
        const errData = await res.json();
        addToast({ type: 'error', title: '删除失败', description: errData.error });
      }
    } catch (err) {
      addToast({ type: 'error', title: '删除失败', description: '请检查网络连接' });
    }
  }

  // Task editor helpers
  function addTask() {
    const nextIdx = wfTasks.length + 1;
    setWfTasks([
      ...wfTasks,
      {
        id: `task-${nextIdx}`,
        name: `步骤 ${nextIdx}`,
        type: 'agent',
        agentName: 'ProtoBuilder',
        dependencies: [],
        input: '{}'
      }
    ]);
  }

  function removeTask(index: number) {
    const taskToDelete = wfTasks[index];
    const updated = wfTasks.filter((_, idx) => idx !== index);
    
    // Clean up dependencies referencing the deleted task ID
    const cleaned = updated.map(t => ({
      ...t,
      dependencies: t.dependencies.filter(depId => depId !== taskToDelete.id)
    }));
    
    setWfTasks(cleaned);
  }

  function updateTaskField(index: number, field: keyof TaskForm, value: any) {
    const updated = [...wfTasks];
    updated[index] = {
      ...updated[index],
      [field]: value
    };
    setWfTasks(updated);
  }

  function toggleDependency(index: number, depId: string) {
    const task = wfTasks[index];
    const exists = task.dependencies.includes(depId);
    let newDeps = [...task.dependencies];
    
    if (exists) {
      newDeps = newDeps.filter(d => d !== depId);
    } else {
      newDeps.push(depId);
    }
    
    updateTaskField(index, 'dependencies', newDeps);
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-slate-100" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-400 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-rose-400" />;
      case 'skipped':
        return <Square className="h-4 w-4 text-amber-400" />;
      default:
        return <Clock className="h-4 w-4 text-slate-100" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'text-slate-100';
      case 'running':
        return 'text-blue-400';
      case 'completed':
        return 'text-emerald-400';
      case 'failed':
        return 'text-rose-400';
      case 'skipped':
        return 'text-amber-400';
      default:
        return 'text-slate-100';
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
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-100 bg-gradient-to-r from-cyan-200 via-slate-100 to-cyan-100 bg-clip-text text-transparent">
            多 Agent 工作流编排 (Workflow Orchestrator)
          </h1>
          <p className="text-xs text-slate-100">
            可视化创建与修改多智能体 DAG（有向无环图）工作流，支持并发限制及级联依赖处理
          </p>
        </div>
        
        <div className="flex gap-2">
          <Button
            onClick={openCreateModal}
            className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs rounded-xl h-9 px-4 shrink-0 shadow-lg shadow-cyan-500/10"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            新建工作流
          </Button>
          <Button
            onClick={loadWorkflows}
            variant="outline"
            className="border-slate-700/80 bg-slate-900/50 hover:bg-slate-800 text-slate-200 rounded-xl text-xs shrink-0"
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            刷新
          </Button>
        </div>
      </div>

      {message && (
        <div className={`flex items-center gap-3 rounded-xl border p-4 text-xs ${
          message.type === 'success' 
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' 
            : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
        }`}>
          {message.type === 'success' ? <CheckCircle2 className="h-5 w-5 shrink-0" /> : <XCircle className="h-5 w-5 shrink-0" />}
          <span>{message.text}</span>
        </div>
      )}

      {/* Available Workflows */}
      <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
            <GitBranch className="h-4.5 w-4.5 text-cyan-400" />
            工作流列表
          </CardTitle>
          <CardDescription className="text-slate-200 text-xs">
            系统默认流不可修改，自定义工作流可以进行编辑与删除。
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {workflows.length === 0 ? (
            <div className="text-center py-8 text-slate-200">
              <GitBranch className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>暂无可用工作流</p>
            </div>
          ) : (
            workflows.map((workflow) => (
              <div
                key={workflow.name}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-slate-700/80 bg-slate-950/40"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-250 text-sm">{workflow.name}</h3>
                    <span className="text-[10px] text-slate-200 bg-slate-800 px-2 py-0.5 rounded">
                      {workflow.taskCount} 个任务
                    </span>
                    {workflow.isCustom ? (
                      <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-1.5 py-0.5 rounded font-medium">
                        自定义
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-200 bg-slate-900 border border-slate-850 px-1.5 py-0.5 rounded font-medium">
                        系统默认
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-100">{workflow.description}</p>
                </div>
                
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    onClick={() => executeWorkflow(workflow.name)}
                    disabled={executing === workflow.name}
                    className="bg-cyan-650/10 border border-cyan-500/20 text-cyan-400 hover:bg-cyan-600/20 text-xs rounded-xl h-8 px-3.5"
                  >
                    {executing === workflow.name ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        执行中...
                      </>
                    ) : (
                      <>
                        <Play className="mr-1 h-3.5 w-3.5" />
                        启动执行
                      </>
                    )}
                  </Button>

                  {workflow.isCustom && (
                    <>
                      <Button
                        onClick={() => openEditModal(workflow)}
                        variant="outline"
                        className="border-slate-700/80 hover:bg-slate-800 text-slate-200 rounded-xl h-8 px-2.5"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        onClick={() => handleDeleteWorkflow(workflow.name)}
                        className="bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/20 text-rose-400 rounded-xl h-8 px-2.5"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      {/* Workflow Editor Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-slate-950 border border-slate-850 rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-5 border-b border-slate-850">
              <h3 className="font-semibold text-slate-100 text-base">
                {isEditing ? '编辑工作流' : '新建自定义工作流'}
              </h3>
              <button 
                onClick={() => setIsEditorOpen(false)}
                className="text-slate-200 hover:text-slate-200 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveWorkflow} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Meta Inputs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-450 font-medium">工作流标志名称 (Name ID)</label>
                    <input
                      type="text"
                      required
                      disabled={isEditing} // Block changing the key identifier when editing
                      value={wfName}
                      onChange={(e) => setWfName(e.target.value)}
                      placeholder="e.g. signal-to-pr-automation"
                      className="w-full bg-slate-900 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono disabled:opacity-50"
                    />
                    <p className="text-[10px] text-slate-200">仅允许字母、数字和连字符</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-450 font-medium">工作流简要描述 (Description)</label>
                    <input
                      type="text"
                      required
                      value={wfDescription}
                      onChange={(e) => setWfDescription(e.target.value)}
                      placeholder="例如: 捕捉需求信号并自动生成 PR 报告"
                      className="w-full bg-slate-900 border border-slate-700/80 text-slate-100 text-xs rounded-xl h-9 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                    />
                  </div>
                </div>

                {/* Tasks List */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-slate-200 font-semibold flex items-center gap-1">
                      任务流步骤配比 ({wfTasks.length})
                    </label>
                    <Button
                      type="button"
                      onClick={addTask}
                      className="bg-cyan-600/10 hover:bg-cyan-600/20 border border-cyan-500/20 text-cyan-400 text-[10px] rounded-lg h-7 px-2"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      添加步骤
                    </Button>
                  </div>

                  {wfTasks.length === 0 ? (
                    <div className="text-center py-6 border border-dashed border-slate-850 rounded-xl text-slate-200 text-xs">
                      目前没有步骤，请点击右上角“添加步骤”按钮配置 DAG
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {wfTasks.map((task, idx) => (
                        <div 
                          key={idx}
                          className="p-4 rounded-xl border border-slate-850 bg-slate-900/40 relative space-y-3"
                        >
                          {/* Close button */}
                          <button
                            type="button"
                            onClick={() => removeTask(idx)}
                            className="absolute top-4 right-4 text-slate-200 hover:text-rose-400 transition-colors"
                          >
                            <X className="h-4 w-4" />
                          </button>

                          {/* Task ID and Display Name */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-6">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-550 font-medium">任务标志 (Task ID)</span>
                              <input
                                type="text"
                                required
                                value={task.id}
                                onChange={(e) => updateTaskField(idx, 'id', e.target.value)}
                                placeholder="e.g. collect-logs"
                                className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-8 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                              />
                            </div>
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-550 font-medium">步骤显示名称</span>
                              <input
                                type="text"
                                required
                                value={task.name}
                                onChange={(e) => updateTaskField(idx, 'name', e.target.value)}
                                placeholder="e.g. 搜集用户日志"
                                className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-8 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              />
                            </div>
                          </div>

                          {/* Task Type Selector */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-550 font-medium">类型</span>
                              <select
                                value={task.type}
                                onChange={(e) => updateTaskField(idx, 'type', e.target.value as 'agent' | 'shell')}
                                className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-8 px-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                              >
                                <option value="agent">🤖 AI Agent 代理</option>
                                <option value="shell">💻 Shell 命令</option>
                              </select>
                            </div>

                            {/* Conditional inputs */}
                            {task.type === 'agent' ? (
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-550 font-medium">选择 Agent</span>
                                <select
                                  value={task.agentName || ''}
                                  onChange={(e) => updateTaskField(idx, 'agentName', e.target.value)}
                                  className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-8 px-2.5 focus:outline-none focus:ring-1 focus:ring-cyan-500"
                                >
                                  <option value="SignalCollector">SignalCollector (反馈信号收集)</option>
                                  <option value="ProtoBuilder">ProtoBuilder (AI 编码原型)</option>
                                  <option value="ReviewBot">ReviewBot (代码合并评审)</option>
                                  <option value="ReportGenerator">ReportGenerator (洞察周报生成)</option>
                                  <option value="OpenHands">OpenHands (多任务智能体)</option>
                                </select>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <span className="text-[10px] text-slate-550 font-medium">运行指令 (Shell Command)</span>
                                <input
                                  type="text"
                                  required
                                  value={task.command || ''}
                                  onChange={(e) => updateTaskField(idx, 'command', e.target.value)}
                                  placeholder="e.g. npm run test:ci"
                                  className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-xs rounded-xl h-8 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                                />
                              </div>
                            )}
                          </div>

                          {/* Agent Input config */}
                          {task.type === 'agent' && (
                            <div className="space-y-1">
                              <span className="text-[10px] text-slate-550 font-medium flex items-center gap-1">
                                Agent 参数输入 (JSON 格式)
                                <Info className="h-3 w-3 text-slate-200" />
                              </span>
                              <input
                                type="text"
                                value={task.input || ''}
                                onChange={(e) => updateTaskField(idx, 'input', e.target.value)}
                                placeholder='{"assessOnly": false}'
                                className="w-full bg-slate-950 border border-slate-850 text-slate-100 text-[11px] rounded-xl h-8 px-3 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
                              />
                            </div>
                          )}

                          {/* Task Dependencies (Multi-select) */}
                          <div className="space-y-1.5 pt-1">
                            <span className="text-[10px] text-slate-550 font-medium block">
                              前置依赖条件 (选择当前运行前必须完成的任务步骤)
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {wfTasks
                                .filter((_, fIdx) => fIdx !== idx) // Cannot depend on self
                                .map((t) => {
                                  const isDep = task.dependencies.includes(t.id);
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => toggleDependency(idx, t.id)}
                                      className={`text-[10px] px-2 py-0.5 rounded transition-all border ${
                                        isDep
                                          ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400'
                                          : 'bg-slate-950 border-slate-850 text-slate-200 hover:text-slate-200'
                                      }`}
                                    >
                                      {t.id}
                                    </button>
                                  );
                                })}
                              {wfTasks.filter((_, fIdx) => fIdx !== idx).length === 0 && (
                                <span className="text-[9px] text-slate-100">目前没有其他任务可作为依赖</span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="p-5 border-t border-slate-850 bg-slate-950 flex items-center justify-end gap-3 shrink-0">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsEditorOpen(false)}
                  className="border-slate-850 hover:bg-slate-800 text-slate-350 text-xs rounded-xl h-9 px-4"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={saving}
                  className="bg-cyan-600 hover:bg-cyan-550 text-white text-xs font-semibold rounded-xl h-9 px-5 shadow-lg shadow-cyan-500/10"
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      正在保存...
                    </>
                  ) : (
                    '保存工作流'
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Execution Results */}
      {executionResult && (
        <>
          {/* Statistics */}
          <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                <BarChart3 className="h-4.5 w-4.5 text-emerald-400" />
                执行统计
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-100">{executionResult.stats.total}</div>
                  <div className="text-xs text-slate-200">总任务</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-emerald-400">{executionResult.stats.completed}</div>
                  <div className="text-xs text-slate-200">已完成</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-rose-400">{executionResult.stats.failed}</div>
                  <div className="text-xs text-slate-200">失败</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-400">{executionResult.stats.skipped}</div>
                  <div className="text-xs text-slate-200">跳过</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-400">{executionResult.stats.running}</div>
                  <div className="text-xs text-slate-200">运行中</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-100">{executionResult.stats.pending}</div>
                  <div className="text-xs text-slate-200">等待中</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Task Details */}
          <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                <Activity className="h-4.5 w-4.5 text-blue-400" />
                任务详情
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {executionResult.tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between p-3 rounded-xl border border-slate-700/80 bg-slate-950/20"
                >
                  <div className="flex items-center gap-3">
                    {getStatusIcon(task.status)}
                    <div>
                      <div className="font-medium text-slate-100 text-sm">{task.name}</div>
                      <div className={`text-xs ${getStatusColor(task.status)}`}>
                        {translateTaskStatus(task.status)}
                        {task.duration && ` • ${task.duration}ms`}
                      </div>
                    </div>
                  </div>
                  
                  {task.error && (
                    <div className="text-xs text-rose-400 bg-rose-500/5 px-2 py-1 rounded border border-rose-500/20 max-w-xs truncate">
                      {task.error}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          {/* DAG Visualization */}
          {executionResult.visualization && (
            <Card className="border-slate-700/80 bg-slate-900/20 backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="text-slate-100 flex items-center gap-2 text-base">
                  <Zap className="h-4.5 w-4.5 text-blue-400" />
                  任务依赖图 (DAG)
                </CardTitle>
                <CardDescription className="text-slate-200 text-xs">
                  显示任务执行顺序和依赖关系
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="text-xs text-slate-200 bg-slate-950/50 p-4 rounded-xl border border-slate-700/80 overflow-x-auto font-mono">
                  {executionResult.visualization}
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}