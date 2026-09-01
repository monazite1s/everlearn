/** @fileoverview 组合搜索输入、只读范围摘要与可深链筛选控件。 */

'use client';

import type { KeyboardEvent } from 'react';
import { SearchIcon } from 'lucide-react';

import { SEARCH_QUERY_MAX_LENGTH, type SearchField } from '@everlearn/contracts';
import {
  Button,
  Field,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@everlearn/ui';

import type { SearchFilters, UpdatedWithin } from './search-url';

interface SearchControlsProps {
  readonly disabled: boolean;
  readonly filters: SearchFilters;
  readonly onChange: (next: SearchFilters) => void;
  readonly onSearchAll: () => void;
  readonly onSubmit: () => void;
  readonly readOnly: boolean;
  readonly scopeLoading: boolean;
  readonly scopeName?: string;
}

/** 用于把单字段修改归并到完整筛选状态。 */
function updateFilter<K extends keyof SearchFilters>(
  filters: SearchFilters,
  key: K,
  value: SearchFilters[K],
): SearchFilters {
  return { ...filters, [key]: value };
}

/** 用于渲染可持续感知的当前搜索范围。 */
function SearchScopeSummary(
  props: Pick<
    SearchControlsProps,
    'filters' | 'onSearchAll' | 'readOnly' | 'scopeLoading' | 'scopeName'
  >,
) {
  if (props.filters.scope === 'all') {
    return <p className="m-0 text-sm text-muted-foreground">正在搜索全部知识库</p>;
  }
  if (props.scopeLoading) return <Skeleton aria-label="正在读取搜索范围" className="h-5 w-48" />;
  if (!props.scopeName) {
    return <p className="m-0 text-sm text-muted-foreground">当前知识库不可访问</p>;
  }
  return (
    <div className="flex min-w-0 flex-col items-start gap-2 md:flex-row md:items-center">
      <p className="m-0 min-w-0 truncate text-sm text-muted-foreground">
        当前知识库：<span className="font-medium text-foreground">{props.scopeName}</span>
      </p>
      <Button disabled={props.readOnly} onClick={props.onSearchAll} size="sm" variant="ghost">
        搜索全部知识库
      </Button>
    </div>
  );
}

/** 用于渲染一个持续标签的 shadcn Select。 */
function SearchSelect<T extends string>(props: {
  readonly disabled: boolean;
  readonly label: string;
  readonly onChange: (value: T) => void;
  readonly options: readonly { readonly label: string; readonly value: T }[];
  readonly value: T;
}) {
  return (
    <Field>
      <FieldLabel>{props.label}</FieldLabel>
      <Select disabled={props.disabled} onValueChange={props.onChange} value={props.value}>
        <SelectTrigger className="w-full" aria-label={props.label}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>{props.label}</SelectLabel>
            {props.options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </Field>
  );
}

/** 用于渲染搜索输入并让 Enter 跳过防抖。 */
function SearchQueryField(props: SearchControlsProps) {
  const onKeyDown = /** 用于在非组合输入时立即提交 Enter。 */ (
    event: KeyboardEvent<HTMLInputElement>,
  ): void => {
    if (event.key === 'Enter' && !event.nativeEvent.isComposing) props.onSubmit();
  };
  return (
    <Field>
      <FieldLabel htmlFor="global-search-query">搜索关键词</FieldLabel>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          aria-describedby="global-search-help"
          className="pl-10"
          data-route-focus
          disabled={props.disabled}
          id="global-search-query"
          maxLength={SEARCH_QUERY_MAX_LENGTH}
          onChange={(event) =>
            props.onChange(updateFilter(props.filters, 'query', event.target.value))
          }
          onKeyDown={onKeyDown}
          placeholder="搜索文档标题与正文"
          readOnly={props.readOnly}
          type="search"
          value={props.filters.query}
        />
      </div>
      <p className="m-0 text-xs text-muted-foreground" id="global-search-help">
        停止输入 300 毫秒后搜索；按 Enter 立即搜索。
      </p>
    </Field>
  );
}

/** 用于组合搜索输入、范围摘要和两项筛选。 */
export function SearchControls(props: SearchControlsProps) {
  return (
    <div className="grid gap-4">
      <SearchQueryField {...props} />
      <SearchScopeSummary {...props} />
      <FieldGroup className="grid gap-4 md:grid-cols-2">
        <SearchSelect<SearchField>
          disabled={props.disabled || props.readOnly}
          label="搜索字段"
          onChange={(field) => props.onChange(updateFilter(props.filters, 'field', field))}
          options={[
            { label: '标题与正文', value: 'all' },
            { label: '仅标题', value: 'title' },
            { label: '仅正文', value: 'content' },
          ]}
          value={props.filters.field}
        />
        <SearchSelect<UpdatedWithin>
          disabled={props.disabled || props.readOnly}
          label="更新时间"
          onChange={(range) => props.onChange(updateFilter(props.filters, 'updatedWithin', range))}
          options={[
            { label: '不限时间', value: 'any' },
            { label: '过去 24 小时', value: '24h' },
            { label: '过去 7 天', value: '7d' },
            { label: '过去 30 天', value: '30d' },
          ]}
          value={props.filters.updatedWithin}
        />
      </FieldGroup>
    </div>
  );
}
