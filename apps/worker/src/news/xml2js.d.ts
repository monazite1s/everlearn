/** @fileoverview 为 rss-parser 的传递依赖 xml2js 提供最小类型声明。 */

declare module 'xml2js' {
  /** rss-parser 只消费 xml2js 解析选项的宽松视图。 */
  export type Options = Record<string, unknown>;
}
