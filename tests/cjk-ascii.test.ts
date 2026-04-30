// okooo5km(十里)

import { describe, it, expect } from 'vitest'
import { renderAscii } from '../src/core/render-ascii.js'
import { displayWidth } from '../src/ascii/width.js'

function lines(out: string): string[] {
  return out.split('\n')
}

describe('CJK ASCII rendering', () => {
  it('flowchart node boxes align around CJK labels', () => {
    const out = renderAscii('graph LR\n  A[开始] --> B[结束]\n', { colorMode: 'none' })
    const rows = lines(out)
    const widths = new Set(rows.map((row) => displayWidth(row)))
    expect(widths.size).toBe(1)
    // top + bottom + middle border lines should all use the same character set
    expect(rows[0]).toContain('┌')
    expect(rows[0]).toContain('┐')
    expect(rows[rows.length - 1]).toContain('└')
    expect(rows[rows.length - 1]).toContain('┘')
    expect(out).toContain('开始')
    expect(out).toContain('结束')
  })

  it('multi-line CJK labels stay centered inside the box', () => {
    const out = renderAscii('graph TD\n  A[用户登录<br/>验证账号]\n', { colorMode: 'none' })
    const rows = lines(out).filter((r) => r.length > 0)
    const widths = new Set(rows.map((row) => displayWidth(row)))
    expect(widths.size).toBe(1)
    expect(out).toContain('用户登录')
    expect(out).toContain('验证账号')
  })

  it('CJK edge labels do not skew the diagram width', () => {
    const out = renderAscii('graph LR\n  A[开始] -->|成功| B[结束]\n', { colorMode: 'none' })
    const rows = lines(out)
    const widths = new Set(rows.map((row) => displayWidth(row)))
    expect(widths.size).toBe(1)
    expect(out).toContain('成功')
  })

  it('mixed ASCII + CJK labels keep horizontal alignment', () => {
    const out = renderAscii('graph LR\n  Server[API 服务器] --> DB[数据库]\n', {
      colorMode: 'none',
    })
    const rows = lines(out)
    const widths = new Set(rows.map((row) => displayWidth(row)))
    expect(widths.size).toBe(1)
    expect(out).toContain('API 服务器')
    expect(out).toContain('数据库')
  })

  it('sequence diagram with CJK actors and messages renders aligned', () => {
    const src =
      'sequenceDiagram\n' +
      '  participant 用户\n' +
      '  participant 服务器\n' +
      '  用户->>服务器: 登录请求\n' +
      '  服务器-->>用户: 返回结果\n'
    const out = renderAscii(src, { colorMode: 'none' })
    const rows = lines(out).filter((r) => r.length > 0)
    // every line should be the same display width — this is what was broken
    const widths = new Set(rows.map((row) => displayWidth(row)))
    expect(widths.size).toBe(1)
    expect(out).toContain('用户')
    expect(out).toContain('服务器')
    expect(out).toContain('登录请求')
    expect(out).toContain('返回结果')
  })

  it('snapshot: simple flowchart with CJK', () => {
    const out = renderAscii(
      'graph LR\n  A[用户] --> B[处理数据]\n  B --> C[结果]\n',
      { colorMode: 'none' },
    )
    expect(out).toMatchInlineSnapshot(`
      "┌──────┐     ┌──────────┐     ┌──────┐
      │      │     │          │     │      │
      │ 用户 ├────►│ 处理数据 ├────►│ 结果 │
      │      │     │          │     │      │
      └──────┘     └──────────┘     └──────┘"
    `)
  })
})

describe('displayWidth helper', () => {
  it('counts CJK as 2 and ASCII as 1', () => {
    expect(displayWidth('A')).toBe(1)
    expect(displayWidth('中')).toBe(2)
    expect(displayWidth('A中B')).toBe(4)
    expect(displayWidth('用户登录')).toBe(8)
  })

  it('treats box-drawing as single-width', () => {
    expect(displayWidth('┌─┐')).toBe(3)
    expect(displayWidth('│')).toBe(1)
  })
})
