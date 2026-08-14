/** @fileoverview 将根路由接入知识优先的首页组合。 */

import { HomePage } from '../features/home/home-page';

/** 用于根据公开 API 数据渲染默认知识优先首页。 */
export default function HomeRoute() {
  return <HomePage />;
}
