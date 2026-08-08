# 里程碑 10：账号、分享与克隆

本里程碑最后实施权限能力。完成后多用户数据隔离，共享内容只读，克隆后完全独立；仍不允许协作者编辑。

## SHARE-01 引入认证与会话

- 依赖：KB-01、AI-06、NEWS-05、TUT-06、WFU-05。
- 必读：`docs/00-product/product-spec.md`、`docs/02-architecture/system.md`、`docs/03-engineering/quality-gates.md`。
- 目标：用独立任务选定并实现账号注册/登录/退出、服务端会话和 CSRF 防护。
- 实施：开始前必须研究并获得用户对认证依赖确认；迁移本地种子用户而不改变其数据所有权。
- 非目标：组织、团队、OAuth Provider 和角色管理。
- 验收：会话 Cookie 安全；退出立即失效；既有本地数据归迁移后的所有者。
- 验证：认证/CSRF 集成、迁移验证、浏览器登录 E2E。

## SHARE-02 全库所有权审计

- 依赖：SHARE-01。
- 必读：`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`、`AGENTS.md`。
- 目标：逐模块验证所有查询、写入、队列负载、SSE 和附件授权都按当前用户限定。
- 实施：建立跨用户攻击夹具；后台任务从持久化所有者解析权限，不信任客户端 ownerId。
- 非目标：分享例外路径。
- 验收：无法通过 ID、搜索、事件、错误或对象键探测他人资源；日志不泄露标题。
- 验证：模块授权矩阵、越权集成和安全扫描。

## SHARE-03 实现发布快照与公共读取

- 依赖：SHARE-02、ED-04。
- 必读：`docs/01-design/pages/settings-and-public-view.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/system.md`。
- 目标：分享整个知识库或文档子树的只读快照，支持不可猜测 Token、过期、撤销和重新发布。
- 实施：公共投影只含共享树和引用附件；Token 只存哈希；默认 `noindex`；公开接口限流。
- 非目标：实时同步、评论和协作者编辑。
- 验收：私有后续编辑不改变旧快照；撤销立即失效；不可访问响应不泄露存在性。
- 验证：快照/附件授权、Token/过期/撤销集成测试。

## SHARE-04 实现公共阅读页

- 依赖：SHARE-03、UI-04。
- 必读：`docs/01-design/pages/settings-and-public-view.md`、`docs/01-design/design-system.md`、`docs/01-design/layout-and-navigation.md`。
- 目标：实现无私有导航的知识库/文档子树阅读、目录和来源展示。
- 实施：安全只读渲染；失效状态统一；附件下载走分享授权；桌面和移动均可读。
- 非目标：编辑器、AI、运行记录和公开站内搜索。
- 验收：页面无私有元数据；HTML/URL 安全；撤销后的旧页面无法继续加载附件。
- 验证：axe、XSS/协议测试、Playwright 公开阅读/失效页面。

## SHARE-05 实现独立克隆

- 依赖：SHARE-03、KB-03、ED-04。
- 必读：`docs/01-design/pages/settings-and-public-view.md`、`docs/02-architecture/data-model.md`、`docs/02-architecture/api-and-events.md`。
- 目标：登录用户克隆共享知识库或文档子树，深拷贝内容和可访问附件并记录来源。
- 实施：生成新实体和 Block ID 映射；重写内部链接；事务/补偿保证无半副本；请求幂等。
- 非目标：上游更新、差异合并和持续同步。
- 验收：树与链接保持；双方修改互不影响；重复请求只有一个副本。
- 验证：深拷贝/失败补偿/幂等集成、跨账号 E2E。

## SHARE-06 实现分享管理 UI

- 依赖：SHARE-03..05。
- 必读：`docs/01-design/pages/settings-and-public-view.md`、`docs/01-design/pages/knowledge-base.md`。
- 目标：在知识库/文档操作中管理发布、过期、撤销、复制链接和克隆入口。
- 实施：明确分享范围和快照时间；危险操作二次确认；不出现协作者设置。
- 非目标：公开目录、点赞和评论。
- 验收：用户能分辨当前分享范围和版本；撤销反馈立即；访客登录后返回原分享继续克隆。
- 验证：组件、Playwright 分享/撤销/登录后克隆。

## 检查点

运行跨用户授权矩阵、公开安全、分享撤销/过期、克隆独立性 E2E 和 `pnpm check`；确认产品内没有协作者邀请入口。
