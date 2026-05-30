'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Sparkles, 
  Settings, 
  Mail, 
  Lock, 
  Eye, 
  Loader2, 
  Code,
  Layers,
  ArrowRight
} from 'lucide-react';

export default function ComponentCatalogPage() {
  const [loading, setLoading] = useState(false);
  const [inputText, setInputText] = useState('');

  const triggerLoadingDemo = () => {
    setLoading(true);
    setTimeout(() => setLoading(false), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="space-y-1.5">
        <h2 className="text-xl font-bold text-slate-100 font-sans flex items-center gap-2">
          <Layers className="h-5 w-5 text-cyan-400" />
          本地组件展示站 (Storybook 替代)
        </h2>
        <p className="text-sm text-slate-100">
          交互式展示当前工作空间中所有已安装的 shadcn/ui 组件状态与样式，辅助 Agent 进行代码装配。
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-4 items-start">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-1 space-y-4">
          <Card className="border-slate-700/80 bg-slate-900/20 sticky top-6">
            <CardHeader className="p-4">
              <CardTitle className="text-xs font-semibold text-slate-200 uppercase tracking-wider">组件分类</CardTitle>
            </CardHeader>
            <CardContent className="p-2 pt-0 space-y-1">
              <a href="#buttons" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors">
                <Button size="xs" className="h-4 w-4 bg-cyan-500/20 text-cyan-400 border-0 p-0 text-[9px]">B</Button>
                <span>按钮 (Buttons)</span>
              </a>
              <a href="#inputs" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors">
                <Button size="xs" className="h-4 w-4 bg-emerald-500/20 text-emerald-400 border-0 p-0 text-[9px]">I</Button>
                <span>输入框 (Inputs)</span>
              </a>
              <a href="#cards" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors">
                <Button size="xs" className="h-4 w-4 bg-blue-500/20 text-blue-400 border-0 p-0 text-[9px]">C</Button>
                <span>卡片 (Cards)</span>
              </a>
              <a href="#tabs" className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 hover:text-white transition-colors">
                <Button size="xs" className="h-4 w-4 bg-amber-500/20 text-amber-400 border-0 p-0 text-[9px]">T</Button>
                <span>标签页 (Tabs)</span>
              </a>
            </CardContent>
          </Card>
        </div>

        {/* Component Demos */}
        <div className="lg:col-span-3 space-y-12">
          {/* Button Section */}
          <section id="buttons" className="space-y-4 scroll-mt-6">
            <h3 className="text-base font-semibold text-slate-100 border-b border-slate-700/80/80 pb-2 flex items-center gap-2">
              <Code className="h-4 w-4 text-cyan-400" />
              按钮组件 (Button)
            </h3>
            
            <Card className="border-slate-700/80 bg-slate-900/10">
              <CardContent className="p-6 space-y-6">
                {/* Variant demo */}
                <div className="space-y-2">
                  <span className="text-xs text-slate-200 font-semibold uppercase block">风格变体</span>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="default">Default</Button>
                    <Button variant="outline">Outline</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="link">Link</Button>
                  </div>
                </div>

                {/* Sizes demo */}
                <div className="space-y-2">
                  <span className="text-xs text-slate-200 font-semibold uppercase block">尺寸规格</span>
                  <div className="flex flex-wrap items-center gap-3">
                    <Button size="xs">Extra Small</Button>
                    <Button size="sm">Small</Button>
                    <Button size="default">Default</Button>
                    <Button size="lg">Large</Button>
                  </div>
                </div>

                {/* Advanced state demo */}
                <div className="space-y-2">
                  <span className="text-xs text-slate-200 font-semibold uppercase block">复合状态与动效</span>
                  <div className="flex flex-wrap gap-3">
                    <Button variant="outline" className="gap-2">
                      <Settings className="h-4 w-4" />
                      图标按钮
                    </Button>
                    <Button disabled={loading} onClick={triggerLoadingDemo} className="bg-cyan-600 hover:bg-cyan-500 text-white border-0">
                      {loading ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                          正在处理...
                        </>
                      ) : (
                        '点击测试 Loading 状态'
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Input Section */}
          <section id="inputs" className="space-y-4 scroll-mt-6">
            <h3 className="text-base font-semibold text-slate-100 border-b border-slate-700/80/80 pb-2 flex items-center gap-2">
              <Code className="h-4 w-4 text-emerald-400" />
              输入控件 (Input & Label)
            </h3>
            
            <Card className="border-slate-700/80 bg-slate-900/10">
              <CardContent className="p-6 space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Default input */}
                  <div className="space-y-2">
                    <Label htmlFor="demo-input-1" className="text-slate-200 font-medium text-xs">默认输入框</Label>
                    <Input 
                      id="demo-input-1" 
                      placeholder="请输入文本..." 
                      value={inputText}
                      onChange={e => setInputText(e.target.value)}
                      className="bg-slate-950 border-slate-700/80 focus-visible:ring-cyan-500" 
                    />
                    {inputText && (
                      <p className="text-[10px] text-slate-200 font-mono">实时输出: {inputText}</p>
                    )}
                  </div>

                  {/* Icon prepended input */}
                  <div className="space-y-2">
                    <Label htmlFor="demo-input-2" className="text-slate-200 font-medium text-xs">带提示图标 (结合 Label)</Label>
                    <div className="relative">
                      <Input 
                        id="demo-input-2" 
                        type="email" 
                        placeholder="your@email.com" 
                        className="bg-slate-950 border-slate-700/80 pl-8 focus-visible:ring-cyan-500" 
                      />
                      <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-100" />
                    </div>
                  </div>

                  {/* Disabled input */}
                  <div className="space-y-2">
                    <Label htmlFor="demo-input-3" className="text-slate-100 font-medium text-xs">不可编辑状态 (Disabled)</Label>
                    <Input 
                      id="demo-input-3" 
                      disabled 
                      value="只读内容，无法修改" 
                      className="bg-slate-950 border-slate-700/80 text-slate-200" 
                    />
                  </div>

                  {/* Password with indicator */}
                  <div className="space-y-2">
                    <Label htmlFor="demo-input-4" className="text-slate-200 font-medium text-xs">密码输入格式</Label>
                    <div className="relative">
                      <Input 
                        id="demo-input-4" 
                        type="password" 
                        value="mypassword123" 
                        className="bg-slate-950 border-slate-700/80 pl-8 pr-8 focus-visible:ring-cyan-500"
                        readOnly
                      />
                      <Lock className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-100" />
                      <Eye className="absolute right-2.5 top-2.5 h-4 w-4 text-slate-100 cursor-pointer" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>

          {/* Card Section */}
          <section id="cards" className="space-y-4 scroll-mt-6">
            <h3 className="text-base font-semibold text-slate-100 border-b border-slate-700/80/80 pb-2 flex items-center gap-2">
              <Code className="h-4 w-4 text-blue-400" />
              容器卡片 (Card)
            </h3>
            
            <div className="grid gap-6 md:grid-cols-2">
              <Card className="border-slate-700/80 bg-slate-900/10">
                <CardHeader>
                  <CardTitle className="text-slate-100 text-sm">简单标准卡片</CardTitle>
                  <CardDescription className="text-slate-200 text-xs">用于展示各种基础看板指标或说明信息。</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-slate-100 leading-relaxed">
                  卡片组件支持多阶嵌套结构，提供统一的圆角、内边距以及边框投影规范，确保视觉层级一致。
                </CardContent>
                <CardFooter className="flex justify-between border-t border-slate-900 p-4 text-[10px] text-slate-200 font-mono">
                  <span>Footer Left</span>
                  <span>Footer Right</span>
                </CardFooter>
              </Card>

              <Card className="border-slate-700/80 bg-gradient-to-tr from-cyan-950/20 via-slate-900/10 to-slate-950 shadow-lg">
                <CardHeader>
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/10 text-cyan-400 mb-2">
                    <Sparkles className="h-4 w-4" />
                  </div>
                  <CardTitle className="text-slate-100 text-sm">渐变修饰卡片 (哇哦视效)</CardTitle>
                  <CardDescription className="text-slate-200 text-xs">结合了 HSL 渐变底色的卡片设计，可用于核心推荐。</CardDescription>
                </CardHeader>
                <CardContent className="text-xs text-slate-100 leading-relaxed">
                  提供细微的边框发光和深色渐变微光，在大屏 Dashboard 展现中起到吸引注意力的作用。
                </CardContent>
                <CardFooter className="p-4 pt-0">
                  <Button variant="outline" size="sm" className="w-full border-slate-700/80 bg-slate-950 text-xs hover:bg-slate-900 rounded-lg">
                    查看详情 <ArrowRight className="h-3 w-3 ml-1" />
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </section>

          {/* Tabs Section */}
          <section id="tabs" className="space-y-4 scroll-mt-6">
            <h3 className="text-base font-semibold text-slate-100 border-b border-slate-700/80/80 pb-2 flex items-center gap-2">
              <Code className="h-4 w-4 text-amber-400" />
              标签页组件 (Tabs)
            </h3>
            
            <Card className="border-slate-700/80 bg-slate-900/10">
              <CardContent className="p-6">
                <Tabs defaultValue="tab1" className="w-full">
                  <TabsList className="bg-slate-950 border border-slate-700/80/60 p-1 rounded-xl">
                    <TabsTrigger value="tab1" className="rounded-lg text-xs font-semibold px-4 py-2">标签页 A</TabsTrigger>
                    <TabsTrigger value="tab2" className="rounded-lg text-xs font-semibold px-4 py-2">标签页 B</TabsTrigger>
                    <TabsTrigger value="tab3" className="rounded-lg text-xs font-semibold px-4 py-2">标签页 C</TabsTrigger>
                  </TabsList>
                  
                  <div className="mt-4 p-4 border border-slate-700/80/40 rounded-xl bg-slate-950/40 text-xs text-slate-100 leading-relaxed min-h-[80px]">
                    <TabsContent value="tab1">
                      这是<strong>标签页 A</strong>的详细内容。可以用作各种分类数据的即时过滤视图，无额外路由开销。
                    </TabsContent>
                    <TabsContent value="tab2">
                      这是<strong>标签页 B</strong>的内容。基于 next/navigation 或 react-state 快速切换。
                    </TabsContent>
                    <TabsContent value="tab3">
                      这是<strong>标签页 C</strong>的内容。可以嵌入表单、列表或其他的卡片图表组件。
                    </TabsContent>
                  </div>
                </Tabs>
              </CardContent>
            </Card>
          </section>
        </div>
      </div>
    </div>
  );
}
