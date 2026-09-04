/**
 * @fileoverview 在抓取用户提供的 feed 前拒绝指向私网与环回地址的 URL。
 */

import { lookup } from 'node:dns/promises';

import { NewsApiError } from './news-api-client';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** IPv4 私网与保留段的 [上界a, 下界b, 上界b] 判定表。 */
const PRIVATE_IPV4_RANGES: readonly (readonly [number, number, number])[] = [
  [0, 0, 255],
  [10, 0, 255],
  [100, 64, 127],
  [127, 0, 255],
  [169, 254, 255],
  [172, 16, 31],
  [192, 168, 255],
];

/** 用于判断 IPv4 地址是否落在拒绝的私网或保留段内。 */
export function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) return true;
  const [a, b] = parts as [number, number, number, number];
  return PRIVATE_IPV4_RANGES.some(([rangeA, minB, maxB]) => a === rangeA && b >= minB && b <= maxB);
}

/** 用于把 IPv6 地址压缩为小写全展开形式的前缀判定输入。 */
function expandIpv6(ip: string): string {
  const [headPart = '', tailPart = ''] = ip.toLowerCase().split('::');
  const headParts = headPart === '' ? [] : headPart.split(':');
  const tailParts = tailPart === '' ? [] : tailPart.split(':');
  const missing = Math.max(8 - headParts.length - tailParts.length, 0);
  const zeros: string[] = new Array<string>(missing).fill('0');
  return [...headParts, ...zeros, ...tailParts].map((part) => part.padStart(4, '0')).join(':');
}

/** 用于判断 IPv6 地址是否为环回、唯一本地、链路本地或 IPv4 映射私网。 */
export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe8')) return true;
  if (lower.startsWith('::ffff:')) {
    const mapped = lower.slice(7);
    return mapped.includes('.') ? isPrivateIpv4(mapped) : true;
  }
  const expanded = expandIpv6(lower);
  return expanded.startsWith('fc00:') || expanded.startsWith('fe80:');
}

/** 用于判断解析出的地址是否落在拒绝的网段内。 */
export function isPrivateAddress(ip: string): boolean {
  return ip.includes('.') ? isPrivateIpv4(ip) : isPrivateIpv6(ip);
}

/** 用于校验 URL 协议且 DNS 解析结果不含私网地址，命中即抛 URL_NOT_ALLOWED。 */
export async function assertFetchableFeedUrl(feedUrl: string): Promise<void> {
  let hostname: string;
  try {
    const parsed = new URL(feedUrl);
    if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) throw new Error('protocol');
    hostname = parsed.hostname.replace(/^\[|\]$/gu, '');
  } catch {
    throw new NewsApiError('URL_NOT_ALLOWED', `feed url is not a valid http(s) url`);
  }
  let addresses: { address: string }[];
  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    throw new NewsApiError('URL_NOT_ALLOWED', `feed host cannot be resolved: ${hostname}`);
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw new NewsApiError('URL_NOT_ALLOWED', `feed host resolves to a blocked address`);
  }
}
