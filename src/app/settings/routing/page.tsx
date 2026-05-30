'use client';

/**
 * /settings/routing - 路由配置页面
 *
 * 包含：
 * - 通用设置（智能路由、Prompt Caching、Extended Thinking）
 * - 预算管理
 * - 自定义规则管理
 * - 配置导入/导出
 *
 * 对应需求：Requirement 12
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, Plus, Trash2, ToggleLeft, ToggleRight, Download, Upload } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RoutingSettings {
  enable_smart_routing: string;
  enable_prompt_caching: string;
  enable_extended_thinking: string;
  offline_first_mode: string;
  budget_daily: string;
  budget_weekly: string;
  budget_monthly: string;
  budget_auto_downgrade: string;
}

interface CustomRule {
  id: string;
  name: string;
  priority: number;
  enabled: boolean;
  conditions: {
    taskTypes?: string[];
    contextSizeMin?: number;
    contextSizeMax?: number;
    codeComplexityMin?: number;
    codeComplexityMax?: number;
  };
  targetProvider: string;
  targetModel: string;
  matchCount: number;
}

interface NewRuleForm {
  name: string;
  priority: number;
  targetProvider: string;
  targetModel: string;
  taskTypes: string;
  contextSizeMin: string;
  contextSizeMax: string;
  codeComplexityMin: string;
  codeComplexityMax: string;
}

const DEFAULT_RULE_FORM: NewRuleForm = {
  name: '', priority: 50, targetProvider: 'anthropic', targetModel: 'claude-3-5-sonnet-20241022',
  taskTypes: '', contextSizeMin: '', contextSizeMax: '', codeComplexityMin: '', codeComplexityMax: '',
};

// ─── Toggle component ─────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${value ? 'bg-cyan-600' : 'bg-slate-700'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${value ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function RoutingSettingsPage() {
  const [settings, setSettings] = useState<RoutingSettings>({
    enable_smart_routing: 'true',
    enable_prompt_caching: 'true',
    enable_extended_thinking: 'false',
    offline_first_mode: 'false',
    budget_daily: '',
    budget_weekly: '',
    budget_monthly: '',
    budget_auto_downgrade: 'false',
  });
  const [rules, setRules] = useState<CustomRule[]>([]);
  const [showNewRule, setShowNewRule] = useState(false);
  const [newRule, setNewRule] = useState<NewRuleForm>(DEFAULT_RULE_FORM);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadData = useCallback(async () => {
    const [settingsRes, rulesRes] = await Promise.all([
      fetch('/api/settings'),
      fetch('/api/routing/rules'),
    ]);
    if (settingsRes.ok) {
      const data = await settingsRes.json();
      setSettings(prev => ({ ...prev, ...data }));
    }
    if (rulesRes.ok) {
      const data = await rulesRes.json();
      setRules(data.rules ?? []);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    try {
      // Save routing settings
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      // Save budget
      await fetch('/api/costs/budget', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          daily:   settings.budget_daily   ? parseFloat(settings.budget_daily)   : undefined,
          weekly:  settings.budget_weekly  ? parseFloat(settings.budget_weekly)  : undefined,
          monthly: settings.budget_monthly ? parseFloat(settings.budget_monthly) : undefined,
          autoDowngrade: settings.budget_auto_downgrade === 'true',
        }),
      });
      if (res.ok) {
        setMessage({ type: 'success', text: '配置已保存' });
      } else {
        setMessage({ type: 'error', text: '保存失败' });
      }
    } finally {
      setSaving(false);
    }
  };

  const addRule = async () => {
    if (!newRule.name || !newRule.targetProvider || !newRule.targetModel) {
      setMessage({ type: 'error', text: '请填写规则名称、目标 Provider 和模型' });
      return;
    }
    const conditions: CustomRule['conditions'] = {};
    if (newRule.taskTypes) conditions.taskTypes = newRule.taskTypes.split(',').map(s => s.trim()).filter(Boolean);
    if (newRule.contextSizeMin) conditions.contextSizeMin = parseInt(newRule.contextSizeMin);
    if (newRule.contextSizeMax) conditions.contextSizeMax = parseInt(newRule.contextSizeMax);
    if (newRule.codeComplexityMin) conditions.codeComplexityMin = parseInt(newRule.codeComplexityMin);
    if (newRule.codeComplexityMax) conditions.codeComplexityMax = parseInt(newRule.codeComplexityMax);

    const res = await fetch('/api/routing/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: newRule.name,
        priority: newRule.priority,
        conditions,
        targetProvider: newRule.targetProvider,
        targetModel: newRule.targetModel,
      }),
    });
    if (res.ok) {
      setNewRule(DEFAULT_RULE_FORM);
      setShowNewRule(false);
      loadData();
      setMessage({ type: 'success', text: '规则已创建' });
    }
  };

  const deleteRule = async (id: string) => {
    if (!confirm('确定删除此规则？')) return;
    await fetch(`/api/routing/rules/${id}`, { method: 'DELETE' });
    loadData();
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    await fetch(`/api/routing/rules/${id}/toggle`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    loadData();
  };

  const exportConfig = () => {
    const config = { settings, rules };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'routing-config.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const config = JSON.parse(ev.target?.result as string);
        if (config.settings) setSettings(prev => ({ ...prev, ...config.settings }));
        setMessage({ type: 'success', text: '配置已导入，请点击保存' });
      } catch {
        setMessage({ type: 'error', text: '导入失败：无效的 JSON 文件' });
      }
    };
    reader.readAsText(file);
  };

  const bool = (key: keyof RoutingSettings) => settings[key] === 'true';
  const setBool = (key: keyof RoutingSettings, v: boolean) =>
    setSettings(prev => ({ ...prev, [key]: String(v) }));

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">路由配置</h1>
          <p className="text-slate-400 text-sm mt-1">管理智能路由策略、预算和自定义规则</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportConfig}>
            <Download className="h-4 w-4 mr-1" /> 导出
          </Button>
          <label>
            <span className="inline-flex items-center justify-center gap-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium ring-offset-background transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer">
              <Upload className="h-4 w-4" /> 导入
            </span>
            <input type="file" accept=".json" className="hidden" onChange={importConfig} />
          </label>
          <Button size="sm" onClick={saveSettings} disabled={saving}>
            <Save className="h-4 w-4 mr-1" /> {saving ? '保存中...' : '保存配置'}
          </Button>
        </div>
      </div>

      {message && (
        <div className={`p-3 rounded-lg text-sm ${message.type === 'success' ? 'bg-green-500/10 text-green-400 border border-green-500/30' : 'bg-red-500/10 text-red-400 border border-red-500/30'}`}>
          {message.text}
        </div>
      )}

      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle>通用设置</CardTitle>
          <CardDescription>控制路由系统的核心功能</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            { key: 'enable_smart_routing' as const, label: '启用智能路由', desc: '根据任务类型自动选择最优模型' },
            { key: 'enable_prompt_caching' as const, label: '启用 Prompt Caching', desc: '缓存重复提示，降低 Claude API 成本' },
            { key: 'enable_extended_thinking' as const, label: '启用 Extended Thinking', desc: '对复杂推理任务使用 claude-3-7-sonnet 深度思考' },
            { key: 'offline_first_mode' as const, label: '离线优先模式', desc: '优先使用 Ollama 本地模型' },
          ].map(({ key, label, desc }) => (
            <div key={key} className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50">
              <div>
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-slate-400">{desc}</div>
              </div>
              <Toggle value={bool(key)} onChange={v => setBool(key, v)} />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Budget Management */}
      <Card>
        <CardHeader>
          <CardTitle>预算管理</CardTitle>
          <CardDescription>设置 API 成本上限（美元）</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {[
              { key: 'budget_daily' as const, label: '每日限额' },
              { key: 'budget_weekly' as const, label: '每周限额' },
              { key: 'budget_monthly' as const, label: '每月限额' },
            ].map(({ key, label }) => (
              <div key={key} className="space-y-1">
                <Label className="text-sm">{label} ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="不限制"
                  value={settings[key]}
                  onChange={e => setSettings(prev => ({ ...prev, [key]: e.target.value }))}
                  className="bg-slate-950 border-slate-700"
                />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between p-3 rounded-lg border border-slate-700/50">
            <div>
              <div className="font-medium text-sm">超预算自动降级</div>
              <div className="text-xs text-slate-400">超出预算时自动切换到低成本模型</div>
            </div>
            <Toggle value={bool('budget_auto_downgrade')} onChange={v => setBool('budget_auto_downgrade', v)} />
          </div>
        </CardContent>
      </Card>

      {/* Custom Rules */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>自定义规则</CardTitle>
            <CardDescription>按优先级匹配，覆盖默认路由策略</CardDescription>
          </div>
          <Button size="sm" onClick={() => setShowNewRule(true)}>
            <Plus className="h-4 w-4 mr-1" /> 添加规则
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* New rule form */}
          {showNewRule && (
            <div className="p-4 border border-cyan-500/30 rounded-lg bg-cyan-500/5 space-y-3">
              <h4 className="font-medium text-sm">新建规则</h4>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">规则名称 *</Label>
                  <Input value={newRule.name} onChange={e => setNewRule(p => ({ ...p, name: e.target.value }))} placeholder="例：高复杂度代码" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">优先级 (1-100)</Label>
                  <Input type="number" min="1" max="100" value={newRule.priority} onChange={e => setNewRule(p => ({ ...p, priority: parseInt(e.target.value) || 50 }))} className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">目标 Provider *</Label>
                  <Input value={newRule.targetProvider} onChange={e => setNewRule(p => ({ ...p, targetProvider: e.target.value }))} placeholder="anthropic" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">目标模型 *</Label>
                  <Input value={newRule.targetModel} onChange={e => setNewRule(p => ({ ...p, targetModel: e.target.value }))} placeholder="claude-3-opus-20240229" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1 col-span-2">
                  <Label className="text-xs">任务类型（逗号分隔，留空=全部）</Label>
                  <Input value={newRule.taskTypes} onChange={e => setNewRule(p => ({ ...p, taskTypes: e.target.value }))} placeholder="coding, review" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">上下文最小 (tokens)</Label>
                  <Input type="number" value={newRule.contextSizeMin} onChange={e => setNewRule(p => ({ ...p, contextSizeMin: e.target.value }))} placeholder="留空=不限" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">上下文最大 (tokens)</Label>
                  <Input type="number" value={newRule.contextSizeMax} onChange={e => setNewRule(p => ({ ...p, contextSizeMax: e.target.value }))} placeholder="留空=不限" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">复杂度最小 (0-100)</Label>
                  <Input type="number" min="0" max="100" value={newRule.codeComplexityMin} onChange={e => setNewRule(p => ({ ...p, codeComplexityMin: e.target.value }))} placeholder="留空=不限" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">复杂度最大 (0-100)</Label>
                  <Input type="number" min="0" max="100" value={newRule.codeComplexityMax} onChange={e => setNewRule(p => ({ ...p, codeComplexityMax: e.target.value }))} placeholder="留空=不限" className="bg-slate-950 border-slate-700 text-sm" />
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" size="sm" onClick={() => { setShowNewRule(false); setNewRule(DEFAULT_RULE_FORM); }}>取消</Button>
                <Button size="sm" onClick={addRule}>创建规则</Button>
              </div>
            </div>
          )}

          {/* Rules list */}
          {rules.length === 0 && !showNewRule ? (
            <p className="text-slate-400 text-sm text-center py-4">暂无自定义规则</p>
          ) : (
            rules.map(rule => (
              <div key={rule.id} className={`p-3 rounded-lg border ${rule.enabled ? 'border-slate-700/50' : 'border-slate-700/20 opacity-50'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleRule(rule.id, !rule.enabled)}>
                      {rule.enabled
                        ? <ToggleRight className="h-5 w-5 text-cyan-400" />
                        : <ToggleLeft className="h-5 w-5 text-slate-500" />}
                    </button>
                    <div>
                      <div className="font-medium text-sm">{rule.name}</div>
                      <div className="text-xs text-slate-400">
                        优先级: {rule.priority} · {rule.targetProvider}/{rule.targetModel} · 匹配 {rule.matchCount} 次
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => deleteRule(rule.id)}>
                    <Trash2 className="h-4 w-4 text-red-400" />
                  </Button>
                </div>
                {Object.keys(rule.conditions).length > 0 && (
                  <div className="mt-2 text-xs text-slate-500 pl-7">
                    条件: {JSON.stringify(rule.conditions)}
                  </div>
                )}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
