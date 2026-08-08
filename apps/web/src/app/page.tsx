/**
 * @fileoverview Renders the temporary engineering entry page before product UI work begins.
 */

import styles from './page.module.css';

/** Shows a neutral placeholder without implying unfinished product behavior. */
export default function HomePage() {
  return (
    <main className={styles.shell}>
      <section className={styles.content} aria-labelledby="page-title">
        <p>个人学习系统</p>
        <h1 id="page-title">Everlearn 工程基线</h1>
        <p>知识库、资讯、教程与工作流将在后续里程碑逐步接入。</p>
      </section>
    </main>
  );
}
