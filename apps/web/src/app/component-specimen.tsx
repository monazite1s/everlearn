/** @fileoverview Exercises shared UI primitives against the active semantic theme. */

'use client';

import {
  Button,
  Dialog,
  DialogContent,
  DialogTrigger,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TextArea,
  TextInput,
  Toast,
  ToastProvider,
  Tooltip,
  TooltipProvider,
} from '@everlearn/ui';
import { useState } from 'react';

import styles from './component-specimen.module.css';

/** Demonstrates form controls inside the focus-managed modal surface. */
function DocumentDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="primary">新建文档</Button>
      </DialogTrigger>
      <DialogContent description="稍后仍可修改这些信息。" heading="新建文档">
        <div className={styles.form}>
          <TextInput label="标题" placeholder="例如：分布式系统笔记" />
          <TextArea label="摘要" placeholder="用一句话说明本文内容" />
          <Button variant="primary">创建</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Demonstrates anchored help, menus, and tooltips without business-specific wrappers. */
function FloatingControls() {
  return (
    <div className={styles.actions}>
      <Popover>
        <PopoverTrigger asChild>
          <Button>保存状态</Button>
        </PopoverTrigger>
        <PopoverContent>所有更改已在 21:58 自动保存。</PopoverContent>
      </Popover>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost">更多操作</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem>移动文档</MenuItem>
          <MenuItem>复制链接</MenuItem>
        </MenuContent>
      </Menu>
      <Tooltip content="固定到知识库首页">
        <Button aria-label="固定文档" size="small" variant="ghost">
          ◇
        </Button>
      </Tooltip>
    </div>
  );
}

/** Demonstrates the shared selection controls with stable values. */
function SelectionControls() {
  return (
    <Tabs defaultValue="recent">
      <TabsList aria-label="文档范围">
        <TabsTrigger value="recent">最近</TabsTrigger>
        <TabsTrigger value="favorites">收藏</TabsTrigger>
      </TabsList>
      <TabsContent value="recent">显示最近编辑的文档。</TabsContent>
      <TabsContent value="favorites">显示已收藏的文档。</TabsContent>
      <Select defaultValue="week">
        <SelectTrigger aria-label="更新时间" />
        <SelectContent>
          <SelectItem value="today">今天</SelectItem>
          <SelectItem value="week">最近一周</SelectItem>
        </SelectContent>
      </Select>
    </Tabs>
  );
}

/** Shows the complete shared primitive set before application-shell composition begins. */
export function ComponentSpecimen() {
  const [toastOpen, setToastOpen] = useState(false);

  /** Opens a deterministic notification for visual and browser verification. */
  function showToast(): void {
    setToastOpen(true);
  }

  return (
    <TooltipProvider delayDuration={150}>
      <ToastProvider>
        <section className={styles.specimen} aria-labelledby="component-title">
          <header>
            <p className={styles.eyebrow}>共享组件</p>
            <h2 id="component-title">行为交给 Radix，视觉交给主题</h2>
          </header>
          <div className={styles.grid}>
            <div>
              <DocumentDialog />
              <FloatingControls />
            </div>
            <SelectionControls />
          </div>
          <Button onClick={showToast}>显示通知</Button>
          <Toast
            action={{ altText: '重新执行保存操作', label: '重试' }}
            description="这是一条可恢复的示例错误。"
            onOpenChange={setToastOpen}
            open={toastOpen}
            title="自动保存失败"
          />
        </section>
      </ToastProvider>
    </TooltipProvider>
  );
}
