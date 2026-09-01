/** @fileoverview 集中搜索页稳定状态文案，避免相同状态在组合组件间漂移。 */

export const SEARCH_COPY = {
  emptyDescription: '输入关键词，查找文档标题与正文内容。',
  emptyTitle: '开始搜索',
  firstPageFailure: '搜索结果未加载',
  indexUpdating: '部分最新正文仍在索引',
  offlineDescription: '当前离线：已加载的搜索结果仍可查看，新搜索和筛选暂不可用。',
  offlineEmptyDescription: '恢复网络后即可搜索全部知识库或当前知识库。',
  offlineEmptyTitle: '离线时无法读取搜索结果',
  pagingFailure: '后续结果未加载',
  scopeUnavailableDescription: '此范围不存在或你没有访问权限。',
  scopeUnavailableTitle: '无法访问此知识库',
  zeroDescription: '没有文档匹配当前关键词和筛选条件。',
  zeroTitle: '没有找到结果',
} as const;
