/**
 * @fileoverview 验证 feed 抓取前的私网地址与协议守卫。
 */

import { describe, expect, it } from 'vitest';

import { isPrivateAddress, isPrivateIpv4, isPrivateIpv6 } from './url-guard';

describe('isPrivateIpv4', () => {
  it('拒绝环回、私网与链路本地段', () => {
    expect(isPrivateIpv4('127.0.0.1')).toBe(true);
    expect(isPrivateIpv4('10.1.2.3')).toBe(true);
    expect(isPrivateIpv4('172.16.0.9')).toBe(true);
    expect(isPrivateIpv4('192.168.1.1')).toBe(true);
    expect(isPrivateIpv4('169.254.10.10')).toBe(true);
    expect(isPrivateIpv4('100.64.0.1')).toBe(true);
    expect(isPrivateIpv4('0.1.2.3')).toBe(true);
  });

  it('放行公网地址', () => {
    expect(isPrivateIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateIpv4('172.32.0.1')).toBe(false);
    expect(isPrivateIpv4('100.128.0.1')).toBe(false);
  });
});

describe('isPrivateIpv6', () => {
  it('拒绝环回、唯一本地与链路本地', () => {
    expect(isPrivateIpv6('::1')).toBe(true);
    expect(isPrivateIpv6('fd00::1')).toBe(true);
    expect(isPrivateIpv6('fe80::1')).toBe(true);
    expect(isPrivateIpv6('fc00::abcd')).toBe(true);
  });

  it('拒绝 IPv4 映射的私网地址', () => {
    expect(isPrivateIpv6('::ffff:192.168.1.1')).toBe(true);
    expect(isPrivateIpv6('::ffff:127.0.0.1')).toBe(true);
  });

  it('放行公网 IPv6', () => {
    expect(isPrivateIpv6('2606:4700::1111')).toBe(false);
    expect(isPrivateIpv6('::ffff:8.8.8.8')).toBe(false);
  });
});

describe('isPrivateAddress', () => {
  it('按地址族分派判定', () => {
    expect(isPrivateAddress('192.168.0.1')).toBe(true);
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
  });
});
