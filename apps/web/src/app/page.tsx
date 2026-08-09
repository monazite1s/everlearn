/** @fileoverview Presents every semantic theme role and the persisted theme controls. */

'use client';

import type { ChangeEvent } from 'react';

import { appearanceOptions, themeOptions, useTheme } from './theme-provider';
import styles from './page.module.css';

/** Renders one configured palette choice. */
function renderThemeOption(option: (typeof themeOptions)[number]) {
  return (
    <option key={option.id} value={option.id}>
      {option.label}
    </option>
  );
}

/** Renders one configured appearance choice. */
function renderAppearanceOption(option: (typeof appearanceOptions)[number]) {
  return (
    <option key={option.id} value={option.id}>
      {option.label}
    </option>
  );
}

/** Switches palettes and appearance using native keyboard-accessible controls. */
function ThemeToolbar() {
  const theme = useTheme();

  /** Applies the selected semantic palette. */
  function handleThemeChange(event: ChangeEvent<HTMLSelectElement>): void {
    theme.setTheme(event.target.value === 'neutral' ? 'neutral' : 'paper');
  }

  /** Applies the selected light, dark, or system appearance. */
  function handleAppearanceChange(event: ChangeEvent<HTMLSelectElement>): void {
    const value = event.target.value;
    theme.setAppearance(value === 'dark' || value === 'light' ? value : 'system');
  }

  return (
    <section className={styles.toolbar} aria-label="主题设置">
      <div>
        <label htmlFor="theme">主题</label>
        <select id="theme" value={theme.theme} onChange={handleThemeChange}>
          {themeOptions.map(renderThemeOption)}
        </select>
      </div>
      <div>
        <label htmlFor="appearance">外观</label>
        <select id="appearance" value={theme.appearance} onChange={handleAppearanceChange}>
          {appearanceOptions.map(renderAppearanceOption)}
        </select>
      </div>
      {!theme.persistenceAvailable && (
        <p className={styles['storage-warning']} role="status">
          浏览器已阻止保存外观设置。
        </p>
      )}
    </section>
  );
}

/** Demonstrates the reading hierarchy and knowledge-spine signature. */
function ReadingSpecimen() {
  return (
    <section className={styles.reading} aria-labelledby="reading-title">
      <div className={styles.spine} aria-hidden="true" />
      <p className={styles.eyebrow}>知识库 / 设计札记</p>
      <h2 id="reading-title">让主题退到内容之后</h2>
      <p className={styles['reading-copy']}>
        长期学习需要稳定的阅读节奏。主题只改变纸面、墨色与强调关系，不改变信息结构，也不要求业务组件认识任何主题名称。
      </p>
      <blockquote>好的界面像书页：知道何时留下空白，也知道哪一条批注值得被看见。</blockquote>
      <div className={styles['meta-row']}>
        <span>已保存</span>
        <code>--accent</code>
        <a href="#semantic-colors">查看语义色</a>
      </div>
    </section>
  );
}

/** Renders one named semantic color without exposing palette-specific values. */
function SemanticColor({ label, token }: { label: string; token: string }) {
  return (
    <li>
      <span className={styles.swatch} style={{ background: `var(${token})` }} aria-hidden="true" />
      <strong>{label}</strong>
      <code>{token}</code>
    </li>
  );
}

/** Lists every state-bearing semantic role required by product UI. */
function SemanticColors() {
  return (
    <section className={styles.colors} id="semantic-colors" aria-labelledby="colors-title">
      <header>
        <p className={styles.eyebrow}>语义角色</p>
        <h2 id="colors-title">组件只认识这些名字</h2>
      </header>
      <ul>
        <SemanticColor label="画布" token="--canvas" />
        <SemanticColor label="正文表面" token="--surface" />
        <SemanticColor label="临时浮层" token="--surface-raised" />
        <SemanticColor label="正文" token="--ink" />
        <SemanticColor label="辅助文字" token="--ink-muted" />
        <SemanticColor label="边界" token="--border" />
        <SemanticColor label="知识脊线" token="--accent" />
        <SemanticColor label="当前项" token="--accent-soft" />
        <SemanticColor label="失败" token="--danger" />
        <SemanticColor label="等待确认" token="--warning" />
        <SemanticColor label="成功" token="--success" />
      </ul>
    </section>
  );
}

/** Shows the theme specimen page before the application shell is introduced. */
export default function HomePage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Everlearn · 外观标本</p>
          <h1>一套语义，四种光线</h1>
          <p className={styles.intro}>
            主题已与业务结构分离。切换、刷新或改变系统外观，内容层级保持不变。
          </p>
        </div>
        <ThemeToolbar />
      </header>
      <div className={styles.specimens}>
        <ReadingSpecimen />
        <SemanticColors />
      </div>
      <footer className={styles.footer}>
        <span>Typography</span>
        <span>Space · Radius · Shadow · Motion</span>
        <span>Reduced motion ready</span>
      </footer>
    </main>
  );
}
